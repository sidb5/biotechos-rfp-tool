import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sectionId = params.id;

  let versionId: string;
  try {
    const body = await request.json();
    versionId = body.version_id;
    if (!versionId) throw new Error('missing version_id');
  } catch {
    return NextResponse.json({ error: 'version_id is required' }, { status: 400 });
  }

  // Verify ownership
  const { data: section } = await supabase
    .from('proposal_sections')
    .select('id, content, proposal_id')
    .eq('id', sectionId)
    .single();

  if (!section) return NextResponse.json({ error: 'Section not found' }, { status: 404 });

  const { data: proposal } = await supabase
    .from('proposals')
    .select('cro_id')
    .eq('id', section.proposal_id)
    .single();

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('id', proposal?.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch the version to restore
  const { data: version } = await supabase
    .from('proposal_section_versions')
    .select('id, content, version_number')
    .eq('id', versionId)
    .eq('section_id', sectionId)
    .single();

  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  // Save current content as a new version before restoring
  const { data: latest } = await supabase
    .from('proposal_section_versions')
    .select('version_number')
    .eq('section_id', sectionId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version_number ?? 0) + 1;

  await supabase.from('proposal_section_versions').insert({
    section_id: sectionId,
    content: section.content,
    version_number: nextVersion,
    saved_by: user.id,
  });

  // Restore the selected version as current
  await supabase
    .from('proposal_sections')
    .update({
      content: version.content,
      is_ai_generated: false,
      last_edited_at: new Date().toISOString(),
    })
    .eq('id', sectionId);

  // Enforce max 10 versions — delete oldest if exceeded
  const { data: allVersions } = await supabase
    .from('proposal_section_versions')
    .select('id, version_number')
    .eq('section_id', sectionId)
    .order('version_number', { ascending: true });

  if (allVersions && allVersions.length > 10) {
    const toDelete = allVersions.slice(0, allVersions.length - 10).map(v => v.id);
    await supabase.from('proposal_section_versions').delete().in('id', toDelete);
  }

  return NextResponse.json({ content: version.content, restored_version: version.version_number });
}
