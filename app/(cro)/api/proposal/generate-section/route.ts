// POST /api/proposal/generate-section
// Generates ONE section for an existing proposal and saves it to the DB.
// Called sequentially by the client so the UI can show per-section progress.
//
// Body: { proposal_id: string, section_name: string }

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { generateSection } from '@shared/lib/claude';
import { PRICING_PLACEHOLDER } from '@cro/prompts/pricing-placeholder';
import { executiveSummaryPrompt } from '@cro/prompts/executive-summary';
import { technicalApproachPrompt } from '@cro/prompts/technical-approach';
import { teamQualificationsPrompt } from '@cro/prompts/team-qualifications';
import { facilityOverviewPrompt } from '@cro/prompts/facility-overview';
import { proposedTimelinePrompt } from '@cro/prompts/proposed-timeline';
import { assumptionsExclusionsPrompt } from '@cro/prompts/assumptions-exclusions';
import type { CROProfile, ParsedRFP, SectionName, Gap } from '@cro/types';

function buildGapInjection(
  answeredQuestions: { question_text: string; answer: string; answered_by_name: string | null }[],
  pendingQuestions: string[]
): string {
  if (answeredQuestions.length === 0 && pendingQuestions.length === 0) return '';

  let text = '';

  if (answeredQuestions.length > 0) {
    const lines = answeredQuestions.map(q =>
      `- ${q.question_text}: ${q.answer}${q.answered_by_name ? ` (confirmed by ${q.answered_by_name})` : ''}`
    );
    text += `\n\nRESOLVED GAP DATA — use these exact figures verbatim in the proposal.
Do not paraphrase, round, or restate these values. Weave them naturally into relevant prose.
If a specific item is not relevant to this section, skip it.

${lines.join('\n')}`;
  }

  if (pendingQuestions.length > 0) {
    const placeholders = pendingQuestions.map(q => `- [DATA NEEDED — ${q}]`);
    text += `\n\nUNRESOLVED GAPS — for each item below, insert the placeholder text exactly as shown, inline in the relevant part of the section. Do not leave these out.

${placeholders.join('\n')}`;
  }

  return text;
}

const SECTION_PROMPTS: Record<string, (profile: CROProfile, rfp: ParsedRFP) => string> = {
  executive_summary:      (p, r) => executiveSummaryPrompt(p, r),
  technical_approach:     (p, r) => technicalApproachPrompt(p, r),
  team_qualifications:    (p, r) => teamQualificationsPrompt(p, r),
  facility_overview:      (p, r) => facilityOverviewPrompt(p, r),
  proposed_timeline:      (p, r) => proposedTimelinePrompt(p, r),
  assumptions_exclusions: (p, r) => assumptionsExclusionsPrompt(p, r),
};

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let proposalId: string, sectionName: string, includeGapAnswers: boolean, pendingGapQuestions: string[];
  try {
    const body = await request.json();
    proposalId = body.proposal_id;
    sectionName = body.section_name;
    // Truthy when answered_gaps were passed (any non-empty array) — signals "fetch answers from DB"
    const passedGaps: Gap[] | undefined = body.answered_gaps;
    includeGapAnswers = Array.isArray(passedGaps) && passedGaps.length > 0;
    // Pending gaps: questions the SME hasn't answered yet → insert [DATA NEEDED] placeholders
    const passedPending: Gap[] | undefined = body.pending_gaps;
    pendingGapQuestions = Array.isArray(passedPending)
      ? passedPending.map((g: Gap) => g.question_for_sme).filter(Boolean)
      : [];
    if (!proposalId || !sectionName) throw new Error('missing fields');
  } catch {
    return NextResponse.json({ error: 'proposal_id and section_name are required' }, { status: 400 });
  }

  // Verify ownership
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, rfp_id, cro_id')
    .eq('id', proposalId)
    .single();

  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('*')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rfp } = await supabase
    .from('rfps')
    .select('parsed_summary')
    .eq('id', proposal.rfp_id)
    .single();

  if (!rfp) return NextResponse.json({ error: 'RFP not found' }, { status: 404 });

  const now = new Date().toISOString();
  const croProfile = profile as CROProfile;
  const parsedRFP = rfp.parsed_summary as ParsedRFP;

  // Pricing is always a placeholder — never AI-generated
  const isPricing = sectionName === 'pricing';

  let content: string;
  let usedLibraryId: string | null = null;
  // Declared outside the else block so the usage-bump code can reference it
  let fetchedLibraryEntries: { id: string; content: string; assay_types: string[] | null; usage_count: number | null }[] | null = null;

  if (isPricing) {
    content = PRICING_PLACEHOLDER;
  } else {
    // ── Check content library before making an AI call ──────────────────────
    // CRO-generic sections (team, facility) match on section_name alone.
    // RFP-specific sections prefer assay_type overlap, then fall back to any entry.
    const GENERIC_SECTIONS = ['team_qualifications', 'facility_overview'];
    const rfpAssayTypes: string[] = ((parsedRFP as unknown) as Record<string, unknown>).assay_types as string[] ?? [];

    const { data: libraryEntries } = await supabase
      .from('content_library')
      .select('id, content, assay_types, usage_count')
      .eq('cro_id', profile.id)
      .eq('section_name', sectionName)
      .order('usage_count', { ascending: false });

    fetchedLibraryEntries = libraryEntries;

    let libraryContent: string | null = null;

    if (libraryEntries && libraryEntries.length > 0) {
      if (GENERIC_SECTIONS.includes(sectionName)) {
        // Use best entry (highest usage_count, already sorted)
        libraryContent = libraryEntries[0].content;
        usedLibraryId = libraryEntries[0].id;
      } else {
        // Prefer entry with the most assay-type overlap
        let best: { id: string; content: string } | null = null;
        let bestOverlap = -1;

        for (const entry of libraryEntries) {
          const entryAssays: string[] = entry.assay_types ?? [];
          const overlap = rfpAssayTypes.filter(a =>
            entryAssays.some((ea: string) => ea.toLowerCase() === a.toLowerCase())
          ).length;
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            best = { id: entry.id, content: entry.content };
          }
        }

        if (best) {
          libraryContent = best.content;
          usedLibraryId = best.id;
        }
      }
    }

    if (libraryContent) {
      content = libraryContent;
    } else {
      let basePrompt = SECTION_PROMPTS[sectionName]?.(croProfile, parsedRFP) ?? '';

      if (includeGapAnswers) {
        // Fetch SME-answered questions for this proposal's most recent form
        try {
          const { data: forms } = await supabase
            .from('sme_forms')
            .select('id')
            .eq('proposal_id', proposalId)
            .order('open_until', { ascending: false });

          if (forms && forms.length > 0) {
            const allQuestions: { question_text: string; answer: string; answered_by_name: string | null }[] = [];
            for (const form of forms) {
              const { data: qs } = await supabase
                .from('sme_form_questions')
                .select('question_text, answer, answered_by_name')
                .eq('form_id', form.id)
                .not('answer', 'is', null);
              if (qs) allQuestions.push(...qs.filter(q => q.answer));
            }
            const questions = allQuestions.length > 0 ? allQuestions : null;

            const answered = (questions ?? []).filter(q => q.answer);
            basePrompt += buildGapInjection(answered, pendingGapQuestions);
          } else {
            // No form yet — still inject [DATA NEEDED] for pending gaps if any
            basePrompt += buildGapInjection([], pendingGapQuestions);
          }
        } catch { /* table may not exist yet — generate without gap injection */ }
      }

      content = await generateSection(basePrompt);
    }
  }

  // Bump usage stats on the library entry we reused (fire-and-forget, non-fatal)
  if (usedLibraryId && fetchedLibraryEntries) {
    const entry = fetchedLibraryEntries.find(e => e.id === usedLibraryId);
    const newCount = ((entry?.usage_count ?? 0)) + 1;
    supabase
      .from('content_library')
      .update({ usage_count: newCount, last_used_at: now })
      .eq('id', usedLibraryId)
      .then(() => { /* fire and forget */ });
  }

  // Upsert: if the row already exists (e.g. a retry), update it
  const { data: existing } = await supabase
    .from('proposal_sections')
    .select('id')
    .eq('proposal_id', proposalId)
    .eq('section_name', sectionName)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('proposal_sections')
      .update({ content, is_ai_generated: !isPricing, last_edited_at: now })
      .eq('id', existing.id);
  } else {
    await supabase.from('proposal_sections').insert({
      proposal_id:     proposalId,
      section_name:    sectionName as SectionName,
      content,
      is_ai_generated: !isPricing,
      last_edited_at:  now,
    });
  }

  // Persist gap_citations on the proposal (fire-and-forget, idempotent)
  if (includeGapAnswers && sectionName === 'executive_summary') {
    ;(async () => {
      try {
        const { data: forms } = await supabase
          .from('sme_forms')
          .select('id')
          .eq('proposal_id', proposalId)
          .order('open_until', { ascending: false });
        if (!forms || forms.length === 0) return;

        const allAnswers: { gap_id: string; question_text: string; answer: string; answered_by_name: string | null; answered_at: string | null }[] = [];
        for (const form of forms) {
          const { data: qs } = await supabase
            .from('sme_form_questions')
            .select('gap_id, question_text, answer, answered_by_name, answered_at')
            .eq('form_id', form.id)
            .not('answer', 'is', null);
          if (qs) allAnswers.push(...qs.filter(q => q.answer));
        }
        const questions = allAnswers;

        if (!questions || questions.length === 0) return;

        const citations = questions.filter(q => q.answer).map(q => ({
          gap_id: q.gap_id,
          answered_by: q.answered_by_name ?? 'SME',
          answered_at: q.answered_at,
          value_used: q.answer,
          inserted_in_section: 'multiple',
        }));

        await supabase
          .from('proposals')
          .update({ gap_citations: citations })
          .eq('id', proposalId);
      } catch { /* non-fatal */ }
    })();
  }

  return NextResponse.json({
    section_name: sectionName,
    content,
    from_library: usedLibraryId !== null,
  });
}
