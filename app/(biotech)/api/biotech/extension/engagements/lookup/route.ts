// GET /api/biotech/extension/engagements/lookup?email=xxx
// Finds the most recent active engagement matching a CRO email address or domain.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'email param required' }, { status: 400 });

  const domain = email.split('@')[1] ?? '';

  // Exact email match first, then domain fallback
  const { data: exact } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, cro_email, stage, brief_id, updated_at')
    .eq('user_id', user.id)
    .ilike('cro_email', email)
    .not('stage', 'in', '(awarded,closed)')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (exact) return NextResponse.json({ engagement: exact, matchType: 'email' });

  // Domain fallback
  const { data: domain_match } = await supabase
    .from('cro_engagements')
    .select('id, cro_name, cro_email, stage, brief_id, updated_at')
    .eq('user_id', user.id)
    .ilike('cro_email', `%@${domain}`)
    .not('stage', 'in', '(awarded,closed)')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (domain_match) return NextResponse.json({ engagement: domain_match, matchType: 'domain' });

  return NextResponse.json({ engagement: null, matchType: null });
}
