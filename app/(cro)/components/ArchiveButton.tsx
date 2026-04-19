'use client';

// ArchiveButton — soft-deletes a proposal/quote by setting status='archived'.
// Used on both list pages and the detail page.
// On success, redirects to `redirectTo` (defaults to the list the user came from).

import { useState }    from 'react';
import { useRouter }   from 'next/navigation';

interface Props {
  proposalId:  string;
  redirectTo?: string;       // where to go after archive (default: back)
  label?:      string;       // button text (default: 'Archive')
  variant?:    'icon' | 'text'; // icon = just the trash icon; text = labelled button
}

export default function ArchiveButton({
  proposalId,
  redirectTo,
  label   = 'Archive',
  variant = 'text',
}: Props) {
  const router   = useRouter();
  const [busy, setBusy]           = useState(false);
  const [confirm, setConfirm]     = useState(false);

  async function doArchive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/proposal/${proposalId}`, { method: 'PATCH' });
      if (!res.ok) { alert('Archive failed — please try again.'); setBusy(false); return; }
      if (redirectTo) router.push(redirectTo);
      else router.back();
      router.refresh();
    } catch {
      alert('Archive failed — please try again.');
      setBusy(false);
    }
  }

  if (confirm) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs text-gray-500">Archive this?</span>
        <button
          onClick={doArchive}
          disabled={busy}
          className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          {busy ? 'Archiving…' : 'Yes, archive'}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </span>
    );
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirm(true); }}
        title="Archive"
        className="p-1.5 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
    >
      {label}
    </button>
  );
}
