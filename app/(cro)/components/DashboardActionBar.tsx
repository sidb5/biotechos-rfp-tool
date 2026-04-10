'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardActionBar() {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const router = useRouter();

  function handleSubmit() {
    if (text.trim()) {
      try { sessionStorage.setItem('pendingRequest', text.trim()); } catch { /* ignore */ }
    }
    router.push('/rfp/new');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter submits
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  const rows = focused || text.length > 0 ? 8 : 3;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {/* Textarea side */}
        <div className="flex-1 w-full">
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder="Paste a client request, email, or RFP..."
            rows={rows}
            className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white transition-all duration-200"
          />
          <p className="mt-1.5 text-xs text-gray-400">
            Or{' '}
            <a
              href="/rfp/new"
              className="underline underline-offset-2 hover:text-gray-600 transition-colors"
            >
              upload a file (PDF, Word, email) →
            </a>
          </p>
        </div>

        {/* CTA side */}
        <div className="w-full sm:w-auto shrink-0 flex flex-col items-stretch sm:items-end gap-1.5">
          <button
            onClick={handleSubmit}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-bold rounded-lg transition-colors whitespace-nowrap"
          >
            Get quote →
          </button>
          <p className="text-xs text-gray-400 text-center sm:text-right">Takes about 60 seconds</p>
        </div>
      </div>
    </div>
  );
}
