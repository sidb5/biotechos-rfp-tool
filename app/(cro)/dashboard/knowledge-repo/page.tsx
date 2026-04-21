'use client';

import { useState, useEffect, useRef } from 'react';
import AppShell from '@shared/components/AppShell';

interface RepoDoc {
  id: string;
  filename: string;
  file_type: 'pdf' | 'docx' | 'txt';
  created_at: string;
}

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  txt: 'Text',
};

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: 'bg-red-50 text-red-700 border-red-200',
  docx: 'bg-blue-50 text-blue-700 border-blue-200',
  txt: 'bg-gray-50 text-gray-600 border-gray-200',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function KnowledgeRepoPage() {
  const [docs, setDocs] = useState<RepoDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocs();
  }, []);

  async function loadDocs() {
    setLoading(true);
    try {
      const res = await fetch('/api/knowledge-repo/list');
      const data = await res.json();
      if (res.ok) setDocs(data.docs ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await uploadFile(file);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/knowledge-repo/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? 'Upload failed');
      } else {
        setDocs(prev => [data.doc, ...prev]);
      }
    } catch {
      setUploadError('Network error — upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this document from the knowledge repository?')) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/knowledge-repo/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setDocs(prev => prev.filter(d => d.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  const atLimit = docs.length >= 25;

  return (
    <AppShell title="Knowledge Repository" navInLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Knowledge Repository</h1>
          <p className="text-sm text-gray-500">
            Upload past proposals, SOPs, and capability documents. The AI uses these to detect gaps more accurately
            — documents it can verify mean fewer unnecessary SME interruptions.
          </p>
        </div>

        {/* Upload area */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 mb-1">Add a document</p>
              <p className="text-xs text-gray-400">
                Accepts PDF, Word (.docx), or plain text (.txt) · 10 MB max per file · {docs.length}/25 docs used
              </p>
              {uploadError && (
                <p className="text-xs text-red-600 mt-2">{uploadError}</p>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || atLimit}
              className="shrink-0 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {uploading ? 'Uploading…' : atLimit ? 'Limit reached' : '↑ Upload'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {/* Doc list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
            <svg className="w-8 h-8 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <p className="text-sm font-medium text-gray-500 mb-1">No documents yet</p>
            <p className="text-xs text-gray-400">
              Upload past proposals, SOPs, or capability documents.
              The AI will use these to detect gaps more accurately.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {docs.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                <span className={`shrink-0 px-1.5 py-0.5 text-[11px] font-semibold rounded border ${FILE_TYPE_COLORS[doc.file_type] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  {FILE_TYPE_LABELS[doc.file_type] ?? doc.file_type.toUpperCase()}
                </span>
                <span className="flex-1 text-sm text-gray-800 truncate font-medium">{doc.filename}</span>
                <span className="text-xs text-gray-400 shrink-0">{formatDate(doc.created_at)}</span>
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={deletingId === doc.id}
                  className="shrink-0 text-xs text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  {deletingId === doc.id ? '…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
