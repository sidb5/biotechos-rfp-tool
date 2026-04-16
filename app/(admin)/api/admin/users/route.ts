// GET  /api/admin/users?type=cro|biotech&search=term
// PATCH /api/admin/users  { user_id, plan }
// Requires authenticated + approved admin.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

async function verifyAdmin(): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const authClient = createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: admin } = await supabase
    .from('admin_users')
    .select('approved')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!admin?.approved) return { ok: false, error: 'Not an approved admin' };
  return { ok: true, userId: user.id };
}

// ── GET: list users ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await verifyAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.error === 'Unauthorized' ? 401 : 403 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const typeFilter = req.nextUrl.searchParams.get('type'); // 'cro' | 'biotech' | null
  const search = req.nextUrl.searchParams.get('search')?.toLowerCase();

  // Get all auth users
  const { data: usersRes } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const authUsers = usersRes?.users ?? [];

  // Get CRO profiles, biotech settings, and subscriptions
  const [{ data: croProfiles }, { data: biotechSettings }, { data: subscriptions }] = await Promise.all([
    supabase.from('cro_profiles').select('user_id, company_name'),
    supabase.from('biotech_user_settings').select('user_id, company_name'),
    supabase.from('subscriptions').select('cro_profile_id, plan, status'),
  ]);

  const croByUser = new Map((croProfiles ?? []).map(p => [p.user_id, p]));
  const biotechByUser = new Map((biotechSettings ?? []).map(s => [s.user_id, s]));

  // Map cro_profile_id to subscription
  const croProfileIds = new Map((croProfiles ?? []).map(p => [p.user_id, p]));
  const subByProfileId = new Map((subscriptions ?? []).map(s => [s.cro_profile_id, s]));

  // Get CRO profile IDs for subscription lookup
  const { data: croIds } = await supabase.from('cro_profiles').select('id, user_id');
  const croIdByUser = new Map((croIds ?? []).map(p => [p.user_id, p.id]));

  const users = authUsers
    .filter(u => {
      const userType = (u.user_metadata as Record<string, unknown>)?.user_type ?? 'cro';
      if (userType === 'admin') return false; // Exclude admin users from the list
      if (typeFilter && userType !== typeFilter) return false;
      if (search) {
        const email = (u.email ?? '').toLowerCase();
        const croCompany = (croByUser.get(u.id)?.company_name ?? '').toLowerCase();
        const biotechCompany = (biotechByUser.get(u.id)?.company_name ?? '').toLowerCase();
        if (!email.includes(search) && !croCompany.includes(search) && !biotechCompany.includes(search)) {
          return false;
        }
      }
      return true;
    })
    .map(u => {
      const userType = ((u.user_metadata as Record<string, unknown>)?.user_type ?? 'cro') as string;
      const croProfile = croByUser.get(u.id);
      const biotechProfile = biotechByUser.get(u.id);
      const croProfileId = croIdByUser.get(u.id);
      const sub = croProfileId ? subByProfileId.get(croProfileId) : null;

      return {
        id: u.id,
        email: u.email,
        user_type: userType,
        company_name: croProfile?.company_name ?? biotechProfile?.company_name ?? null,
        plan: sub?.plan ?? 'free',
        subscription_status: sub?.status ?? null,
        created_at: u.created_at,
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({ users });
}

// ── PATCH: update user subscription ─────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.error === 'Unauthorized' ? 401 : 403 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let body: { user_id?: string; plan?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { user_id, plan } = body;
  if (!user_id || !plan) {
    return NextResponse.json({ error: 'user_id and plan required' }, { status: 400 });
  }

  if (!['free', 'starter', 'pro'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan — must be free, starter, or pro' }, { status: 400 });
  }

  // Find or create cro_profile for this user (needed for subscriptions FK)
  let { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('user_id', user_id)
    .maybeSingle();

  if (!profile) {
    // Create a minimal profile so we can attach a subscription
    const { data: newProfile, error: profileErr } = await supabase
      .from('cro_profiles')
      .insert({ user_id, company_name: 'Unknown' })
      .select('id')
      .single();
    if (profileErr || !newProfile) {
      console.error('[admin/users] cro_profiles insert failed:', profileErr);
      return NextResponse.json({ error: 'Failed to create profile for subscription' }, { status: 500 });
    }
    profile = newProfile;
  }

  // Upsert subscription
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('cro_profile_id', profile.id)
    .maybeSingle();

  if (existingSub) {
    await supabase
      .from('subscriptions')
      .update({ plan, status: 'active', updated_at: new Date().toISOString() })
      .eq('id', existingSub.id);
  } else {
    await supabase
      .from('subscriptions')
      .insert({
        cro_profile_id: profile.id,
        plan,
        status: 'active',
      });
  }

  return NextResponse.json({ ok: true, plan });
}
