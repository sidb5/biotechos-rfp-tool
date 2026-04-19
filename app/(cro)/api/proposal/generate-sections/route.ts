// POST /api/proposal/generate-sections
// Generates all AI sections for an EXISTING proposal that has no sections yet.
// Unlike /api/proposal/generate (which creates a new proposal), this writes
// sections into a proposal that already exists in the DB.
//
// Body: { proposal_id: string }

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

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let proposalId: string;
  try {
    const body = await request.json();
    proposalId = body.proposal_id;
    if (!proposalId) throw new Error('missing proposal_id');
  } catch {
    return NextResponse.json({ error: 'proposal_id is required' }, { status: 400 });
  }

  // Load proposal → RFP → CRO profile, verifying ownership
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

  // Guard: don't regenerate if sections already exist
  const { count } = await supabase
    .from('proposal_sections')
    .select('id', { count: 'exact', head: true })
    .eq('proposal_id', proposalId);

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Sections already exist — use regenerate-section for individual sections' }, { status: 409 });
  }

  const croProfile = profile as CROProfile;
  const parsedRFP = rfp.parsed_summary as ParsedRFP;
  const now = new Date().toISOString();

  const sections: { name: SectionName; prompt: () => string }[] = [
    { name: 'executive_summary',      prompt: () => executiveSummaryPrompt(croProfile, parsedRFP) },
    { name: 'technical_approach',     prompt: () => technicalApproachPrompt(croProfile, parsedRFP) },
    { name: 'team_qualifications',    prompt: () => teamQualificationsPrompt(croProfile, parsedRFP) },
    { name: 'facility_overview',      prompt: () => facilityOverviewPrompt(croProfile, parsedRFP) },
    { name: 'proposed_timeline',      prompt: () => proposedTimelinePrompt(croProfile, parsedRFP) },
    { name: 'assumptions_exclusions', prompt: () => assumptionsExclusionsPrompt(croProfile, parsedRFP) },
  ];

  const results: { section: SectionName; success: boolean; error?: string; content?: string }[] = [];

  for (const section of sections) {
    try {
      const content = await generateSection(section.prompt());
      await supabase.from('proposal_sections').insert({
        proposal_id:    proposalId,
        section_name:   section.name,
        content,
        is_ai_generated: true,
        last_edited_at: now,
      });
      results.push({ section: section.name, success: true, content });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      console.error(`[generate-sections] ✗ ${section.name}:`, msg);
      // Insert placeholder so section row exists and can be regenerated
      await supabase.from('proposal_sections').insert({
        proposal_id:    proposalId,
        section_name:   section.name,
        content:        `[Generation failed — click Regenerate to retry: ${msg}]`,
        is_ai_generated: false,
        last_edited_at: now,
      });
      results.push({ section: section.name, success: false, error: msg });
    }
  }

  // Always insert pricing placeholder
  await supabase.from('proposal_sections').insert({
    proposal_id:    proposalId,
    section_name:   'pricing' as SectionName,
    content:        PRICING_PLACEHOLDER,
    is_ai_generated: false,
    last_edited_at: now,
  });

  // Re-fetch all sections to return to the client
  const { data: allSections } = await supabase
    .from('proposal_sections')
    .select('id, section_name, content, is_ai_generated, last_edited_at')
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    sections: allSections ?? [],
    sections_generated: results.filter(r => r.success).length,
    sections_failed:    results.filter(r => !r.success).length,
  });
}
