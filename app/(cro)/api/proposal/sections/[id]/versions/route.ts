import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sectionId = params.id;

  // Verify ownership via join
  const { data: section } = await supabase
    .from('proposal_sections')
    .select('id, proposal_id')
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

  const { data: versions } = await supabase
    .from('proposal_section_versions')
    .select('id, version_number, content, created_at')
    .eq('section_id', sectionId)
    .order('version_number', { ascending: false });

  return NextResponse.json({ versions: versions ?? [] });
}
