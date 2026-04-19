// POST /api/biotech/engagements/[id]/generate-followup
// Generates a follow-up email draft on demand from the latest meeting debrief
// + any unresolved email gaps. Used when meeting notes were logged but no draft
// was auto-generated (e.g. notes logged before auto-draft feature existed).
// Returns { subject, body, message_id }

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { biotechClaude } from '@biotech/lib/claude';

const SAFE_FIELD_KEYS = [
  'study_type', 'assay_types', 'species_model', 'group_sizes',
  'primary_endpoints', 'timeline_requirements', 'glp_requirement',
  'key_deliverables', 'budget_range', 'special_requirements',
];

function safeBriefContext(extractedData: Record<string, { value: unknown; tag?: string }>): string {
  return SAFE_FIELD_KEYS
    .map(key => {
      const field = extractedData[key];
      if (!field || field.value === null || field.value === undefined) return null;
      return `- ${key.replace(/_/g, ' ')}: ${field.value}`;
    })
    .filter(Boolean)
    .join('\n');
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const engagementId = params.id;

  // Verify ownership and get context
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, brief_id, rfp_internal_briefs(extracted_data)')
    .eq('id', engagementId)
    .eq('user_id', user.id)
    .single();

  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  // Load the most recent meeting debrief
  const { data: meeting } = await supabase
    .from('engagement_meetings')
    .select('ai_summary')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const debrief = meeting?.ai_summary as {
    gaps_resolved:   string[];
    new_concerns:    string[];
    rfp_refinements: string[];
    open_questions:  string[];
  } | null;

  if (!debrief) {
    return NextResponse.json({ error: 'No meeting debrief found for this engagement' }, { status: 404 });
  }

  // Load unresolved email gaps from the most recent sent/draft followup message
  const { data: messages } = await supabase
    .from('engagement_messages')
    .select('direction, message_type, body, ai_metadata')
    .eq('engagement_id', engagementId)
    .neq('message_type', 'meeting_notes')
    .order('created_at', { ascending: false })
    .limit(10);

  const emailDraft = (messages ?? []).find(
    m => m.direction === 'outbound' && m.message_type === 'followup'
  );
  const emailMeta = emailDraft?.ai_metadata as {
    gap_analysis?: { unaddressed?: string[]; concerns?: string[] };
    resolved_items?: string[];
  } | null;
  const unresolvedEmailGaps: string[] = [];
  if (emailMeta?.gap_analysis) {
    const resolved = new Set(emailMeta.resolved_items ?? []);
    for (const t of emailMeta.gap_analysis.unaddressed ?? []) {
      if (!resolved.has(t)) unresolvedEmailGaps.push(t);
    }
    for (const t of emailMeta.gap_analysis.concerns ?? []) {
      if (!resolved.has(t)) unresolvedEmailGaps.push(t);
    }
  }

  // Build brief context
  const briefRaw = Array.isArray(engagement.rfp_internal_briefs)
    ? engagement.rfp_internal_briefs[0]
    : engagement.rfp_internal_briefs;
  const brief = briefRaw as unknown as { extracted_data: Record<string, { value: unknown; tag?: string }> | null } | null;
  const briefContext = brief?.extracted_data ? safeBriefContext(brief.extracted_data) : '(no brief data)';

  // Load sender company name
  let senderCompany: string | null = null;
  try {
    const { data: settings } = await supabase
      .from('biotech_user_settings')
      .select('company_name')
      .eq('user_id', user.id)
      .maybeSingle();
    if (settings?.company_name) senderCompany = settings.company_name;
  } catch { /* ignore */ }

  const fromLine = senderCompany ? ` at ${senderCompany}` : '';
  const openFromMeeting = [...(debrief.open_questions ?? []), ...(debrief.new_concerns ?? [])];

  if (openFromMeeting.length === 0 && unresolvedEmailGaps.length === 0) {
    return NextResponse.json({ error: 'No open items to generate a follow-up for' }, { status: 400 });
  }

  const meetingSection = openFromMeeting.length > 0
    ? `\nFrom our meeting:\n${openFromMeeting.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : '';
  const emailSection = unresolvedEmailGaps.length > 0
    ? `\nStill outstanding from prior emails:\n${unresolvedEmailGaps.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : '';

  const prompt = `You are helping a biotech scientist${fromLine} draft a follow-up email to ${engagement.cro_name} after a recent meeting.

Study context (IP-safe):
${briefContext}

Open items that need to be addressed:
${meetingSection}
${emailSection}

Write a professional, concise follow-up email (150–220 words) that:
1. Opens with a brief thank-you for the meeting
2. Addresses each open item as a clear, direct question
3. Sets expectations for next steps
4. Does NOT include compound names, MOA, or disease indications
5. Does NOT use bullet points or numbered lists inside the email body

Return a JSON object:
{
  "subject": "...",
  "body": "..."
}

Return valid JSON only — no markdown, no explanation outside the JSON.`;

  let parsed: { subject: string; body: string };
  try {
    const raw = await biotechClaude({ userPrompt: prompt, maxTokens: 800 });
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    parsed = JSON.parse(cleaned) as { subject: string; body: string };
    if (!parsed.subject || !parsed.body) throw new Error('Invalid shape');
  } catch (err) {
    console.error('[generate-followup] Claude error:', err);
    return NextResponse.json({ error: 'AI generation failed — please try again' }, { status: 500 });
  }

  // Save draft to engagement_messages
  const { data: draftMsg } = await supabase
    .from('engagement_messages')
    .insert({
      engagement_id: engagementId,
      direction:     'outbound',
      message_type:  'followup',
      subject:       parsed.subject,
      body:          parsed.body,
      status:        'draft',
      ai_generated:  true,
      ai_metadata: {
        gap_analysis: {
          confirmed:   debrief.gaps_resolved ?? [],
          unaddressed: debrief.open_questions ?? [],
          concerns:    debrief.new_concerns   ?? [],
        },
        resolved_items: [],
      },
    })
    .select('id')
    .single();

  if (!draftMsg) {
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
  }

  return NextResponse.json({
    subject:    parsed.subject,
    body:       parsed.body,
    message_id: draftMsg.id,
  });
}
