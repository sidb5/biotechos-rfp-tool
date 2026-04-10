import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const croId = searchParams.get('cro_id');
  const sectionName = searchParams.get('section_name');
  const assayTypesParam = searchParams.get('assay_types');

  if (!croId || !sectionName) {
    return NextResponse.json({ error: 'cro_id and section_name are required' }, { status: 400 });
  }

  // Verify ownership
  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('id', croId)
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const assayTypes = assayTypesParam ? assayTypesParam.split(',').filter(Boolean) : [];

  // Fetch all entries for this CRO + section_name
  const { data: entries } = await supabase
    .from('content_library')
    .select('id, section_name, assay_types, study_type, content, usage_count, updated_at')
    .eq('cro_id', croId)
    .eq('section_name', sectionName)
    .order('usage_count', { ascending: false });

  if (!entries || entries.length === 0) {
    return NextResponse.json({ match: null });
  }

  // Find best match: at least one assay type in common
  let best = null;
  if (assayTypes.length > 0) {
    for (const entry of entries) {
      const entryAssays = (entry.assay_types ?? []) as string[];
      const overlap = assayTypes.some(a => entryAssays.includes(a));
      if (overlap) {
        best = entry;
        break; // already sorted by usage_count desc
      }
    }
  }

  // Fallback: return highest usage_count entry even without assay overlap
  if (!best) {
    best = entries[0];
  }

  return NextResponse.json({ match: best });
}
