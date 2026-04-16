'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import AdminNav from '../components/AdminNav';

type GuardState = 'loading' | 'approved' | 'pending' | 'not_admin' | 'unauthenticated';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<GuardState>('loading');

  // Login page doesn't need admin guard
  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) { setState('approved'); return; }

    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setState('unauthenticated'); return; }

      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        setState('approved');
      } else if (res.status === 403) {
        setState('pending');
      } else {
        setState('not_admin');
      }
    }
    check();
  }, [isLoginPage, pathname]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-red-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (state === 'unauthenticated') {
    router.push('/admin/login');
    return null;
  }

  if (state === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xl font-bold">⏳</div>
        <h1 className="text-xl font-semibold text-gray-900">Pending approval</h1>
        <p className="text-sm text-gray-500 max-w-sm">
          Your admin account is waiting for approval from the platform administrator. You&apos;ll be able to log in once approved.
        </p>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push('/admin/login'); }}
          className="mt-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (state === 'not_admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xl font-bold">✗</div>
        <h1 className="text-xl font-semibold text-gray-900">Access denied</h1>
        <p className="text-sm text-gray-500">This account does not have admin access.</p>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push('/admin/login'); }}
          className="mt-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminNav />
      <div className="flex-1 lg:ml-0">
        {children}
      </div>
    </div>
  );
}
