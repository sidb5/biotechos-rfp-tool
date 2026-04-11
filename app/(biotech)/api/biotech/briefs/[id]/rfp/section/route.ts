// POST /api/biotech/briefs/[id]/rfp/section
// Regenerates a single RFP section and saves it.
// Body: { section: SectionKey }
// Returns: { section, text, completeness_score }
// Delegates to the same prompt builder as the full generate route.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import {
  SECTION_KEYS,
  SECTION_META,
  buildSectionPrompt,
  type SectionKey,
  type RfpContext,
} from '@biotech/prompts/rfp';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function scoreCompleteness(doc: Record<string, unknown>): number {
  let filled = 0;
  let toBeFilled = 0;
  for (const key of SECTION_KEYS) {
    const text = (doc[key] as string | null) ?? '';
    if (text.length > 50) {
      filled++;
      if (text.includes('[TO BE SPECIFIED]')) toBeFilled++;
    }
  }
  const sectionScore = (filled / SECTION_KEYS.length) * 70;
  const gapPenalty   = Math.min(toBeFilled * 5, 30);
  return Math.round(Math.max(0, sectionScore + 30 - gapPenalty));
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const briefId = params.id;

  let body: { section?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const section = body.section as SectionKey | undefined;
  if (!section || !(SECTION_KEYS as readonly string[]).includes(section)) {
    return NextResponse.json({ error: `Invalid section key. Must be one of: ${SECTION_KEYS.join(', ')}` }, { status: 400 });
  }

  // Load brief
  const { data: brief } = await supabase
    .from('rfp_internal_briefs')
    .select('extracted_data, rfp_context_notes')
    .eq('id', briefId)
    .eq('user_id', user.id)
    .single();

  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 });

  // Load existing RFP doc (for rfp_id + completeness recalc)
  const { data: rfpDoc } = await supabase
    .from('rfp_documents')
    .select('*')
    .eq('brief_id', briefId)
    .maybeSingle();

  if (!rfpDoc) return NextResponse.json({ error: 'No RFP document found. Generate the full RFP first.' }, { status: 404 });

  // Load settings
  const { data: settings } = await supabase
    .from('biotech_user_settings')
    .select('company_name, sender_display_name, sender_email')
    .eq('user_id', user.id)
    .maybeSingle();

  // Load thread summaries
  const { data: engagements } = await supabase
    .from('cro_engagements')
    .select('cro_name, engagement_messages(direction, body, created_at)')
    .eq('brief_id', briefId)
    .eq('user_id', user.id)
    .neq('stage', 'enquiry_draft');

  const threadSummaries = (engagements ?? []).map(eng => {
    const msgs = ((eng.engagement_messages ?? []) as { direction: string; body: string | null; created_at: string }[])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-3)
      .map(m => `${m.direction === 'outbound' ? 'Biotech' : eng.cro_name}: ${(m.body ?? '').slice(0, 200)}`)
      .join('\n');
    return { cro_name: eng.cro_name, summary: msgs };
  });

  const ctx: RfpContext = {
    rfpId:           (rfpDoc as { rfp_id?: string }).rfp_id ?? 'RFP-DRAFT',
    companyName:     settings?.company_name       ?? '[Company Name]',
    contactName:     settings?.sender_display_name ?? '[Contact Name]',
    contactEmail:    settings?.sender_email        ?? '[Contact Email]',
    issueDate:       new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    extractedData:   (brief.extracted_data ?? {}) as Record<string, { value: string | null; tag: string }>,
    rfpContextNotes: (brief.rfp_context_notes ?? []) as { text: string; type: string; source_cro_name: string }[],
    threadSummaries,
  };

  // Generate the section
  let text: string;
  try {
    const prompt = buildSectionPrompt(section, ctx);
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: SECTION_META[section].maxTokens,
      system:     'You are an expert preclinical study RFP writer. Write formally and precisely. Use [TO BE SPECIFIED] for unknown content. Never invent data.',
      messages:   [{ role: 'user', content: prompt }],
    });
    text = (response.content[0] as { type: string; text: string }).text.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Claude generation failed: ${msg}` }, { status: 500 });
  }

  // Save to rfp_documents and recalculate completeness
  const updatedDoc = { ...(rfpDoc as Record<string, unknown>), [section]: text };
  const score = scoreCompleteness(updatedDoc);

  await supabase
    .from('rfp_documents')
    .update({ [section]: text, completeness_score: score, updated_at: new Date().toISOString() })
    .eq('brief_id', briefId);

  return NextResponse.json({ section, text, completeness_score: score });
}
