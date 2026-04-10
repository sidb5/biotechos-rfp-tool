import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let proposalSectionId: string;
  try {
    const body = await request.json();
    proposalSectionId = body.proposal_section_id;
    if (!proposalSectionId) throw new Error('missing proposal_section_id');
  } catch {
    return NextResponse.json({ error: 'proposal_section_id is required' }, { status: 400 });
  }

  // Fetch section + proposal + rfp in one query chain
  const { data: section } = await supabase
    .from('proposal_sections')
    .select('id, section_name, content, proposal_id')
    .eq('id', proposalSectionId)
    .single();

  if (!section) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  const { data: proposal } = await supabase
    .from('proposals')
    .select('cro_id, rfp_id')
    .eq('id', section.proposal_id)
    .single();

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  // Verify ownership
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch RFP metadata for tagging
  const { data: rfp } = await supabase
    .from('rfps')
    .select('parsed_summary')
    .eq('id', proposal.rfp_id)
    .single();

  const parsedSummary = rfp?.parsed_summary as {
    assay_types?: string[];
    study_type?: string;
  } | null;

  const assayTypes = parsedSummary?.assay_types ?? [];
  const studyType = parsedSummary?.study_type ?? null;

  // Upsert: update if same cro + section + study_type exists, else insert
  const { data: existing } = await supabase
    .from('content_library')
    .select('id, usage_count')
    .eq('cro_id', proposal.cro_id)
    .eq('section_name', section.section_name)
    .eq('study_type', studyType ?? '')
    .maybeSingle();

  let saved;
  if (existing) {
    const { data, error } = await supabase
      .from('content_library')
      .update({
        content: section.content,
        assay_types: assayTypes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    saved = data;
  } else {
    const { data, error } = await supabase
      .from('content_library')
      .insert({
        cro_id: proposal.cro_id,
        section_name: section.section_name,
        assay_types: assayTypes,
        study_type: studyType,
        content: section.content,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    saved = data;
  }

  return NextResponse.json({ saved, updated: !!existing });
}
