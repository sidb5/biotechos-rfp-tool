// GET /api/biotech/extension/briefs
// Returns the user's active study briefs for the Gmail extension.
// Safe to return — no compound names, MOA, or indications.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: briefs } = await supabase
    .from('rfp_internal_briefs')
    .select('id, title, classification, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ briefs: briefs ?? [] });
}
