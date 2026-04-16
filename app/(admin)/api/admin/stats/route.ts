// GET /api/admin/stats
// Returns platform-wide stats for the admin dashboard.
// Requires authenticated admin user.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function GET() {
  // Verify caller is an approved admin
  const authClient = createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: admin } = await supabase
    .from('admin_users')
    .select('approved')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!admin?.approved) {
    return NextResponse.json({ error: 'Not an approved admin' }, { status: 403 });
  }

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00Z`;

  // Fetch stats in parallel
  const [croRes, biotechRes, subsRes, emailsRes, allUsersRes] = await Promise.all([
    supabase.from('cro_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('biotech_user_settings').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).in('status', ['active', 'trialing']).neq('plan', 'free'),
    supabase.from('email_logs').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const allUsers = allUsersRes?.data?.users ?? [];

  const recentUsers = [...allUsers]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
    .map(u => ({
      id: u.id,
      email: u.email,
      user_type: (u.user_metadata as Record<string, unknown>)?.user_type ?? 'cro',
      created_at: u.created_at,
    }));

  return NextResponse.json({
    total_users: allUsers.length,
    cro_users: croRes.count ?? 0,
    biotech_users: biotechRes.count ?? 0,
    paid_subscriptions: subsRes.count ?? 0,
    emails_this_month: emailsRes.count ?? 0,
    recent_signups: recentUsers,
  });
}
