// POST /api/sme-forms/create
// Creates an sme_forms record + one sme_form_questions row per gap.
// Body: { proposal_id: string, gaps: Gap[] }

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@shared/lib/supabase-server';
import type { Gap } from '@cro/types';

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let proposalId: string;
  let gaps: Gap[];
  try {
    const body = await request.json();
    proposalId = body.proposal_id;
    gaps = body.gaps;
    if (!proposalId || !Array.isArray(gaps) || gaps.length === 0) throw new Error('missing fields');
  } catch {
    return NextResponse.json({ error: 'proposal_id and non-empty gaps array are required' }, { status: 400 });
  }

  // Verify proposal ownership
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, cro_id')
    .eq('id', proposalId)
    .single();

  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

  const { data: profile } = await supabase
    .from('cro_profiles')
    .select('id, company_name')
    .eq('id', proposal.cro_id)
    .eq('user_id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = new Date();
  const openUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const hardExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const accessCode = generateAccessCode();

  const { data: form, error: formError } = await supabase
    .from('sme_forms')
    .insert({
      proposal_id: proposalId,
      access_code: accessCode,
      open_until: openUntil,
      hard_expires_at: hardExpiresAt,
      created_by: user.id,
      status: 'pending',
    })
    .select('id, token, access_code, open_until, hard_expires_at')
    .single();

  if (formError || !form) {
    return NextResponse.json({ error: formError?.message ?? 'Failed to create form' }, { status: 500 });
  }

  const questionRows = gaps.map(gap => ({
    form_id: form.id,
    gap_id: gap.gap_id,
    question_text: gap.question_for_sme,
    question_type: gap.question_type,
    unit_hint: gap.unit_hint ?? null,
  }));

  const { error: questionsError } = await supabase
    .from('sme_form_questions')
    .insert(questionRows);

  if (questionsError) {
    // Roll back the form record
    await supabase.from('sme_forms').delete().eq('id', form.id);
    return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  return NextResponse.json({
    form_id: form.id,
    token: form.token,
    access_code: form.access_code,
    open_until: form.open_until,
    hard_expires_at: form.hard_expires_at,
    cro_name: profile.company_name,
  });
}
