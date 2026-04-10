'use client';

import { useState } from 'react';

interface Props {
  proposalId: string;
  type: 'pdf' | 'docx';
  label: string;
}

export default function DashboardDownloadLink({ proposalId, type, label }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = type === 'pdf' ? '/api/proposal/export-pdf' : '/api/proposal/export-docx';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `proposal.${type}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-gray-400 hover:text-gray-600 text-xs disabled:opacity-40"
    >
      {loading ? '…' : label}
    </button>
  );
}
