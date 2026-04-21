// GET /api/sme-forms/status?proposal_id=...
// Returns all SME forms and their questions/answers for a proposal.
// Used by GapPanel to check for new answers.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const proposalId = url.searchParams.get('proposal_id');
  if (!proposalId) return NextResponse.json({ error: 'proposal_id is required' }, { status: 400 });

  // Verify ownership and fetch cached gaps in one query
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, cro_id, detected_gaps')
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

  const { data: forms } = await supabase
    .from('sme_forms')
    .select(`
      id, token, status, open_until, hard_expires_at, access_code,
      sme_form_questions (
        id, gap_id, question_text, answer, answered_by_name, answered_at
      )
    `)
    .eq('proposal_id', proposalId)
    .order('open_until', { ascending: false });

  return NextResponse.json({
    forms: forms ?? [],
    detected_gaps: proposal.detected_gaps ?? null,
  });
}
