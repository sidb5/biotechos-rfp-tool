import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import type { CROProfile } from '@cro/types';
import { computeProfileScore } from '@cro/lib/profile-score';

// Admin client bypasses RLS — used only for writing back to cros_directory
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET /api/profile — returns the current user's profile or null
export async function GET() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('cro_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found — that's fine, return null
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data ?? null });
}

// POST /api/profile — creates or updates the current user's profile (upsert)
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<CROProfile>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.company_name?.trim()) {
    return NextResponse.json(
      { error: 'company_name is required' },
      { status: 400 }
    );
  }

  const profileData = {
    company_name: body.company_name.trim(),
    company_overview: body.company_overview ?? null,
    therapeutic_areas: body.therapeutic_areas ?? [],
    assay_types: body.assay_types ?? [],
    team_members: body.team_members ?? [],
    facility_description: body.facility_description ?? null,
    accreditations: body.accreditations ?? [],
    geographic_reach: body.geographic_reach ?? null,
  };

  const { score } = computeProfileScore(profileData);

  const payload = {
    user_id: user.id,
    ...profileData,
    is_complete: score >= 80,
    updated_at: new Date().toISOString(),
  };

  // Check if a profile already exists for this user
  const { data: existing } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  let data, error;

  if (existing?.id) {
    // Update existing profile
    ({ data, error } = await supabase
      .from('cro_profiles')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single());
  } else {
    // Insert new profile — generate referral code on first save
    const insertPayload = {
      ...payload,
      referral_code: generateReferralCode(body.company_name!.trim()),
    };
    ({ data, error } = await supabase
      .from('cro_profiles')
      .insert(insertPayload)
      .select()
      .single());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync CRO-owned fields back to cros_directory if linked
  // data is the full profile row returned by .select() — includes cros_directory_id after migration
  const savedDirectoryId = (data as Record<string, unknown>)?.cros_directory_id as string | null | undefined;

  if (savedDirectoryId) {
    const dirSync: Record<string, unknown> = {
      contact_email: user.email,
      glp_certified: (profileData.accreditations ?? []).some(
        a => a.toLowerCase().includes('glp')
      ),
    };

    if (profileData.company_overview) {
      dirSync.services_summary = profileData.company_overview;
    }
    if (profileData.therapeutic_areas?.length) {
      dirSync.therapeutic_areas = profileData.therapeutic_areas.join(', ');
    }

    // Map assay_types to boolean service flags
    const lower = (profileData.assay_types ?? []).map(a => a.toLowerCase());
    const has = (kws: string[]) => kws.some(k => lower.some(a => a.includes(k)));
    Object.assign(dirSync, {
      in_vitro:       has(['in vitro', 'invitro', 'cell-based', 'cellular']),
      in_vivo:        has(['in vivo', 'invivo', 'animal', 'rodent', 'mouse', 'rat']),
      toxicology:     has(['tox', 'toxicol', 'safety pharm']),
      dmpk_adme:      has(['dmpk', 'adme', 'pharmacokinetic', 'metabolism', 'pk study']),
      bioanalysis:    has(['bioanalysis', 'bioanalyt', 'lc-ms', 'lcms', 'mass spec']),
      clinical:       has(['clinical', 'phase 1', 'phase i']),
      regulatory:     has(['regulatory']),
      biostatistics:  has(['biostatistics', 'biostats']),
      genomics:       has(['genomics', 'sequencing', 'ngs']),
      cell_gene:      has(['cell therapy', 'gene therapy', 'cell & gene', 'cgt', 'aav']),
      imaging:        has(['imaging', 'histopath', 'histology', 'microscopy', 'ihc']),
      cmc:            has(['cmc', 'formulation', 'chemistry manufacturing']),
      biomarkers:     has(['biomarker', 'elisa', 'msd', 'luminex', 'immunoassay']),
      organoids:      has(['organoid', 'spheroid', '3d model', 'microphysiological']),
    });

    // Use service role client — cros_directory has no UPDATE RLS policy
    await createAdminClient()
      .from('cros_directory')
      .update(dirSync)
      .eq('id', savedDirectoryId);
  }

  return NextResponse.json({ profile: data }, { status: 200 });
}

function generateReferralCode(companyName: string): string {
  const prefix = companyName
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X')
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `${prefix}-${suffix}`
}
