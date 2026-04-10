import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function PATCH(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let proposalId: string;
  let quoteData: Record<string, unknown>;

  try {
    const body = await request.json();
    proposalId = body.proposal_id;
    quoteData = body.quote_data;
    if (!proposalId || !quoteData) throw new Error('missing fields');
  } catch {
    return NextResponse.json({ error: 'proposal_id and quote_data required' }, { status: 400 });
  }

  // Verify ownership via cro_profiles
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, cro_id')
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
    .update({ quote_data: quoteData, updated_at: new Date().toISOString() })
    .eq('id', proposalId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
