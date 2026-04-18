// POST /api/biotech/extension/reply/generate
// Generates a follow-up reply email incorporating selected gap items.

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

  const { cro_name, selected_items, original_subject } = body as {
    cro_name?: string;
    selected_items: string[];
    original_subject?: string;
  };

  if (!Array.isArray(selected_items) || selected_items.length === 0) {
    return NextResponse.json({ error: 'selected_items[] is required' }, { status: 400 });
  }

  const croLabel = cro_name ?? 'the CRO';
  const itemList = selected_items.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const prompt = `You are helping a biotech scientist write a follow-up email to ${croLabel} after receiving their initial response to a capability enquiry.

The scientist wants to follow up on these specific points:
${itemList}

Write a professional follow-up email (120-160 words) that:
- Opens warmly, thanking them for their response
- Addresses each of the points above as clear, flowing sentences (NOT a bulleted list)
- Closes by requesting a response or a brief call

CRITICAL: Do NOT mention compound names, mechanisms of action, or disease indications.
Return ONLY:
Line 1: Subject: Re: ${original_subject ?? 'Capability Enquiry'}
Line 2: (blank)
Lines 3+: Email body (plain text, no markdown, no bullet points)`;

  const raw = await biotechClaude({ userPrompt: prompt, maxTokens: 500 });

  const lines = raw.trim().split('\n');
  let subject = `Re: ${original_subject ?? 'Capability Enquiry'}`;
  let bodyLines = lines;

  if (lines[0].toLowerCase().startsWith('subject:')) {
    subject = lines[0].replace(/^subject:\s*/i, '').trim();
    bodyLines = lines.slice(lines[1]?.trim() === '' ? 2 : 1);
  }

  return NextResponse.json({ subject, body: bodyLines.join('\n').trim() });
}
