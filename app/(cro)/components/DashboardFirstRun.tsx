'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardFirstRun() {
  const [text, setText] = useState('');
  const router = useRouter();

  function handleSubmit() {
    if (text.trim()) {
      try { sessionStorage.setItem('pendingRequest', text.trim()); } catch { /* ignore */ }
    }
    router.push('/rfp/new');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-xl">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 text-center">
          Paste your first client request
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={"Paste an email, a PDF description, or anything a client sent you asking about running a study..."}
          rows={8}
          className="w-full resize-none rounded-xl border border-gray-200 px-5 py-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white shadow-sm transition-all"
        />
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            onClick={handleSubmit}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-bold rounded-lg transition-colors"
          >
            Get your first quote →
          </button>
          <p className="text-xs text-gray-400">
            Or{' '}
            <a href="/rfp/new" className="underline underline-offset-2 hover:text-gray-600 transition-colors">
              upload a file (PDF, Word, email) →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
