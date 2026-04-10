'use client';

import { useState, useEffect } from 'react';

interface Version {
  id: string;
  version_number: number;
  content: string;
  created_at: string;
}

interface Props {
  sectionId: string;
  sectionLabel: string;
  onRestore: (content: string) => void;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function VersionHistoryPanel({ sectionId, sectionLabel, onRestore, onClose }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/proposal/sections/${sectionId}/versions`)
      .then(r => r.json())
      .then(d => setVersions(d.versions ?? []))
      .finally(() => setLoading(false));
  }, [sectionId]);

  async function handleRestore(versionId: string, versionNumber: number) {
    const confirmed = window.confirm(
      `Restore version ${versionNumber}? The current content will be saved as a new version first.`
    );
    if (!confirmed) return;

    setRestoring(versionId);
    try {
      const res = await fetch(`/api/proposal/sections/${sectionId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: versionId }),
      });
      const data = await res.json();
      if (res.ok) {
        onRestore(data.content);
        onClose();
      }
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="w-96 bg-white shadow-2xl flex flex-col h-full">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Version History</h3>
            <p className="text-xs text-gray-400 mt-0.5">{sectionLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              Loading…
            </div>
          ) : versions.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              No saved versions yet. Versions are created automatically each time you save.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {versions.map(v => (
                <div key={v.id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-xs font-semibold text-gray-700">
                        Version {v.version_number}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">{formatDate(v.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        {expanded === v.id ? 'Hide' : 'Preview'}
                      </button>
                      <button
                        onClick={() => handleRestore(v.id, v.version_number)}
                        disabled={restoring === v.id}
                        className="text-xs px-2.5 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-40 font-medium"
                      >
                        {restoring === v.id ? '…' : 'Restore'}
                      </button>
                    </div>
                  </div>
                  {expanded === v.id && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                      {v.content.slice(0, 500)}{v.content.length > 500 ? '…' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
