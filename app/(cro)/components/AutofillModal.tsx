'use client';

import { useState, useRef, useCallback } from 'react';

export interface AutofillResult {
  profile: {
    company_name: string | null;
    company_overview: string | null;
    therapeutic_areas: string[];
    assay_types: string[];
    team_members: { name: string; title: string; years_experience: number; expertise: string }[];
    facility_description: string | null;
    accreditations: string[];
    geographic_reach: string | null;
  };
  pricing: {
    pricing_found: boolean;
    prices: { assay_type: string; price_per_sample: number | null; price_notes: string }[];
  };
}

interface AutofillModalProps {
  onClose: () => void;
  onResult: (result: AutofillResult) => void;
}

const ACCEPTED = '.pdf,.docx,.doc,.txt,.html';
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/html',
]);

export default function AutofillModal({ onClose, onResult }: AutofillModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: File[]) => {
    setError('');
    const valid: File[] = [];
    for (const f of incoming) {
      if (!ALLOWED_MIME.has(f.type.split(';')[0].trim())) {
        setError(`"${f.name}" is not a supported file type. Use PDF, DOCX, TXT, or HTML.`);
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        setError(`"${f.name}" is over 10MB. Please use a smaller file.`);
        return;
      }
      valid.push(f);
    }
    setFiles(prev => {
      const combined = [...prev, ...valid];
      if (combined.length > 5) {
        setError('Maximum 5 files allowed.');
        return prev;
      }
      return combined;
    });
  }, []);

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    addFiles(dropped);
  }

  async function handleExtract() {
    if (files.length === 0 && !pastedText.trim()) {
      setError('Please upload at least one file or paste some text.');
      return;
    }

    setLoading(true);
    setError('');

    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    fd.append('text', pastedText);

    try {
      const res = await fetch('/api/profile/autofill', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`);
      onResult(body as AutofillResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Auto-fill from documents</h2>
            <p className="text-xs text-gray-500 mt-0.5">Upload your capability statement, brochure, or website copy</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Drop zone */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Upload files <span className="text-gray-400 font-normal">(PDF, DOCX, TXT, HTML — max 10MB each, up to 5)</span></p>
            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                dragging ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                multiple
                className="hidden"
                onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
              />
              <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-gray-500">Drop files here or <span className="text-green-600 font-medium">browse</span></p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-xs text-gray-700 truncate">{f.name}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-100" />
            <span className="text-xs text-gray-400">or paste text</span>
            <div className="flex-1 border-t border-gray-100" />
          </div>

          {/* Paste area */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">Paste website copy, bio, or any text</label>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste content from your website, capability statement, or any document here..."
              rows={5}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Info */}
          <p className="text-xs text-gray-400 leading-relaxed">
            AI will extract company info, assay types, team members, accreditations and more. You&apos;ll review everything before anything is applied to your profile.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExtract}
            disabled={loading || (files.length === 0 && !pastedText.trim())}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Extracting…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Extract with AI
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
