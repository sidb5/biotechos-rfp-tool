// POST /api/sme/[token]/submit
// Public endpoint — no auth. Submits answers to all questions.
// Body: { answers: { question_id: string, answer: string }[], respondent_name: string }

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role — bypasses RLS so unauthenticated SME can write answers
function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const supabase = serviceSupabase();
  const { token } = params;

  let answers: { question_id: string; answer: string }[];
  let respondentName: string;
  try {
    const body = await request.json();
    answers = body.answers;
    respondentName = (body.respondent_name ?? '').trim();
    if (!Array.isArray(answers) || answers.length === 0 || !respondentName) {
      throw new Error('missing fields');
    }
  } catch {
    return NextResponse.json({ error: 'answers and respondent_name are required' }, { status: 400 });
  }

  // Load form to verify it hasn't expired and resolve form_id
  const { data: form } = await supabase
    .from('sme_forms')
    .select('id, hard_expires_at')
    .eq('token', token)
    .single();

  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  if (new Date() > new Date(form.hard_expires_at)) {
    return NextResponse.json({ error: 'This form has expired' }, { status: 410 });
  }

  const now = new Date().toISOString();

  // Write each answer
  for (const a of answers) {
    await supabase
      .from('sme_form_questions')
      .update({
        answer: a.answer,
        answered_by_name: respondentName,
        answered_at: now,
      })
      .eq('id', a.question_id)
      .eq('form_id', form.id);
  }

  // Check how many questions are now answered
  const { data: allQuestions } = await supabase
    .from('sme_form_questions')
    .select('id, answer')
    .eq('form_id', form.id);

  const total = (allQuestions ?? []).length;
  const answered = (allQuestions ?? []).filter(q => q.answer !== null && q.answer !== undefined).length;
  const newStatus = answered === 0 ? 'pending' : answered < total ? 'partially_answered' : 'complete';

  await supabase
    .from('sme_forms')
    .update({ status: newStatus })
    .eq('id', form.id);

  return NextResponse.json({ success: true, status: newStatus });
}
