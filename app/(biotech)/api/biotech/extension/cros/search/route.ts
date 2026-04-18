// GET /api/biotech/extension/cros/search?q=...
// Searches the global CRO directory by name. Falls back to the user's
// existing engagement CROs if the directory has no matching rows (stub phase).

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();

  // ── 1. Search global cros_directory ─────────────────────────────────────
  const dirQuery = supabase
    .from('cros_directory')
    .select('id, name, contact_email, specialties, glp_certified, region, size_category')
    .limit(20);

  if (q) dirQuery.ilike('name', `%${q}%`);

  const { data: dirRows } = await dirQuery.order('name');

  if (dirRows && dirRows.length > 0) {
    const cros = dirRows.map(r => ({
      id:         r.id,
      name:       r.name,
      email:      r.contact_email ?? '',
      tags:       buildTags(r),
      source:     'directory' as const,
    }));
    return NextResponse.json({ cros, source: 'directory', total: cros.length });
  }

  // ── 2. Fallback: user's own engagement CROs ───────────────────────────
  const engQuery = supabase
    .from('cro_engagements')
    .select('id, cro_name, cro_email')
    .eq('user_id', user.id)
    .not('cro_email', 'is', null)
    .limit(60);

  if (q) engQuery.ilike('cro_name', `%${q}%`);

  const { data: engRows } = await engQuery.order('cro_name');

  // Deduplicate by lowercase email
  const seen = new Set<string>();
  const cros = (engRows ?? [])
    .filter(e => {
      const key = (e.cro_email as string).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20)
    .map(e => ({
      id:     e.id,
      name:   e.cro_name as string,
      email:  e.cro_email as string,
      tags:   [] as string[],
      source: 'engagement' as const,
    }));

  return NextResponse.json({ cros, source: 'engagement', total: cros.length });
}

function buildTags(r: {
  specialties?: string[] | null;
  glp_certified?: boolean | null;
  region?: string | null;
  size_category?: string | null;
}): string[] {
  const tags: string[] = [];
  if (r.glp_certified) tags.push('GLP');
  if (r.region) tags.push(r.region);
  if (r.size_category) tags.push(r.size_category);
  if (r.specialties?.length) tags.push(...r.specialties.slice(0, 2));
  return tags;
}
