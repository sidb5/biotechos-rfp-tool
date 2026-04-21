// GET /api/sme/[token]?code=XXXXXX
// Public endpoint — no auth. Loads the SME form by token.
// Within 48h: returns form data directly.
// After 48h, before 7 days: requires correct access code (query param ?code=).
// After 7 days: returns 410 Gone.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role — bypasses RLS so we can read proposals/rfps/cro_profiles for public SME forms
function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const supabase = serviceSupabase();
  const { token } = params;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  const { data: form } = await supabase
    .from('sme_forms')
    .select('id, token, access_code, open_until, hard_expires_at, status, proposal_id')
    .eq('token', token)
    .single();

  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  const now = new Date();
  if (now > new Date(form.hard_expires_at)) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  if (now > new Date(form.open_until)) {
    if (!code || code.toUpperCase() !== form.access_code) {
      return NextResponse.json({ error: 'code_required', open_until: form.open_until }, { status: 401 });
    }
  }

  // Fetch proposal → rfp → cro_name using service role (bypasses per-user RLS)
  const { data: proposal } = await supabase
    .from('proposals')
    .select('rfp_id, cro_id')
    .eq('id', form.proposal_id)
    .single();

  let croName = '';
  let studyType = '';

  if (proposal) {
    const [{ data: rfp }, { data: cro }] = await Promise.all([
      supabase.from('rfps').select('parsed_summary').eq('id', proposal.rfp_id).single(),
      supabase.from('cro_profiles').select('company_name').eq('id', proposal.cro_id).single(),
    ]);
    croName = cro?.company_name ?? '';
    studyType = ((rfp?.parsed_summary as Record<string, unknown>)?.study_type as string) ?? '';
  }

  const { data: questions } = await supabase
    .from('sme_form_questions')
    .select('id, gap_id, question_text, question_type, unit_hint, answer, answered_by_name, answered_at')
    .eq('form_id', form.id)
    .order('id', { ascending: true });

  return NextResponse.json({
    form_id: form.id,
    status: form.status,
    open_until: form.open_until,
    hard_expires_at: form.hard_expires_at,
    cro_name: croName,
    study_type: studyType,
    questions: questions ?? [],
  });
}
