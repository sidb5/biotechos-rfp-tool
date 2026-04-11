'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import {
  FIELD_KEYS,
  FIELD_META,
  type ExtractedData,
  type ExtractedField,
  type FieldKey,
  type FieldTag,
} from '@biotech/prompts/extract-brief';

// ── Tag display config ────────────────────────────────────────────────────────

const TAG_STYLE: Record<FieldTag, string> = {
  STATED:   'bg-green-900/50 text-green-300 border-green-700/50',
  INFERRED: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
  MISSING:  'bg-gray-800/60 text-gray-500 border-gray-700/40',
};

const TAG_ORDER: FieldTag[] = ['STATED', 'INFERRED', 'MISSING'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExtractPage() {
  const router = useRouter();
  const params = useParams();
  const briefId = params.id as string;

  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [title, setTitle] = useState('');

  // ── Load: check for existing extraction, else run it ─────────────────────

  const runExtraction = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch(`/api/biotech/briefs/${briefId}/extract`, {
        method: 'POST',
      });
      const json = await res.json();

      if (!res.ok) {
        setErrorMsg(json.error ?? 'Extraction failed.');
        setStatus('error');
        return;
      }

      setExtracted(json.extracted as ExtractedData);
      setStatus('ready');
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }, [briefId]);

  useEffect(() => {
    // If extracted_data already exists on the record, load it directly
    supabase
      .from('rfp_internal_briefs')
      .select('title, extracted_data, classification')
      .eq('id', briefId)
      .single()
      .then(({ data }) => {
        if (data?.extracted_data) {
          setExtracted(data.extracted_data as ExtractedData);
          setTitle(data.title ?? '');
          setStatus('ready');
        } else {
          // No prior extraction — run it now
          runExtraction();
        }
      });
  }, [briefId, runExtraction]);

  // ── Inline field editing ──────────────────────────────────────────────────

  function updateValue(key: FieldKey, value: string) {
    setExtracted(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [key]: {
          ...prev[key],
          value: value || null,
          // If user types something into a MISSING field, promote to STATED
          tag: (prev[key].tag === 'MISSING' && value) ? 'STATED' : prev[key].tag,
        },
      };
    });
  }

  function cycleTag(key: FieldKey) {
    setExtracted(prev => {
      if (!prev) return prev;
      const current = prev[key].tag;
      const next = TAG_ORDER[(TAG_ORDER.indexOf(current) + 1) % TAG_ORDER.length];
      return { ...prev, [key]: { ...prev[key], tag: next } };
    });
  }

  // ── Confirm & save ────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!extracted || !title.trim()) return;

    setStatus('saving');

    const { error } = await supabase
      .from('rfp_internal_briefs')
      .update({
        title: title.trim(),
        extracted_data: extracted,
        classification: extracted.classification,
        updated_at: new Date().toISOString(),
      })
      .eq('id', briefId);

    if (error) {
      setErrorMsg('Failed to save. Please try again.');
      setStatus('ready');
      return;
    }

    // Advance to Phase 2 — CRO selection (Task 2.1 builds this page)
    router.push(`/biotech/briefs/${briefId}`);
  }

  // ── Render: loading ───────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-gray-400">
        <svg className="h-7 w-7 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm">Extracting structured brief…</p>
        <p className="text-xs text-gray-600">Claude is reading your inputs. This takes 5–10 seconds.</p>
      </div>
    );
  }

  // ── Render: error ─────────────────────────────────────────────────────────

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-gray-300 px-6">
        <p className="text-red-400 text-sm font-medium">⚠ {errorMsg}</p>
        <button
          onClick={runExtraction}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          Try again
        </button>
        <a href={`/biotech/briefs/new?id=${briefId}`} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
          ← Back to brief
        </a>
      </div>
    );
  }

  // ── Render: review grid ───────────────────────────────────────────────────

  const canConfirm = title.trim().length > 0;
  const missingCount = extracted
    ? FIELD_KEYS.filter(k => extracted[k].tag === 'MISSING').length
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">

      {/* PRIVATE banner */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-amber-800/30 bg-amber-950/70 px-5 py-2.5 backdrop-blur">
        <span className="shrink-0 rounded border border-amber-700 bg-amber-900/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
          PRIVATE
        </span>
        <p className="text-xs text-amber-300/70">
          This structured brief stays in your vault — review and edit before confirming.
        </p>
      </div>

      <div className="mx-auto max-w-3xl px-5 py-10 space-y-8">

        {/* Header */}
        <header>
          <nav className="mb-1.5 text-xs text-gray-600">
            <a href="/biotech/briefs" className="hover:text-gray-400 transition-colors">Briefs</a>
            <span className="mx-1.5">/</span>
            <a href={`/biotech/briefs/new?id=${briefId}`} className="hover:text-gray-400 transition-colors">Input</a>
            <span className="mx-1.5">/</span>
            <span className="text-gray-400">Review extraction</span>
          </nav>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-white">Review extracted brief</h1>
              <p className="mt-1 text-sm text-gray-400">
                Claude extracted {FIELD_KEYS.length - missingCount} of {FIELD_KEYS.length} fields.
                Edit anything below before confirming.
              </p>
            </div>
            <button
              onClick={runExtraction}
              className="shrink-0 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition-colors"
            >
              ↺ Re-extract
            </button>
          </div>
        </header>

        {/* Brief title — required */}
        <section className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-300">
            Brief title <span className="text-red-400">*</span>
            <span className="ml-2 text-xs font-normal text-gray-600">Internal name for this study — not shared with CROs</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Q3 tox study — small molecule oral"
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {!title.trim() && (
            <p className="text-xs text-amber-500">Required before confirming</p>
          )}
        </section>

        {/* Tag legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-gray-600">Tags:</span>
          {TAG_ORDER.map(tag => (
            <span key={tag} className={`rounded-full border px-2.5 py-0.5 font-medium ${TAG_STYLE[tag]}`}>
              {tag}
            </span>
          ))}
          <span className="text-gray-600">— click any tag to cycle it</span>
        </div>

        {/* 12-field review grid */}
        <div className="space-y-4">
          {FIELD_KEYS.map(key => {
            const field = extracted![key] as ExtractedField;
            const meta = FIELD_META[key];
            const isMissing = field.tag === 'MISSING';

            return (
              <div
                key={key}
                className={`rounded-xl border p-4 space-y-2 transition-colors ${
                  isMissing
                    ? 'border-gray-800 bg-gray-900/30'
                    : 'border-gray-700/60 bg-gray-900/60'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-sm font-medium text-gray-200">{meta.label}</span>
                    <span className="ml-2 text-xs text-gray-600">{meta.hint}</span>
                  </div>
                  {/* Clickable tag cycles through STATED → INFERRED → MISSING */}
                  <button
                    type="button"
                    onClick={() => cycleTag(key)}
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-opacity hover:opacity-80 ${TAG_STYLE[field.tag]}`}
                    title="Click to change tag"
                  >
                    {field.tag}
                  </button>
                </div>

                <textarea
                  value={field.value ?? ''}
                  onChange={e => updateValue(key, e.target.value)}
                  placeholder={isMissing ? 'Not found — add manually if known' : ''}
                  rows={field.value && field.value.length > 120 ? 3 : 2}
                  className={`w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    isMissing
                      ? 'border-gray-700 bg-gray-800/40 text-gray-500 placeholder-gray-600'
                      : 'border-gray-700 bg-gray-800 text-gray-100 placeholder-gray-600'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Classification (derived from extraction) */}
        {extracted?.classification && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Auto-classified as:</span>
            <span className="rounded-full bg-blue-900/40 border border-blue-700/40 text-blue-300 px-2.5 py-0.5 font-medium uppercase tracking-wide">
              {extracted.classification}
            </span>
          </div>
        )}

        {/* Confirm button */}
        <div className="border-t border-gray-800 pt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {missingCount > 0 && (
            <p className="text-xs text-gray-600">
              {missingCount} field{missingCount !== 1 ? 's' : ''} marked MISSING — you can fill these in now or proceed and add them later.
            </p>
          )}
          <div className="sm:ml-auto">
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || status === 'saving'}
              className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-950
                bg-blue-600 hover:bg-blue-500 text-white
                disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              {status === 'saving' ? 'Saving…' : 'Confirm & Start CRO Search →'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
