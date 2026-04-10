import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { generateSection } from '@shared/lib/claude';
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
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let proposalId: string;
  let sectionName: SectionName;
  try {
    const body = await request.json();
    proposalId = body.proposal_id;
    sectionName = body.section_name;
    if (!proposalId || !sectionName) throw new Error('missing fields');
  } catch {
    return NextResponse.json(
      { error: 'proposal_id and section_name are required' },
      { status: 400 }
    );
  }

  if (sectionName === 'pricing') {
    return NextResponse.json(
      { error: 'Pricing section cannot be AI-generated' },
      { status: 400 }
    );
  }

  // Fetch proposal and verify ownership
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, cro_id, rfp_id')
    .eq('id', proposalId)
    .single();

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('*')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: rfp } = await supabase
    .from('rfps')
    .select('parsed_summary')
    .eq('id', proposal.rfp_id)
    .single();

  if (!rfp?.parsed_summary) {
    return NextResponse.json({ error: 'RFP data not found' }, { status: 404 });
  }

  const croProfile = profile as CROProfile;
  const parsedRFP = rfp.parsed_summary as ParsedRFP;

  const promptMap: Record<string, () => string> = {
    executive_summary:      () => executiveSummaryPrompt(croProfile, parsedRFP),
    technical_approach:     () => technicalApproachPrompt(croProfile, parsedRFP),
    team_qualifications:    () => teamQualificationsPrompt(croProfile, parsedRFP),
    facility_overview:      () => facilityOverviewPrompt(croProfile, parsedRFP),
    proposed_timeline:      () => proposedTimelinePrompt(croProfile, parsedRFP),
    assumptions_exclusions: () => assumptionsExclusionsPrompt(croProfile, parsedRFP),
  };

  const promptFn = promptMap[sectionName];
  if (!promptFn) {
    return NextResponse.json({ error: `Unknown section: ${sectionName}` }, { status: 400 });
  }

  let content: string;
  try {
    content = await generateSection(promptFn());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: `AI generation error: ${msg}` }, { status: 502 });
  }

  // Update the existing section row
  const { error: updateError } = await supabase
    .from('proposal_sections')
    .update({
      content,
      is_ai_generated: true,
      last_edited_at: new Date().toISOString(),
    })
    .eq('proposal_id', proposalId)
    .eq('section_name', sectionName);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ section_name: sectionName, content });
}
