'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyzeResult {
  request_type: 'formal_rfp' | 'informal_request' | 'not_a_request';
  confidence: number;
  can_quote_now: boolean;
  biotech_name: string | null;
  study_type: string | null;
  assay_types: string[];
  species: string | null;
  primary_endpoints: string[];
  secondary_endpoints: string[];
  sample_count: string | null;
  timeline_weeks: number | null;
  deliverables: string[];
  budget_range: string | null;
  submission_deadline: string | null;
  special_requirements: string[];
  missing_critical_info: string[];
  ambiguities: string[];
  _text: string;
}

type FlowState = 'input' | 'processing' | 'clarify' | 'error' | 'creating';

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ activeStep }: { activeStep: number }) {
  const steps = ['Reading your request', 'Identifying what\'s needed', 'Building your quote'];
  return (
    <div className="flex flex-col gap-4 w-full max-w-xs">
      {steps.map((label, i) => (
        <div key={i} className={`flex items-center gap-3 transition-all duration-500 ${
          i <= activeStep ? 'opacity-100' : 'opacity-30'
        }`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
            i < activeStep
              ? 'bg-green-500'
              : i === activeStep
              ? 'bg-green-600 ring-4 ring-green-100'
              : 'bg-gray-200'
          }`}>
            {i < activeStep ? (
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <span className={`text-xs font-bold ${i === activeStep ? 'text-white' : 'text-gray-400'}`}>
                {i + 1}
              </span>
            )}
          </div>
          <span className={`text-sm font-medium ${
            i <= activeStep ? 'text-gray-900' : 'text-gray-400'
          }`}>
            {label}
          </span>
          {i === activeStep && (
            <span className="ml-auto flex gap-0.5">
              {[0,1,2].map(d => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce"
                  style={{ animationDelay: `${d * 0.15}s` }}
                />
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface IntakeFlowProps {
  croProfileId: string;
}

export default function IntakeFlow({ croProfileId }: IntakeFlowProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [flowState, setFlowState] = useState<FlowState>('input');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<number, string>>({});

  // ── Check for pending text from dashboard ─────────────────────────────────
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem('pendingRequest');
      if (pending) {
        sessionStorage.removeItem('pendingRequest');
        setText(pending);
        // Small delay so the component mounts cleanly before processing
        setTimeout(() => startProcessing(pending, null), 100);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File helpers ──────────────────────────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) { setFile(f); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) { setFile(f); }
  }

  // ── Read plain-text / .eml files in the browser ───────────────────────────
  async function readFileAsText(f: File): Promise<string | null> {
    const name = f.name.toLowerCase();
    if (name.endsWith('.txt') || name.endsWith('.eml') || f.type === 'text/plain') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(f);
      });
    }
    return null; // let the server handle PDF/DOCX
  }

  // ── Core processing ───────────────────────────────────────────────────────
  const startProcessing = useCallback(async (inputText: string, inputFile: File | null) => {
    setFlowState('processing');
    setActiveStep(0);

    // Step 2 lights after 1.5s
    const step2Timer = setTimeout(() => setActiveStep(1), 1500);

    try {
      let response: Response;

      // If it's a plain-text file, read it in browser and send as text
      if (inputFile) {
        const plainText = await readFileAsText(inputFile);
        if (plainText !== null) {
          // Treat as text
          response = await fetch('/api/intake/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: plainText }),
          });
        } else {
          // PDF / DOCX — send as file
          const fd = new FormData();
          fd.append('file', inputFile);
          response = await fetch('/api/intake/analyze', { method: 'POST', body: fd });
        }
      } else {
        response = await fetch('/api/intake/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: inputText }),
        });
      }

      clearTimeout(step2Timer);
      setActiveStep(2);

      const data = await response.json();

      if (!response.ok) {
        setErrorMsg(data.error ?? 'Something went wrong. Please try again.');
        setFlowState('error');
        return;
      }

      const result = data as AnalyzeResult;

      if (result.request_type === 'not_a_request') {
        setErrorMsg(
          "This doesn't look like a research request. Try pasting the email or description where the client explains what they need."
        );
        setFlowState('error');
        return;
      }

      setAnalyzeResult(result);

      if (!result.can_quote_now && result.missing_critical_info.length > 0) {
        setFlowState('clarify');
      } else {
        await createAndNavigate(result, result._text);
      }
    } catch (err) {
      clearTimeout(step2Timer);
      console.error('[IntakeFlow] processing error:', err);
      setErrorMsg('Something went wrong. Please try again.');
      setFlowState('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [croProfileId]);

  async function createAndNavigate(result: AnalyzeResult, rawText: string) {
    setFlowState('creating');
    try {
      const res = await fetch('/api/intake/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cro_profile_id: croProfileId,
          raw_text: rawText,
          parsed_summary: {
            request_type:        result.request_type,
            biotech_name:        result.biotech_name,
            study_type:          result.study_type,
            assay_types:         result.assay_types,
            species:             result.species,
            primary_endpoints:   result.primary_endpoints,
            secondary_endpoints: result.secondary_endpoints,
            sample_count:        result.sample_count,
            timeline_weeks:      result.timeline_weeks,
            deliverables:        result.deliverables,
            budget_range:        result.budget_range,
            submission_deadline: result.submission_deadline,
            special_requirements: result.special_requirements,
          },
          biotech_name: result.biotech_name,
        }),
      });
      const data = await res.json();
      if (res.status === 402) {
        // Plan limit reached — redirect to pricing
        setErrorMsg(data.message ?? 'Monthly proposal limit reached.');
        setFlowState('error');
        return;
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to create quote');
      router.push(`/quote/${data.proposal_id}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create quote. Please try again.');
      setFlowState('error');
    }
  }

  function handleContinue() {
    if (!file && text.trim().length < 10) return;
    startProcessing(text, file);
  }

  async function handleClarifySubmit() {
    if (!analyzeResult) return;
    // Append answers to original text for context
    const answers = analyzeResult.missing_critical_info
      .map((q, i) => clarifyAnswers[i] ? `${q}: ${clarifyAnswers[i]}` : null)
      .filter(Boolean)
      .join('\n');
    const enrichedText = answers
      ? `${analyzeResult._text}\n\n--- Additional information provided ---\n${answers}`
      : analyzeResult._text;

    // Re-use the result we already have, just fill in answers
    const enrichedResult: AnalyzeResult = {
      ...analyzeResult,
      can_quote_now: true,
      missing_critical_info: [],
      _text: enrichedText,
    };
    await createAndNavigate(enrichedResult, enrichedText);
  }

  // ─── Render: input ────────────────────────────────────────────────────────
  if (flowState === 'input') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-6">
        {/* File drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-green-400 bg-green-50'
              : file
              ? 'border-green-300 bg-green-50/50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.eml,.txt"
            className="hidden"
            onChange={handleFileSelect}
          />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-green-700">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-medium">{file.name}</span>
              <button
                onClick={e => { e.stopPropagation(); setFile(null); }}
                className="ml-1 text-gray-400 hover:text-gray-600 text-xs underline"
              >
                remove
              </button>
            </div>
          ) : (
            <>
              <svg className="w-8 h-8 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium text-gray-600">Drop a file here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">Accepts: PDF, Word, .eml, .txt</p>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">and / or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Textarea */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste the request text here..."
          rows={8}
          className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
        />

        {/* Continue button */}
        <button
          onClick={handleContinue}
          disabled={!file && text.trim().length < 10}
          className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold rounded-xl transition-colors"
        >
          Continue →
        </button>
      </div>
    );
  }

  // ─── Render: processing ───────────────────────────────────────────────────
  if (flowState === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10 px-4">
        <StepIndicator activeStep={activeStep} />
      </div>
    );
  }

  // ─── Render: creating (after clarify or direct proceed) ──────────────────
  if (flowState === 'creating') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10 px-4">
        <StepIndicator activeStep={2} />
        <p className="text-sm text-gray-400">Creating your quote…</p>
      </div>
    );
  }

  // ─── Render: error ────────────────────────────────────────────────────────
  if (flowState === 'error') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className={`border rounded-xl p-6 ${errorMsg.includes('limit') ? 'bg-orange-50 border-orange-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className={`text-sm font-medium mb-1 ${errorMsg.includes('limit') ? 'text-orange-900' : 'text-amber-900'}`}>
            {errorMsg.includes('limit') ? 'Monthly proposal limit reached' : 'Couldn\'t process this request'}
          </p>
          <p className={`text-sm ${errorMsg.includes('limit') ? 'text-orange-800' : 'text-amber-800'}`}>{errorMsg}</p>
          {errorMsg.includes('limit') && (
            <a
              href="/pricing"
              className="inline-block mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Upgrade to get more proposals →
            </a>
          )}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => { setFlowState('input'); setErrorMsg(''); setFile(null); }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => { setFlowState('input'); setErrorMsg(''); setFile(null); setText(''); }}
            className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors"
          >
            Paste text instead
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: clarify ──────────────────────────────────────────────────────
  if (flowState === 'clarify' && analyzeResult) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Need a few details</h2>
          <p className="text-sm text-gray-500">To build your quote, we need a few things:</p>
        </div>

        <div className="flex flex-col gap-4">
          {analyzeResult.missing_critical_info.map((question, i) => (
            <div key={i}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{question}</label>
              <input
                type="text"
                value={clarifyAnswers[i] ?? ''}
                onChange={e => setClarifyAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                placeholder="Your answer…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400">Fill in what you know — leave blank if unsure</p>

        <button
          onClick={handleClarifySubmit}
          className="w-full py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors"
        >
          Continue to quote →
        </button>
      </div>
    );
  }

  return null;
}
