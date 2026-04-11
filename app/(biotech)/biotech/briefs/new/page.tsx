'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UploadedDoc {
  filename: string;
  text: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type SaveError = string | null;

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_TEXT_CHARS = 10_000;
const MAX_DOCS = 5;
const AUTOSAVE_MS = 30_000;
const MIN_CHARS_TO_GENERATE = 50;
const MAX_VOICE_SECONDS = 180;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewBriefPage() {
  const router = useRouter();

  // Auth
  const userIdRef = useRef<string | null>(null);

  // Brief ID (created on first save)
  const [briefId, setBriefId] = useState<string | null>(null);
  const briefIdRef = useRef<string | null>(null);

  // Input state
  const [text, setText] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [docs, setDocs] = useState<UploadedDoc[]>([]);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceElapsed, setVoiceElapsed] = useState(0);
  const recognitionRef = useRef<any>(null);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Save state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<SaveError>(null);
  const isDirty = useRef(false);
  const hasInitialized = useRef(false);

  // Latest-value refs so the auto-save closure never goes stale
  const textRef = useRef(text);
  const docsRef = useRef(docs);
  const voiceRef = useRef(voiceTranscript);
  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { docsRef.current = docs; }, [docs]);
  useEffect(() => { voiceRef.current = voiceTranscript; }, [voiceTranscript]);

  // ── Auth check ─────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        userIdRef.current = data.user.id;
      } else {
        router.replace('/login');
      }
    });
  }, [router]);

  // ── Load existing draft (if ?id= in URL) ──────────────────────────────────

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('id');

    // Reject anything that isn't a real UUID — guards against stale test URLs
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const id = raw && UUID_RE.test(raw) ? raw : null;

    if (!id) {
      // Strip invalid ?id= from URL so it can't cause confusion on next save
      if (raw) window.history.replaceState(null, '', window.location.pathname);
      hasInitialized.current = true;
      return;
    }

    setBriefId(id);
    briefIdRef.current = id;

    supabase
      .from('rfp_internal_briefs')
      .select('raw_inputs')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data?.raw_inputs) {
          const raw = data.raw_inputs as { text?: string; docs?: UploadedDoc[]; voice_transcript?: string };
          if (raw.text) setText(raw.text);
          if (raw.docs) setDocs(raw.docs);
          if (raw.voice_transcript) setVoiceTranscript(raw.voice_transcript);
          setSaveStatus('saved');
        }
        hasInitialized.current = true;
      });
  }, []);

  // ── Mark dirty when inputs change ─────────────────────────────────────────
  // Use a layout effect so hasInitialized.current is always set before this
  // runs — prevents the first-render false-dirty race condition.

  useEffect(() => {
    if (!hasInitialized.current) return;
    // Only mark dirty if there is actually something worth saving
    const hasContent =
      textRef.current.trim().length > 0 ||
      voiceRef.current.trim().length > 0 ||
      docsRef.current.length > 0;
    if (!hasContent) return;
    isDirty.current = true;
    setSaveStatus('idle');
  }, [text, voiceTranscript, docs]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const doSave = useCallback(async () => {
    if (!userIdRef.current || !isDirty.current) return;

    setSaveStatus('saving');

    const rawInputs = {
      text: textRef.current,
      docs: docsRef.current,
      voice_transcript: voiceRef.current,
    };

    try {
      if (briefIdRef.current) {
        const { error } = await supabase
          .from('rfp_internal_briefs')
          .update({ raw_inputs: rawInputs, updated_at: new Date().toISOString() })
          .eq('id', briefIdRef.current);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('rfp_internal_briefs')
          .insert({ user_id: userIdRef.current, raw_inputs: rawInputs })
          .select('id')
          .single();
        if (error) throw error;
        if (data) {
          setBriefId(data.id);
          briefIdRef.current = data.id;
          window.history.replaceState(null, '', `?id=${data.id}`);
        }
      }

      isDirty.current = false;
      setSaveStatus('saved');
    } catch (err: any) {
      const msg = err?.message ?? err?.error_description ?? JSON.stringify(err);
      console.error('[briefs/new] save error:', msg, err);
      setSaveError(msg);
      setSaveStatus('error');
    }
  }, []);

  // Auto-save every 30 seconds
  useEffect(() => {
    const id = setInterval(doSave, AUTOSAVE_MS);
    return () => clearInterval(id);
  }, [doSave]);

  // ── Document upload ────────────────────────────────────────────────────────

  async function handleFiles(rawFiles: FileList | File[]) {
    const files = Array.from(rawFiles);
    const slots = MAX_DOCS - docsRef.current.length;

    if (slots <= 0) {
      setUploadError(`Maximum ${MAX_DOCS} documents already uploaded.`);
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    for (const file of files.slice(0, slots)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

      if (!['pdf', 'docx', 'txt', 'pptx'].includes(ext)) {
        setUploadError(`"${file.name}": unsupported type. Upload PDF, DOCX, TXT, or PPTX.`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        setUploadError(`"${file.name}" exceeds 20 MB.`);
        continue;
      }

      const fd = new FormData();
      fd.append('file', file);

      try {
        const res = await fetch('/api/biotech/upload', { method: 'POST', body: fd });
        const json = await res.json();

        if (!res.ok) {
          setUploadError(`${file.name}: ${json.error ?? 'Extraction failed.'}`);
        } else {
          setDocs(prev => [...prev, { filename: json.filename, text: json.text }]);
        }
      } catch {
        setUploadError(`${file.name}: network error during upload.`);
      }
    }

    setIsUploading(false);
  }

  function removeDoc(i: number) {
    setDocs(prev => prev.filter((_, idx) => idx !== i));
  }

  // ── Drag and drop handlers ─────────────────────────────────────────────────

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  // ── Voice input ────────────────────────────────────────────────────────────

  function startListening() {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SR) {
      setVoiceError('Voice input requires Chrome or Edge.');
      return;
    }

    setVoiceError(null);
    setVoiceElapsed(0);

    const rec = new SR() as any;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    // Committed text starts from whatever is already in the box
    let committed = voiceRef.current;

    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          committed += (committed ? ' ' : '') + chunk.trim();
        } else {
          interim = chunk;
        }
      }
      setVoiceTranscript(committed + (interim ? ' ' + interim : ''));
    };

    rec.onerror = () => stopListening();
    rec.onend = () => stopListening();

    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);

    let seconds = 0;
    voiceTimerRef.current = setInterval(() => {
      seconds += 1;
      setVoiceElapsed(seconds);
      if (seconds >= MAX_VOICE_SECONDS) stopListening();
    }, 1000);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Generate → Task 1.2 ────────────────────────────────────────────────────

  async function handleGenerate() {
    await doSave();
    const id = briefIdRef.current;
    if (id) {
      router.push(`/biotech/briefs/${id}/extract`);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalChars = [text, voiceTranscript, ...docs.map(d => d.text)]
    .join(' ')
    .trim().length;
  const canGenerate = totalChars >= MIN_CHARS_TO_GENERATE;

  const voiceTimeLeft = Math.max(0, MAX_VOICE_SECONDS - voiceElapsed);
  const voiceMins = Math.floor(voiceTimeLeft / 60);
  const voiceSecs = voiceTimeLeft % 60;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">

      {/* ── PRIVATE banner ── */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-amber-800/30 bg-amber-950/70 px-5 py-2.5 backdrop-blur">
        <span className="shrink-0 rounded border border-amber-700 bg-amber-900/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
          PRIVATE
        </span>
        <p className="text-xs text-amber-300/70">
          Not shared with CROs — nothing leaves this vault until you explicitly approve each outbound message.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-10 px-5 py-10">

        {/* ── Page header ── */}
        <header>
          <nav className="mb-1.5 text-xs text-gray-600">
            <a href="/biotech/briefs" className="transition-colors hover:text-gray-400">
              Briefs
            </a>
            <span className="mx-1.5">/</span>
            <span className="text-gray-400">New</span>
          </nav>
          <h1 className="text-2xl font-semibold text-white">New Study Brief</h1>
          <p className="mt-1 text-sm text-gray-400">
            Dump everything you know. Combine text, documents, and voice — the more detail,
            the better the AI can help you find and brief CROs.
          </p>
        </header>

        {/* ═══════════════════════════════════════════════════════════════
            INPUT 1 — Freeform text
        ═══════════════════════════════════════════════════════════════ */}
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-gray-300">Write or paste</h2>
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX_TEXT_CHARS))}
            placeholder="Dump everything you know — compound info, study type, timeline, budget, compliance needs, prior CRO experiences, constraints. This stays private."
            rows={12}
            className="w-full resize-y rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex justify-end">
            <span
              className={`text-xs tabular-nums ${
                text.length > 9_500 ? 'text-amber-400' : 'text-gray-600'
              }`}
            >
              {text.length.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()}
            </span>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            INPUT 2 — Document upload
        ═══════════════════════════════════════════════════════════════ */}
        <section className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-medium text-gray-300">Upload documents</h2>
            <span className="text-xs text-gray-600">
              PDF, DOCX, TXT, PPTX — up to {MAX_DOCS} files
            </span>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => docs.length < MAX_DOCS && fileInputRef.current?.click()}
            className={[
              'rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all',
              docs.length >= MAX_DOCS
                ? 'cursor-not-allowed border-gray-800 opacity-40'
                : isDragging
                ? 'cursor-copy border-blue-500 bg-blue-500/5'
                : 'cursor-pointer border-gray-700 hover:border-gray-500',
            ].join(' ')}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.pptx"
              className="hidden"
              onChange={e => e.target.files && handleFiles(e.target.files)}
            />

            {isUploading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-blue-400">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Extracting text…
              </div>
            ) : (
              <>
                {/* Upload icon */}
                <svg className="mx-auto mb-2 h-7 w-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-gray-400">
                  Drag files here or{' '}
                  <span className="text-blue-400 transition-colors hover:text-blue-300">
                    browse
                  </span>
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  Text is extracted server-side — files are not stored
                </p>
              </>
            )}
          </div>

          {uploadError && (
            <p className="flex items-start gap-1 text-xs text-red-400">
              <span className="mt-0.5 shrink-0">⚠</span>
              {uploadError}
            </p>
          )}

          {docs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {docs.map((doc, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-full border border-green-800/50 bg-green-950/50 px-2.5 py-1 text-xs text-green-300"
                >
                  <svg className="h-3 w-3 shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Document extracted:&nbsp;<span className="font-medium">{doc.filename}</span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); removeDoc(i); }}
                    className="ml-0.5 text-green-600 transition-colors hover:text-red-400"
                    aria-label={`Remove ${doc.filename}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {docs.length >= MAX_DOCS && (
            <p className="text-xs text-amber-400">Maximum {MAX_DOCS} documents reached.</p>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            INPUT 3 — Voice
        ═══════════════════════════════════════════════════════════════ */}
        <section className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-medium text-gray-300">Voice input</h2>
            <span className="text-xs text-gray-600">Chrome or Edge — up to 3 minutes</span>
          </div>

          <div className="space-y-3 rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={[
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900',
                  isListening
                    ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600 focus:ring-gray-500',
                ].join(' ')}
              >
                {isListening ? (
                  <>
                    {/* Pulsing red dot */}
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-300 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                    </span>
                    Stop — {voiceMins}:{voiceSecs.toString().padStart(2, '0')} left
                  </>
                ) : (
                  <>
                    {/* Mic icon */}
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 1a4 4 0 014 4v7a4 4 0 01-8 0V5a4 4 0 014-4zm0 2a2 2 0 00-2 2v7a2 2 0 004 0V5a2 2 0 00-2-2zm-7 9h2a5 5 0 0010 0h2a7 7 0 01-6 6.92V21h3v2H9v-2h3v-2.08A7 7 0 015 12z" />
                    </svg>
                    Start recording
                  </>
                )}
              </button>
            </div>

            {voiceError && (
              <p className="text-xs text-red-400">{voiceError}</p>
            )}

            {(isListening || voiceTranscript) && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">
                  {isListening
                    ? 'Live transcript (editable after recording):'
                    : 'Transcript (editable):'}
                </p>
                <textarea
                  value={voiceTranscript}
                  onChange={e => setVoiceTranscript(e.target.value)}
                  rows={4}
                  placeholder="Transcript will appear here as you speak…"
                  className="w-full resize-y rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            Footer — status + generate button
        ═══════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col gap-3 border-t border-gray-800 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-xs">
            <span className="tabular-nums text-gray-600">
              {totalChars.toLocaleString()} chars across all inputs
            </span>
            <SaveBadge status={saveStatus} error={saveError} />
          </div>

          <div className="flex flex-col items-start gap-1 sm:items-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
            >
              Generate Brief →
            </button>
            {!canGenerate && totalChars > 0 && (
              <p className="text-xs text-gray-600">
                {MIN_CHARS_TO_GENERATE - totalChars} more characters needed
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SaveBadge({ status, error }: { status: SaveStatus; error: SaveError }) {
  if (status === 'saved')
    return <span className="text-green-600">✓ Saved</span>;
  if (status === 'saving')
    return <span className="animate-pulse text-blue-400">Saving…</span>;
  if (status === 'error')
    return (
      <span className="text-red-400" title={error ?? undefined}>
        ⚠ Save failed{error ? ` — ${error}` : ''}
      </span>
    );
  return null;
}
