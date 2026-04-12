// POST /api/biotech/engagements/[id]/meeting-notes
// Saves meeting notes, runs AI debrief analysis (4 outputs), advances stage to meeting_done.
// Returns { meeting_id, debrief } where debrief has gaps_resolved, new_concerns,
// rfp_refinements, open_questions.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

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
    .select('id, cro_name, stage, brief_id, rfp_internal_briefs(title, classification, extracted_data)')
    .eq('id', engagementId)
    .eq('user_id', user.id)
    .single();

  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  // Load prior message thread for context (last 5 messages)
  const { data: messages } = await supabase
    .from('engagement_messages')
    .select('direction, message_type, body, created_at')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: false })
    .limit(5);

  const threadSummary = (messages ?? [])
    .reverse()
    .map(m => `[${m.direction === 'outbound' ? 'You' : engagement.cro_name}]: ${(m.body ?? '').slice(0, 300)}`)
    .join('\n\n');

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

  // Save notes to DB first (before AI — so data is safe even if Claude fails)
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

  // Update stage to meeting_done
  await supabase
    .from('cro_engagements')
    .update({ stage: 'meeting_done', updated_at: new Date().toISOString() })
    .eq('id', engagementId);

  // ── Call Claude ───────────────────────────────────────────────────────────
  let debrief: DebriefOutput;
  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 1500,
      system:     'You are helping a biotech company debrief after a CRO meeting. Return only valid JSON. Never include compound names, mechanisms of action, or disease indications.',
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text.trim();
    // Strip markdown fences if present
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
    // Don't fail the request — notes are saved, AI just failed
    return NextResponse.json({
      meeting_id: savedMeeting.id,
      debrief:    null,
      ai_error:   `AI analysis failed: ${msg}`,
    });
  }

  return NextResponse.json({ meeting_id: savedMeeting.id, debrief });
}
