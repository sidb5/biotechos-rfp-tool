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
import type { CROProfile, ParsedRFP, SectionName } from '@cro/types';

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

  let proposalId: string, sectionName: string;
  try {
    const body = await request.json();
    proposalId = body.proposal_id;
    sectionName = body.section_name;
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
      content = await generateSection(SECTION_PROMPTS[sectionName]?.(croProfile, parsedRFP) ?? '');
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

  return NextResponse.json({
    section_name: sectionName,
    content,
    from_library: usedLibraryId !== null,
  });
}
