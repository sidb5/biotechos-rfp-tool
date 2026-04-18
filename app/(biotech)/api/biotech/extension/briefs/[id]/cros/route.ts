// GET /api/biotech/extension/briefs/[id]/cros
// Returns CRO engagements for a brief so the extension can pre-populate the CRO list.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: brief } = await supabase
    .from('rfp_internal_briefs')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 });

  const { data: engagements } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, cro_email, stage')
    .eq('brief_id', params.id)
    .not('stage', 'in', '(awarded,closed)')
    .not('cro_email', 'is', null)
    .order('updated_at', { ascending: false });

  // Deduplicate by lowercase cro_email — keep most-recently-updated record per CRO
  const seen = new Set<string>();
  const unique = (engagements ?? []).filter(e => {
    const key = (e.cro_email as string).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (a.cro_name ?? '').localeCompare(b.cro_name ?? ''));

  const limited = unique.length > 25;
  const cros    = unique.slice(0, 25);

  return NextResponse.json({ cros, limited });
}
