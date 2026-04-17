// POST /api/biotech/engagements/[id]/regenerate-draft
// Takes an existing draft and a list of items the user wants incorporated,
// returns a rewritten email that covers them naturally as proper sentences.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { biotechClaude } from '@biotech/lib/claude';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { draft_subject, draft_body, extra_items, cro_name } =
    body as { draft_subject?: string; draft_body?: string; extra_items?: string[]; cro_name?: string };

  if (!draft_body?.trim()) {
    return NextResponse.json({ error: 'draft_body is required' }, { status: 400 });
  }
  const items = Array.isArray(extra_items) ? extra_items : [];

  // Verify engagement belongs to this user
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  const croLabel = cro_name ?? 'the CRO';

  const addSection = items.length > 0
    ? `\n\nThe scientist also wants the email to cover these additional points:\n${items.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nIncorporate all of them naturally as proper, fluent sentences.`
    : `\n\nSome items the email was originally asking about may now be resolved. Clean up the draft so it only asks about genuinely outstanding items. Keep the same professional tone.`;

  const prompt = `You are helping a biotech scientist refine a follow-up email to ${croLabel}.

Here is the current draft:
---
${draft_body.trim()}
---
${addSection}

Keep total length 200-260 words. Do not use bullet points or numbered lists inside the email body.
Do not mention compound names, mechanisms of action, or disease indications.
Return ONLY the rewritten email body — no subject line, no preamble, no markdown.`;

  const newBody = await biotechClaude({ userPrompt: prompt, maxTokens: 600 });

  return NextResponse.json({
    draft_subject: draft_subject ?? '',
    draft_body:    newBody.trim(),
  });
}
