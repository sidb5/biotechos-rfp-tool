'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  gap_id: string;
  question_text: string;
  question_type: 'numeric' | 'text' | 'yes_no' | 'selection';
  unit_hint: string | null;
  answer: string | null;
  answered_by_name: string | null;
  answered_at: string | null;
}

interface FormData {
  form_id: string;
  status: string;
  cro_name: string;
  study_type: string;
  questions: Question[];
  open_until: string;
  hard_expires_at: string;
}

type PageState = 'loading' | 'code_required' | 'form' | 'submitted' | 'expired' | 'not_found' | 'submitting';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Question inputs ──────────────────────────────────────────────────────────

function QuestionCard({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm font-semibold text-gray-900 mb-1 leading-snug">{question.question_text}</p>
      {question.unit_hint && (
        <p className="text-xs text-gray-400 mb-3">Answer in: {question.unit_hint}</p>
      )}

      {question.question_type === 'numeric' && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="any"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Enter value"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {question.unit_hint && (
            <span className="text-xs text-gray-400 shrink-0">{question.unit_hint}</span>
          )}
        </div>
      )}

      {question.question_type === 'text' && (
        <div>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value.slice(0, 300))}
            placeholder="Your answer…"
            rows={3}
            maxLength={300}
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <p className="text-right text-xs text-gray-400 mt-1">{value.length}/300</p>
        </div>
      )}

      {question.question_type === 'yes_no' && (
        <div className="flex gap-3">
          {['Yes', 'No'].map(opt => (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${
                value === opt
                  ? 'bg-green-600 border-green-600 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {question.question_type === 'selection' && (
        <div className="flex flex-col gap-2">
          {['Option A', 'Option B', 'Option C'].map(opt => (
            <label key={opt} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                name={question.id}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="accent-green-600"
              />
              <span className="text-sm text-gray-800">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SMEFormPage() {
  const params = useParams();
  const token = params.token as string;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [formData, setFormData] = useState<FormData | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [respondentName, setRespondentName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    loadForm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadForm(code?: string) {
    const qs = code ? `?code=${encodeURIComponent(code)}` : '';
    const res = await fetch(`/api/sme/${token}${qs}`);

    if (res.status === 410) { setPageState('expired'); return; }
    if (res.status === 404) { setPageState('not_found'); return; }
    if (res.status === 401) { setPageState('code_required'); return; }

    const data = await res.json();
    if (!res.ok) { setPageState('not_found'); return; }

    setFormData(data);
    // Pre-fill any already-answered questions
    const prefilled: Record<string, string> = {};
    for (const q of data.questions) {
      if (q.answer) prefilled[q.id] = q.answer;
    }
    setAnswers(prefilled);
    setPageState('form');
  }

  async function handleCodeSubmit() {
    setCodeError('');
    const res = await fetch(`/api/sme/${token}?code=${encodeURIComponent(accessCode.toUpperCase())}`);
    if (res.status === 401) { setCodeError('Incorrect code — try again'); return; }
    if (res.status === 410) { setPageState('expired'); return; }
    const data = await res.json();
    if (!res.ok) { setPageState('not_found'); return; }
    setFormData(data);
    const prefilled: Record<string, string> = {};
    for (const q of data.questions) {
      if (q.answer) prefilled[q.id] = q.answer;
    }
    setAnswers(prefilled);
    setPageState('form');
  }

  async function handleSubmit() {
    if (!formData) return;
    setPageState('submitting');
    setSubmitError('');
    try {
      const res = await fetch(`/api/sme/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: formData.questions.map(q => ({
            question_id: q.id,
            answer: answers[q.id] ?? '',
          })),
          respondent_name: respondentName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? 'Submission failed — please try again');
        setPageState('form');
        return;
      }
      setPageState('submitted');
    } catch {
      setSubmitError('Network error — please try again');
      setPageState('form');
    }
  }

  const answeredCount = formData
    ? formData.questions.filter(q => answers[q.id]?.trim()).length
    : 0;
  const totalCount = formData?.questions.length ?? 0;
  const canSubmit = answeredCount > 0;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Expired ──────────────────────────────────────────────────────────────────
  if (pageState === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <p className="text-lg font-semibold text-gray-800 mb-2">This link has expired</p>
          <p className="text-sm text-gray-500">Please contact the team that sent you this link for a new one.</p>
        </div>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────────
  if (pageState === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <p className="text-lg font-semibold text-gray-800 mb-2">Link not found</p>
          <p className="text-sm text-gray-500">This link may be invalid. Please check the URL and try again.</p>
        </div>
      </div>
    );
  }

  // ── Code required ─────────────────────────────────────────────────────────────
  if (pageState === 'code_required') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <h1 className="text-lg font-bold text-gray-900 mb-1">Access code required</h1>
            <p className="text-sm text-gray-500 mb-6">
              Enter the 6-character code provided when this form was shared with you.
            </p>
            <input
              type="text"
              value={accessCode}
              onChange={e => setAccessCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="XXXXXX"
              maxLength={6}
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-center text-xl font-mono font-bold tracking-widest text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
            />
            {codeError && <p className="text-xs text-red-600 mb-3">{codeError}</p>}
            <button
              onClick={handleCodeSubmit}
              disabled={accessCode.length < 6}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold rounded-xl transition-colors"
            >
              Access form →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Submitted ─────────────────────────────────────────────────────────────────
  if (pageState === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-bold text-gray-900 mb-2">Done — thank you!</p>
          <p className="text-sm text-gray-500">
            {formData?.cro_name ?? 'The team'} has your answers. You can close this page.
          </p>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────────
  if (!formData) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* CRO brand header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-xl mx-auto">
          <p className="text-sm font-bold text-gray-900">{formData.cro_name}</p>
          {formData.study_type && (
            <p className="text-xs text-gray-500">Proposal: {formData.study_type}</p>
          )}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Heading */}
        <div>
          <h1 className="text-lg font-bold text-gray-900 mb-1">
            Quick questions — {totalCount} question{totalCount !== 1 ? 's' : ''}
          </h1>
          <p className="text-sm text-gray-500">
            Takes about 5 minutes. Your answers help {formData.cro_name} prepare an accurate proposal.
          </p>
          {!nameSubmitted && (
            <p className="text-xs text-orange-600 mt-1">
              Available until {formatDate(formData.hard_expires_at)}
            </p>
          )}
        </div>

        {/* Progress bar */}
        {nameSubmitted && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{answeredCount} of {totalCount} answered</span>
              {answeredCount === totalCount && totalCount > 0 && <span className="text-green-600 font-medium">All done!</span>}
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${totalCount > 0 ? (answeredCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Name field */}
        {!nameSubmitted ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-1">
              Your name
            </label>
            <p className="text-xs text-gray-400 mb-3">
              So {formData.cro_name} knows who provided these answers
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={respondentName}
                onChange={e => setRespondentName(e.target.value)}
                placeholder="e.g. Dr. Jane Smith"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                onKeyDown={e => { if (e.key === 'Enter' && respondentName.trim()) setNameSubmitted(true); }}
              />
              <button
                onClick={() => setNameSubmitted(true)}
                disabled={!respondentName.trim()}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Start →
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Questions */}
            <div className="flex flex-col gap-4">
              {formData.questions.map(q => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  value={answers[q.id] ?? ''}
                  onChange={v => setAnswers(prev => ({ ...prev, [q.id]: v }))}
                />
              ))}
            </div>

            {submitError && (
              <p className="text-sm text-red-600">{submitError}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || pageState === 'submitting'}
              className="w-full py-3.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {pageState === 'submitting' ? 'Submitting…' : `Submit answer${answeredCount !== 1 ? 's' : ''} →`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
