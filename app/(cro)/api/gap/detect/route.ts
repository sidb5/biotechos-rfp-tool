// POST /api/gap/detect
// Runs gap analysis for a proposal: cross-references RFP requirements against
// CRO profile + knowledge repo, returns array of Gap objects.
// Body: { proposal_id: string }

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { anthropic } from '@shared/lib/claude';
import { SYSTEM_PROMPT } from '@cro/prompts/index';
import { gapDetectionPrompt } from '@cro/prompts/gap-detection';
import type { CROProfile, Gap } from '@cro/types';

// TODO: upgrade to vector retrieval (pgvector) when repo exceeds ~25 docs
const MAX_REPO_CHARS = 80_000;

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let proposalId: string;
  try {
    const body = await request.json();
    proposalId = body.proposal_id;
    if (!proposalId) throw new Error('missing proposal_id');
  } catch {
    return NextResponse.json({ error: 'proposal_id is required' }, { status: 400 });
  }

  // Fetch proposal → verify ownership
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, rfp_id, cro_id')
    .eq('id', proposalId)
    .single();

  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('*')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rfp } = await supabase
    .from('rfps')
    .select('raw_text, parsed_summary')
    .eq('id', proposal.rfp_id)
    .single();

  if (!rfp) return NextResponse.json({ error: 'RFP not found' }, { status: 404 });

  // Pull knowledge repo docs (most recent first, truncate at 80k chars)
  let knowledgeRepoContent: string | undefined;
  try {
    const { data: repoDocs } = await supabase
      .from('knowledge_repo_docs')
      .select('filename, raw_text')
      .eq('cro_user_id', user.id)
      .order('created_at', { ascending: false });

    if (repoDocs && repoDocs.length > 0) {
      let combined = '';
      for (const doc of repoDocs) {
        const chunk = `\n--- ${doc.filename} ---\n${doc.raw_text}\n`;
        if (combined.length + chunk.length > MAX_REPO_CHARS) break;
        combined += chunk;
      }
      if (combined.trim()) knowledgeRepoContent = combined;
    }
  } catch {
    // Table may not exist yet — gap detection still runs against profile only
  }

  const prompt = gapDetectionPrompt({
    rfpText: rfp.raw_text as string,
    parsedRFP: (rfp.parsed_summary ?? {}) as Record<string, unknown>,
    profile: profile as CROProfile,
    knowledgeRepoContent,
  });

  let gaps: Gap[];
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = message.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type');

    const rawJson = block.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    gaps = JSON.parse(rawJson) as Gap[];
    if (!Array.isArray(gaps)) throw new Error('Response was not an array');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[gap/detect] Claude error:', msg);
    return NextResponse.json(
      { error: `Gap analysis failed: ${msg}` },
      { status: 502 }
    );
  }

  // Cache detected gaps on the proposal so the panel doesn't re-run detection on every reload
  await supabase.from('proposals').update({ detected_gaps: gaps }).eq('id', proposalId);

  return NextResponse.json({
    gaps,
    has_knowledge_repo: !!knowledgeRepoContent,
  });
}
