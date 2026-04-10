import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function PATCH(request: Request) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let proposalId: string;
  let sectionName: string;
  let content: string;
  try {
    const body = await request.json();
    proposalId = body.proposal_id;
    sectionName = body.section_name;
    content = body.content;
    if (!proposalId || !sectionName || content === undefined) throw new Error('missing fields');
  } catch {
    return NextResponse.json(
      { error: 'proposal_id, section_name, and content are required' },
      { status: 400 }
    );
  }

  // Verify ownership
  const { data: proposal } = await supabase
    .from('proposals')
    .select('cro_id')
    .eq('id', proposalId)
    .single();

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch current section to snapshot it before overwriting
  const { data: currentSection } = await supabase
    .from('proposal_sections')
    .select('id, content')
    .eq('proposal_id', proposalId)
    .eq('section_name', sectionName)
    .single();

  if (currentSection?.content) {
    // Get next version number
    const { data: latest } = await supabase
      .from('proposal_section_versions')
      .select('version_number')
      .eq('section_id', currentSection.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latest?.version_number ?? 0) + 1;

    await supabase.from('proposal_section_versions').insert({
      section_id: currentSection.id,
      content: currentSection.content,
      version_number: nextVersion,
      saved_by: user.id,
    });

    // Enforce max 10 versions per section
    const { data: allVersions } = await supabase
      .from('proposal_section_versions')
      .select('id, version_number')
      .eq('section_id', currentSection.id)
      .order('version_number', { ascending: true });

    if (allVersions && allVersions.length > 10) {
      const toDelete = allVersions.slice(0, allVersions.length - 10).map(v => v.id);
      await supabase.from('proposal_section_versions').delete().in('id', toDelete);
    }
  }

  const { error } = await supabase
    .from('proposal_sections')
    .update({
      content,
      is_ai_generated: false,
      last_edited_at: new Date().toISOString(),
    })
    .eq('proposal_id', proposalId)
    .eq('section_name', sectionName);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update proposal updated_at
  await supabase
    .from('proposals')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', proposalId);

  return NextResponse.json({ ok: true, section_id: currentSection?.id });
}
