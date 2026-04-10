import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import { anthropic } from '@shared/lib/claude';
import { SYSTEM_PROMPT } from '@cro/prompts/index';

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
    return NextResponse.json({ error: 'proposal_id required' }, { status: 400 });
  }

  // Fetch proposal + RFP + CRO profile
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, cro_id, rfp_id, quote_data')
    .eq('id', proposalId)
    .single();

  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

  // Verify ownership
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name, assay_types, therapeutic_areas, facility_description')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rfp } = await supabase
    .from('rfps')
    .select('biotech_name, parsed_summary')
    .eq('id', proposal.rfp_id)
    .single();

  const parsed = rfp?.parsed_summary as Record<string, unknown> | null;

  const prompt = `Write a concise 3-5 sentence scope description for a quick quote from a preclinical CRO to a biotech client.

Sponsor: ${rfp?.biotech_name ?? 'the client'}
Study type: ${parsed?.study_type ?? 'preclinical study'}
Assay types: ${Array.isArray(parsed?.assay_types) ? (parsed.assay_types as string[]).join(', ') : 'as discussed'}
Species: ${parsed?.species ?? 'to be confirmed'}
Key endpoints: ${Array.isArray(parsed?.primary_endpoints) ? (parsed.primary_endpoints as string[]).slice(0, 3).join(', ') : 'as specified'}
Timeline: ${parsed?.timeline_weeks ? `${parsed.timeline_weeks} weeks` : 'to be confirmed'}
Special requirements: ${Array.isArray(parsed?.special_requirements) ? (parsed.special_requirements as string[]).join(', ') : 'none noted'}

CRO: ${profile.company_name}
CRO capabilities: ${Array.isArray(profile.assay_types) ? (profile.assay_types as string[]).join(', ') : 'preclinical services'}

Write in first person ("We will..."). Be specific to the study requested. No generic filler. No headings. Return only the scope paragraph text.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = message.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type');

    const scopeText = block.text.trim();

    // Merge scope into quote_data
    const existingQuoteData = (proposal.quote_data as Record<string, unknown>) ?? {};
    const updatedQuoteData = { ...existingQuoteData, scope: scopeText };

    await supabase
      .from('proposals')
      .update({ quote_data: updatedQuoteData })
      .eq('id', proposalId);

    return NextResponse.json({ scope: scopeText });
  } catch (err) {
    console.error('[quote/generate-scope] error:', err);
    return NextResponse.json({ error: 'Failed to generate scope' }, { status: 502 });
  }
}
