'use client';

import { useState } from 'react';

interface LibraryEntry {
  id: string;
  section_name: string;
  section_label: string;
  study_type: string | null;
  assay_types: string[] | null;
  content: string;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  entries: LibraryEntry[];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LibraryList({ entries: initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this library entry? This cannot be undone.')) return;
    setDeleting(id);
    try {
      const res = await fetch('/api/library/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
        <p className="text-gray-600 text-sm font-medium mb-2">
          Your saved sections appear here as you refine your proposals.
        </p>
        <p className="text-gray-400 text-xs">
          The library fills itself through use — no manual steps needed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-400">{entries.length} saved {entries.length === 1 ? 'entry' : 'entries'}</p>
      {entries.map(entry => (
        <div key={entry.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900">{entry.section_label}</span>
                {entry.study_type && (
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">
                    {entry.study_type}
                  </span>
                )}
                {entry.usage_count > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium">
                    Used {entry.usage_count}×
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {(entry.assay_types ?? []).map(a => (
                  <span key={a} className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                    {a}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Saved {formatDate(entry.updated_at)}
                {entry.last_used_at && ` · Last used ${formatDate(entry.last_used_at)}`}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                className="text-xs text-gray-400 hover:text-gray-600 font-medium"
              >
                {expanded === entry.id ? 'Hide' : 'Preview'}
              </button>
              <button
                onClick={() => handleDelete(entry.id)}
                disabled={deleting === entry.id}
                className="text-xs text-red-400 hover:text-red-600 font-medium disabled:opacity-40"
              >
                {deleting === entry.id ? '…' : 'Delete'}
              </button>
            </div>
          </div>

          {/* Content preview */}
          {expanded === entry.id && (
            <div className="px-6 pb-5">
              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto border border-gray-100">
                {entry.content}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
