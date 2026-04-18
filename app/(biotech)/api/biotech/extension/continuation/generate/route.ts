// POST /api/biotech/extension/continuation/generate
// Generates a contextual follow-up email for an ongoing CRO engagement.
// CRITICAL: never passes compound name, MOA, or indication to Claude.

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

  const { engagement_id, cro_name, current_subject, include_subject } =
    body as { engagement_id: string; cro_name: string; current_subject?: string; include_subject?: boolean };

  if (!engagement_id || !cro_name) {
    return NextResponse.json({ error: 'engagement_id and cro_name are required' }, { status: 400 });
  }

  // Verify engagement belongs to user
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, stage, brief_id')
    .eq('id', engagement_id)
    .eq('user_id', user.id)
    .single();

  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  // Fetch recent message history (last 4 messages) for context — bodies only, no IP fields
  const { data: messages } = await supabase
    .from('engagement_messages')
    .select('direction, subject, sent_at')
    .eq('engagement_id', engagement_id)
    .order('sent_at', { ascending: false })
    .limit(4);

  const stage = engagement.stage ?? 'enquiry_sent';
  const msgSummary = (messages ?? []).reverse().map(m =>
    `${m.direction === 'outbound' ? 'We sent' : 'CRO sent'}: "${m.subject ?? '(no subject)'}"`
  ).join('\n') || 'No prior messages logged.';

  const prompt = `You are helping a biotech company write a professional follow-up email to a preclinical CRO called "${cro_name}".

Conversation stage: ${stage}
Recent message history:
${msgSummary}
${current_subject ? `Current email thread subject: "${current_subject}"` : ''}

Write a concise, professional follow-up email body (80-120 words) appropriate for this stage of the conversation.
The email should:
- Be contextual to the conversation stage — not a cold outreach
- Move the conversation forward (e.g. check on timeline, confirm next steps, request missing information)
- Be warm but professional
- Close with "Best regards,"

CRITICAL RULES:
- Do NOT mention compound names, drug targets, mechanisms of action, or disease indications
- Do NOT use placeholder text like "[Your Name]"
- No bullet points — flowing sentences only${include_subject ? '\n- Also suggest a new subject line on Line 1 as: Subject: [subject]' : ''}

Return only the email body text (plain text, no markdown).`;

  const raw = await biotechClaude({ userPrompt: prompt, maxTokens: 400 });

  let subject: string | null = null;
  let emailBody = raw.trim();

  if (include_subject) {
    const lines = emailBody.split('\n');
    if (lines[0].toLowerCase().startsWith('subject:')) {
      subject = lines[0].replace(/^subject:\s*/i, '').trim();
      emailBody = lines.slice(lines[1]?.trim() === '' ? 2 : 1).join('\n').trim();
    }
  }

  return NextResponse.json({ body: emailBody, subject });
}
