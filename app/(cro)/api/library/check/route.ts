import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

const GENERATABLE_SECTIONS = [
  'executive_summary',
  'technical_approach',
  'team_qualifications',
  'facility_overview',
  'proposed_timeline',
  'assumptions_exclusions',
];

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let croId: string;
  let assayTypes: string[];
  try {
    const body = await request.json();
    croId = body.cro_id;
    assayTypes = body.assay_types ?? [];
    if (!croId) throw new Error('missing cro_id');
  } catch {
    return NextResponse.json({ error: 'cro_id is required' }, { status: 400 });
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

  // Fetch all library entries for this CRO
  const { data: entries } = await supabase
    .from('content_library')
    .select('id, section_name, assay_types, study_type, content, usage_count, updated_at')
    .eq('cro_id', croId)
    .in('section_name', GENERATABLE_SECTIONS)
    .order('usage_count', { ascending: false });

  // For each generatable section, find best matching library entry
  const matches: Record<string, { id: string; usage_count: number; updated_at: string; preview: string } | null> = {};

  for (const sectionName of GENERATABLE_SECTIONS) {
    const sectionEntries = (entries ?? []).filter(e => e.section_name === sectionName);
    if (sectionEntries.length === 0) {
      matches[sectionName] = null;
      continue;
    }

    // Prefer entries with overlapping assay types
    let best = sectionEntries[0];
    if (assayTypes.length > 0) {
      const withOverlap = sectionEntries.find(e =>
        (e.assay_types ?? []).some((a: string) => assayTypes.includes(a))
      );
      if (withOverlap) best = withOverlap;
    }

    matches[sectionName] = {
      id: best.id,
      usage_count: best.usage_count,
      updated_at: best.updated_at,
      preview: (best.content as string).slice(0, 120) + '…',
    };
  }

  const hasAnyMatch = Object.values(matches).some(m => m !== null);
  return NextResponse.json({ matches, has_any_match: hasAnyMatch });
}
