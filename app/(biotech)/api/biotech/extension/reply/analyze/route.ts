// POST /api/biotech/extension/reply/analyze
// Analyzes an incoming CRO reply email: gap analysis + engagement matching.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { biotechClaude } from '@biotech/lib/claude';

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { email_body, sender_email } = body as { email_body: string; sender_email?: string };
  if (!email_body) return NextResponse.json({ error: 'email_body is required' }, { status: 400 });

  // Try to match to an existing engagement by sender email
  let engagement: { id: string; cro_name: string; stage: string } | null = null;
  let originalOutreach = '';

  if (sender_email) {
    const { data: eng } = await supabase
      .from('cro_engagements')
      .select('id, cro_name, stage')
      .eq('user_id', user.id)
      .ilike('cro_email', sender_email.trim())
      .not('stage', 'in', '(enquiry_draft,awarded,closed)')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (eng) {
      engagement = eng as { id: string; cro_name: string; stage: string };

      // Fetch the original outreach for context
      const { data: msg } = await supabase
        .from('engagement_messages')
        .select('body')
        .eq('engagement_id', eng.id)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (msg?.body) originalOutreach = msg.body as string;
    }
  }

  const croName = engagement?.cro_name ?? 'the CRO';

  const prompt = `Analyse this reply from ${croName} to a preclinical CRO capability enquiry.
${originalOutreach ? `\nThe original enquiry asked:\n---\n${originalOutreach.slice(0, 600)}\n---\n` : ''}
CRO reply:
---
${email_body.slice(0, 2000)}
---

Return a JSON object (no markdown fences):
{
  "cro_summary": "<one sentence — what is the headline of their response?>",
  "confirmed": ["<things they explicitly confirmed — capabilities, accreditations, availability>"],
  "unaddressed": ["<topics from the enquiry they did not address>"],
  "concerns": ["<any red flags, limitations, or concerns they raised>"],
  "suggested_questions": ["<2-3 follow-up questions worth raising in a reply>"]
}`;

  const raw = await biotechClaude({ userPrompt: prompt, maxTokens: 800 });
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let analysis: Record<string, unknown>;
  try { analysis = JSON.parse(cleaned); }
  catch { return NextResponse.json({ error: 'AI analysis failed — try again' }, { status: 500 }); }

  return NextResponse.json({
    engagement_id: engagement?.id ?? null,
    cro_name:      engagement?.cro_name ?? null,
    gap_analysis:  analysis,
  });
}
