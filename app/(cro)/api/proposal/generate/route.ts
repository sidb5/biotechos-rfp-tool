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
  const startTime = Date.now();
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let rfpId: string;
  let parsedRFP: ParsedRFP;
  // section_overrides: map of section_name -> library_entry_id | 'fresh'
  let sectionOverrides: Record<string, string> = {};
  try {
    const body = await request.json();
    rfpId = body.rfp_id;
    parsedRFP = body.parsed_rfp;
    sectionOverrides = body.section_overrides ?? {};
    if (!rfpId || !parsedRFP) throw new Error('missing fields');
  } catch {
    return NextResponse.json({ error: 'rfp_id and parsed_rfp are required' }, { status: 400 });
  }

  // Fetch the RFP row to get cro_id and verify ownership
  const { data: rfp } = await supabase
    .from('rfps')
    .select('id, cro_id')
    .eq('id', rfpId)
    .single();

  if (!rfp) {
    return NextResponse.json({ error: 'RFP not found' }, { status: 404 });
  }

  // Verify this CRO belongs to the current user
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('*')
    .eq('id', rfp.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'CRO profile not found' }, { status: 403 });
  }

  const croProfile = profile as CROProfile;

  // Create the proposal record
  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .insert({ rfp_id: rfpId, cro_id: rfp.cro_id, status: 'draft' })
    .select('id')
    .single();

  if (proposalError || !proposal) {
    return NextResponse.json({ error: proposalError?.message ?? 'Failed to create proposal' }, { status: 500 });
  }

  const proposalId = proposal.id;

  // Define sections in generation order
  const sections: { name: SectionName; prompt: () => string }[] = [
    { name: 'executive_summary',      prompt: () => executiveSummaryPrompt(croProfile, parsedRFP) },
    { name: 'technical_approach',     prompt: () => technicalApproachPrompt(croProfile, parsedRFP) },
    { name: 'team_qualifications',    prompt: () => teamQualificationsPrompt(croProfile, parsedRFP) },
    { name: 'facility_overview',      prompt: () => facilityOverviewPrompt(croProfile, parsedRFP) },
    { name: 'proposed_timeline',      prompt: () => proposedTimelinePrompt(croProfile, parsedRFP) },
    { name: 'assumptions_exclusions', prompt: () => assumptionsExclusionsPrompt(croProfile, parsedRFP) },
  ];

  const results: { section: SectionName; success: boolean; error?: string }[] = [];

  // Generate each section independently — a single failure doesn't abort the rest
  for (const section of sections) {
    try {
      const override = sectionOverrides[section.name];
      let content: string;
      let isAiGenerated = true;

      if (override && override !== 'fresh') {
        // Use library content
        const { data: libEntry } = await supabase
          .from('content_library')
          .select('content, usage_count')
          .eq('id', override)
          .single();

        if (!libEntry) throw new Error('Library entry not found');
        content = libEntry.content as string;
        isAiGenerated = false;

        // Increment usage_count
        await supabase
          .from('content_library')
          .update({ usage_count: (libEntry.usage_count ?? 0) + 1, last_used_at: new Date().toISOString() })
          .eq('id', override)
          .then(() => {});
      } else {
        content = await generateSection(section.prompt());
      }

      const { error: insertError } = await supabase
        .from('proposal_sections')
        .insert({
          proposal_id: proposalId,
          section_name: section.name,
          content,
          is_ai_generated: isAiGenerated,
          last_edited_at: new Date().toISOString(),
        });

      if (insertError) throw new Error(insertError.message);

      results.push({ section: section.name, success: true });
      console.log(`[proposal/generate] ✓ ${section.name} (${override && override !== 'fresh' ? 'library' : 'AI'})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      console.error(`[proposal/generate] ✗ ${section.name}: ${msg}`);
      results.push({ section: section.name, success: false, error: msg });

      // Save a placeholder so the section row exists and can be regenerated
      await supabase.from('proposal_sections').insert({
        proposal_id: proposalId,
        section_name: section.name,
        content: `[Generation failed — click Regenerate to retry: ${msg}]`,
        is_ai_generated: false,
      }).then(() => {});
    }
  }

  // Always insert the pricing placeholder (never AI-generated)
  await supabase.from('proposal_sections').insert({
    proposal_id: proposalId,
    section_name: 'pricing' as SectionName,
    content: PRICING_PLACEHOLDER,
    is_ai_generated: false,
    last_edited_at: new Date().toISOString(),
  });

  // Update proposal status
  const allSucceeded = results.every(r => r.success);
  await supabase
    .from('proposals')
    .update({ status: allSucceeded ? 'draft' : 'draft', updated_at: new Date().toISOString() })
    .eq('id', proposalId);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[proposal/generate] completed in ${elapsed}s — ${results.filter(r => r.success).length}/${sections.length} sections succeeded`);

  return NextResponse.json({
    proposal_id: proposalId,
    sections_generated: results.filter(r => r.success).length,
    sections_failed: results.filter(r => !r.success).length,
    elapsed_seconds: parseFloat(elapsed),
    results,
  });
}
