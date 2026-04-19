// POST /api/biotech/engagements/[id]/meeting-notes
// Saves meeting notes, runs AI debrief analysis (4 outputs), advances stage to meeting_done.
// Also inserts meeting notes into engagement_messages so they appear in the thread.
// Also generates a follow-up email draft when open items exist.
// Returns { meeting_id, debrief, followup_draft } where followup_draft may be null.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { biotechClaude } from '@biotech/lib/claude';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface DebriefOutput {
  gaps_resolved:   string[];
  new_concerns:    string[];
  rfp_refinements: string[];
  open_questions:  string[];
}

// IP-safe brief fields to pass as study context
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
      const label = key.replace(/_/g, ' ');
      return `- ${label}: ${field.value}`;
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

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { notes, meeting_date, attendees } = body as {
    notes?:        string;
    meeting_date?: string;
    attendees?:    string;
  };

  if (!notes?.trim()) {
    return NextResponse.json({ error: 'Meeting notes are required' }, { status: 400 });
  }

  // Verify engagement ownership
  const { data: engagement } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, cro_email, stage, brief_id, rfp_internal_briefs(title, classification, extracted_data)')
    .eq('id', engagementId)
    .eq('user_id', user.id)
    .single();

  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  // Load prior message thread for context (last 8 messages, excluding meeting notes)
  const { data: messages } = await supabase
    .from('engagement_messages')
    .select('direction, message_type, subject, body, ai_metadata, created_at')
    .eq('engagement_id', engagementId)
    .neq('message_type', 'meeting_notes')
    .order('created_at', { ascending: false })
    .limit(8);

  const priorMsgs = (messages ?? []).reverse();

  const threadSummary = priorMsgs
    .map(m => `[${m.direction === 'outbound' ? 'You' : engagement.cro_name}]: ${(m.body ?? '').slice(0, 300)}`)
    .join('\n\n');

  // Extract unresolved email gap items from the most recent followup draft (if any)
  const emailDraft = priorMsgs.find(
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

  // Build IP-safe brief context
  const briefRaw = Array.isArray(engagement.rfp_internal_briefs)
    ? engagement.rfp_internal_briefs[0]
    : engagement.rfp_internal_briefs;
  const brief = briefRaw as unknown as {
    title: string | null;
    classification: string | null;
    extracted_data: Record<string, { value: unknown; tag?: string }> | null;
  } | null;

  const briefContext = brief?.extracted_data
    ? safeBriefContext(brief.extracted_data)
    : '(no structured brief data available)';

  // ── Claude debrief prompt ─────────────────────────────────────────────────
  const prompt = `You are helping a biotech company debrief after a call with ${engagement.cro_name}.

Study context (IP-safe fields only):
${briefContext}

Prior email thread:
${threadSummary || '(no prior messages)'}

Meeting notes / transcript:
${notes.trim()}

Analyse the meeting notes and return a JSON object with EXACTLY these four fields:
{
  "gaps_resolved": ["..."],
  "new_concerns": ["..."],
  "rfp_refinements": ["..."],
  "open_questions": ["..."]
}

Definitions:
- gaps_resolved: requirements from the brief or email thread that the CRO confirmed capability for during the call
- new_concerns: red flags, limitations, or risks raised during the meeting (e.g. GLP certification pending, capacity constraints)
- rfp_refinements: concrete, actionable changes to incorporate into the RFP based on what was learned (e.g. "Reduce cohort groups from 4 to 3 — CRO cannot support 4 concurrent")
- open_questions: things still unresolved that must be addressed before the RFP is sent

Rules:
1. Be specific and actionable — no generic platitudes
2. Do NOT include compound names, MOA, or disease indications in any field
3. If the notes don't address something expected, add it to open_questions
4. Each array item should be one complete sentence
5. Return valid JSON only — no markdown, no explanation outside the JSON`;

  // Save notes to engagement_meetings first (before AI — so data is safe even if Claude fails)
  const { data: savedMeeting, error: saveErr } = await supabase
    .from('engagement_meetings')
    .insert({
      engagement_id: engagementId,
      meeting_date:  meeting_date || null,
      attendees:     attendees || null,
      raw_notes:     notes.trim(),
      ai_summary:    null, // filled below
    })
    .select('id')
    .single();

  if (saveErr || !savedMeeting) {
    console.error('[meeting-notes] Save error:', saveErr);
    return NextResponse.json({ error: 'Failed to save meeting notes' }, { status: 500 });
  }

  // Insert into engagement_messages so meeting notes appear in the thread
  const notesSubject = meeting_date
    ? `Meeting notes — ${new Date(meeting_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'Meeting notes';
  await supabase
    .from('engagement_messages')
    .insert({
      engagement_id: engagementId,
      direction:     'inbound',
      message_type:  'meeting_notes',
      subject:       notesSubject,
      body:          attendees ? `Attendees: ${attendees}\n\n${notes.trim()}` : notes.trim(),
      status:        'received',
      ai_generated:  false,
    });

  // Update stage to meeting_done
  await supabase
    .from('cro_engagements')
    .update({ stage: 'meeting_done', updated_at: new Date().toISOString() })
    .eq('id', engagementId);

  // ── Call Claude for debrief ───────────────────────────────────────────────
  let debrief: DebriefOutput;
  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 1500,
      system:     'You are helping a biotech company debrief after a CRO meeting. Return only valid JSON. Never include compound names, mechanisms of action, or disease indications.',
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text.trim();
    const json = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    debrief = JSON.parse(json) as DebriefOutput;

    // Validate shape
    debrief.gaps_resolved    = Array.isArray(debrief.gaps_resolved)   ? debrief.gaps_resolved   : [];
    debrief.new_concerns     = Array.isArray(debrief.new_concerns)    ? debrief.new_concerns    : [];
    debrief.rfp_refinements  = Array.isArray(debrief.rfp_refinements) ? debrief.rfp_refinements : [];
    debrief.open_questions   = Array.isArray(debrief.open_questions)  ? debrief.open_questions  : [];

    // Persist AI summary
    await supabase
      .from('engagement_meetings')
      .update({ ai_summary: debrief })
      .eq('id', savedMeeting.id);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[meeting-notes] Claude error:', msg);
    return NextResponse.json({
      meeting_id: savedMeeting.id,
      debrief:    null,
      followup_draft: null,
      ai_error:   `AI analysis failed: ${msg}`,
    });
  }

  // ── Generate follow-up email draft if there are open items ───────────────
  const openItems = [...debrief.open_questions, ...debrief.new_concerns];
  const allOpenItems = [
    ...openItems,
    ...unresolvedEmailGaps,
  ];

  let followupDraft: { subject: string; body: string; message_id: string } | null = null;

  if (allOpenItems.length > 0) {
    try {
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

      const openFromMeeting = [...debrief.open_questions, ...debrief.new_concerns];
      const meetingSection = openFromMeeting.length > 0
        ? `\nFrom our meeting:\n${openFromMeeting.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
        : '';
      const emailSection = unresolvedEmailGaps.length > 0
        ? `\nStill outstanding from prior emails:\n${unresolvedEmailGaps.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
        : '';

      const draftPrompt = `You are helping a biotech scientist${fromLine} draft a follow-up email to ${engagement.cro_name} after a recent meeting.

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

      const raw = await biotechClaude({ userPrompt: draftPrompt, maxTokens: 800 });
      const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
      const parsed = JSON.parse(cleaned) as { subject: string; body: string };

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
              confirmed:   debrief.gaps_resolved,
              unaddressed: debrief.open_questions,
              concerns:    debrief.new_concerns,
            },
            resolved_items: [],
          },
        })
        .select('id')
        .single();

      if (draftMsg) {
        followupDraft = {
          subject:    parsed.subject,
          body:       parsed.body,
          message_id: draftMsg.id,
        };
      }
    } catch (err) {
      console.error('[meeting-notes] Draft generation failed:', err);
      // Non-fatal — debrief was still saved
    }
  }

  return NextResponse.json({ meeting_id: savedMeeting.id, debrief, followup_draft: followupDraft });
}
