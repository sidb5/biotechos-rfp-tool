// POST /api/biotech/extension/outreach/generate
// Generates an IP-safe CRO capability enquiry email from a study brief.
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

  const { brief_id, cro_names } = body as { brief_id: string; cro_names?: string[] };
  if (!brief_id) return NextResponse.json({ error: 'brief_id is required' }, { status: 400 });

  // Fetch brief — only safe, non-identifying fields
  const { data: brief } = await supabase
    .from('rfp_internal_briefs')
    .select('id, title, classification, extracted_data')
    .eq('id', brief_id)
    .eq('user_id', user.id)
    .single();

  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 });

  // Build IP-safe context — NEVER include compound, target, MOA, indication
  const ed = (brief.extracted_data ?? {}) as Record<string, { value?: string } | undefined>;
  const safeLines = [
    brief.classification ? `Study type: ${brief.classification}` : null,
    ed.study_design?.value ? `Study design: ${ed.study_design.value}` : null,
    ed.glp_requirement?.value ? `Regulatory requirement: ${ed.glp_requirement.value}` : null,
    ed.species_model?.value ? `Species / model: ${ed.species_model.value}` : null,
    ed.timeline?.value ? `Desired timeline: ${ed.timeline.value}` : null,
    ed.budget_range?.value ? `Budget range: ${ed.budget_range.value}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `You are helping a biotech scientist write an initial capability enquiry to a preclinical CRO.
This email will be sent individually to each CRO with their name personalised in the greeting.

Study context (IP-safe — no compound name, mechanism, or indication):
${safeLines || 'Preclinical study (details withheld for IP reasons)'}

Write a professional, concise capability enquiry email (130-170 words) that:
- Opens with the greeting: "Dear {{CRO_NAME}} team," (use this exact placeholder — it will be replaced per recipient)
- Second sentence: "We are a biotech company evaluating CRO partners for a preclinical study"
- Briefly states the study type and key parameters from the context above
- Asks specifically about: relevant capabilities/accreditations, current capacity / expected timeline, and indicative pricing
- Requests either a brief call or written response within 10 business days
- Closes with: "Best regards,"

CRITICAL RULES:
- Do NOT mention any compound names, drug targets, mechanisms of action, or disease indications
- Do NOT use placeholder text like "[Your Name]" — write the closing as "Best regards," only
- No bullet points in the email body — proper flowing sentences
- The greeting MUST be exactly "Dear {{CRO_NAME}} team,"

Return ONLY two things:
Line 1: Subject: [subject line]
Line 2: (blank)
Lines 3+: Email body text (plain text, no markdown)`;

  const raw = await biotechClaude({ userPrompt: prompt, maxTokens: 600 });

  const lines = raw.trim().split('\n');
  let subject = brief.title ?? 'CRO Capability Enquiry';
  let bodyLines = lines;

  if (lines[0].toLowerCase().startsWith('subject:')) {
    subject = lines[0].replace(/^subject:\s*/i, '').trim();
    bodyLines = lines.slice(lines[1]?.trim() === '' ? 2 : 1);
  }

  return NextResponse.json({ subject, body: bodyLines.join('\n').trim() });
}
