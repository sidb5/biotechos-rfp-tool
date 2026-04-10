'use client';

import { useState, useRef } from 'react';
import type { ParsedRFP } from '@cro/types';
import ParsedRFPSummary from '@cro/components/ParsedRFPSummary';

interface RFPInputFormProps {
  croProfileId: string;
}

type InputMode = 'paste' | 'upload';

export default function RFPInputForm({ croProfileId }: RFPInputFormProps) {
  const [mode, setMode] = useState<InputMode>('paste');
  const [pastedText, setPastedText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rfpId, setRfpId] = useState<string | null>(null);
  const [parsedRFP, setParsedRFP] = useState<ParsedRFP | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && isValidFile(dropped)) {
      setFile(dropped);
      setMode('upload');
      setError('');
    } else {
      setError('Only .pdf and .docx files are supported.');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected && isValidFile(selected)) {
      setFile(selected);
      setError('');
    } else if (selected) {
      setError('Only .pdf and .docx files are supported.');
      setFile(null);
    }
  }

  function isValidFile(f: File) {
    return (
      f.type === 'application/pdf' ||
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      f.name.endsWith('.pdf') ||
      f.name.endsWith('.docx')
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setParsedRFP(null);
    setRfpId(null);

    try {
      let body: FormData | string;
      let headers: Record<string, string> = {};

      if (mode === 'upload' && file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('cro_profile_id', croProfileId);
        body = fd;
        // Don't set Content-Type — browser sets multipart boundary automatically
      } else {
        if (!pastedText.trim()) {
          setError('Please paste an RFP or upload a file.');
          setLoading(false);
          return;
        }
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          text: pastedText.trim(),
          cro_profile_id: croProfileId,
        });
      }

      const res = await fetch('/api/rfp/parse', {
        method: 'POST',
        headers,
        body,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      setParsedRFP(data.parsed);
      setRfpId(data.rfp_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  // After parsing, show the summary editor
  if (parsedRFP && rfpId) {
    return (
      <ParsedRFPSummary
        initialData={parsedRFP}
        rfpId={rfpId}
        croProfileId={croProfileId}
        onBack={() => {
          setParsedRFP(null);
          setRfpId(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

      {/* Mode toggle */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => { setMode('paste'); setFile(null); setError(''); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'paste'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Paste text
        </button>
        <button
          type="button"
          onClick={() => { setMode('upload'); setPastedText(''); setError(''); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'upload'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Upload file
        </button>
      </div>

      {/* Paste mode */}
      {mode === 'paste' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Paste the full RFP text
          </label>
          <textarea
            rows={16}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste the full text of the incoming RFP here — the more detail, the better the parsed summary..."
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y font-mono leading-relaxed"
          />
          <p className="text-xs text-gray-400 mt-1">
            {pastedText.trim() === '' ? '0' : pastedText.trim().split(/\s+/).length} words
          </p>
        </div>
      )}

      {/* Upload mode */}
      {mode === 'upload' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload PDF or Word document
          </label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-green-400 bg-green-50'
                : file
                ? 'border-green-300 bg-green-50'
                : 'border-gray-300 hover:border-gray-400 bg-white'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              className="hidden"
            />

            {file ? (
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl">📄</span>
                <p className="text-sm font-medium text-green-700">{file.name}</p>
                <p className="text-xs text-gray-400">
                  {(file.size / 1024).toFixed(0)} KB — click to change
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl text-gray-300">⬆</span>
                <p className="text-sm font-medium text-gray-600">
                  Drop a file here, or click to browse
                </p>
                <p className="text-xs text-gray-400">.pdf or .docx accepted</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={loading || (mode === 'upload' && !file)}
          className="px-8 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Parsing RFP…
            </>
          ) : (
            'Parse RFP →'
          )}
        </button>
        {loading && (
          <p className="text-sm text-gray-400">
            Reading the RFP — usually under 15 seconds
          </p>
        )}
      </div>
    </form>
  );
}
