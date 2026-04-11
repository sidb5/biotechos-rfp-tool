// POST /api/biotech/engagements/[id]/meeting-invite
// Generates an AI-drafted meeting invite email for a CRO engagement.
// Requires user's scheduling_link to be set in biotech_user_settings.
// Saves draft to engagement_messages and returns subject + body + message_id.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Map classification to human-readable study type for email context
const STUDY_TYPE_LABEL: Record<string, string> = {
  tox:         'toxicology',
  pk:          'PK/DMPK',
  efficacy:    'in vivo efficacy',
  in_vitro:    'in vitro',
  combination: 'multi-modality preclinical',
  other:       'preclinical',
};

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const engagementId = params.id;

  // Load engagement + brief safe fields
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, cro_email, stage, brief_id, rfp_internal_briefs(title, classification, extracted_data)')
    .eq('id', engagementId)
    .eq('user_id', user.id)
    .single();

  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  // Load user settings — need scheduling_link and display name
  const { data: settings } = await supabase
    .from('biotech_user_settings')
    .select('scheduling_link, sender_display_name, company_name')
    .eq('user_id', user.id)
    .maybeSingle();

  const schedulingLink = settings?.scheduling_link?.trim() ?? '';
  if (!schedulingLink) {
    return NextResponse.json({ error: 'no_scheduling_link' }, { status: 422 });
  }

  // Check for existing unsent draft — return it instead of regenerating
  const { data: existingDraft } = await supabase
    .from('engagement_messages')
    .select('id, subject, body')
    .eq('engagement_id', engagementId)
    .eq('message_type', 'meeting_invite')
    .eq('status', 'draft')
    .maybeSingle();

  if (existingDraft) {
    return NextResponse.json({
      message_id: existingDraft.id,
      subject:    existingDraft.subject,
      body:       existingDraft.body,
      from_cache: true,
    });
  }

  // Build context for Claude — IP-safe fields only
  const brief = engagement.rfp_internal_briefs as {
    title: string | null;
    classification: string | null;
    extracted_data: Record<string, unknown> | null;
  } | null;

  const classification = brief?.classification ?? 'other';
  const studyTypeLabel = STUDY_TYPE_LABEL[classification] ?? 'preclinical';
  const ext = (brief?.extracted_data ?? {}) as Record<string, { value: unknown }>;
  const glp     = (ext.glp_requirement?.value as string | null) ?? null;
  const company = settings?.company_name?.trim() || 'our company';
  const senderName = settings?.sender_display_name?.trim() || (user.email?.split('@')[0] ?? 'the team');

  const prompt = `Draft a short, professional meeting request email to ${engagement.cro_name}.

Context:
- Study type: ${studyTypeLabel}${glp ? ` (${glp})` : ''}
- We have exchanged initial capability enquiry emails and are now ready to discuss requirements further
- The recipient is a CRO contact we have been corresponding with
- Booking link: ${schedulingLink}
- Sender name: ${senderName}, ${company}

Requirements:
1. 100–150 words maximum — keep it concise
2. Thank them for their responses to the enquiry
3. Propose a 30-minute call to discuss the study requirements in more detail
4. Embed the booking link naturally (e.g. "Book a convenient time here: [link]")
5. Professional but warm tone
6. Do NOT include any compound names, drug mechanisms, disease indications, or internal programme details
7. Return only the email body text — no subject line, no "Subject:", no sign-off header`;

  let body: string;
  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 400,
      system:     'You are helping a biotech company communicate with CROs professionally. Write concise, clear emails. Never include compound names, mechanisms of action, or disease indications.',
      messages:   [{ role: 'user', content: prompt }],
    });
    body = (response.content[0] as { type: string; text: string }).text.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[meeting-invite] Claude error:', msg);
    return NextResponse.json({ error: `AI generation failed: ${msg}` }, { status: 500 });
  }

  // Build subject line per spec
  const subject = `Meeting request — ${studyTypeLabel} study — ${company}`;

  // Save as draft message
  const { data: saved, error: saveErr } = await supabase
    .from('engagement_messages')
    .insert({
      engagement_id: engagementId,
      direction:     'outbound',
      message_type:  'meeting_invite',
      subject,
      body,
      status:        'draft',
      ai_generated:  true,
    })
    .select('id')
    .single();

  if (saveErr || !saved) {
    console.error('[meeting-invite] Save error:', saveErr);
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
  }

  return NextResponse.json({ message_id: saved.id, subject, body });
}
