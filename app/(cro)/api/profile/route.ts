import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import type { CROProfile } from '@cro/types';
import { computeProfileScore } from '@cro/lib/profile-score';

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
