import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

// POST — mark a quote as sent (status = complete) and enable sharing
// Body: { proposal_id: string }
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let proposalId: string;
  try {
    const body = await request.json();
    proposalId = body.proposal_id;
    if (!proposalId) throw new Error('missing proposal_id');
  } catch {
    return NextResponse.json({ error: 'proposal_id required' }, { status: 400 });
  }

  // Verify ownership
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, cro_id, share_token, share_views')
    .eq('id', proposalId)
    .single();

  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase
    .from('proposals')
    .update({ status: 'complete', share_enabled: true })
    .eq('id', proposalId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    share_token: proposal.share_token,
    share_views: proposal.share_views ?? 0,
  });
}
