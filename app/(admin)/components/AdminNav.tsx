'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';

const NAV = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'Users',     href: '/admin/users' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/admin/login');
  }

  return (
    <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-gray-200 bg-white min-h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-gray-100">
        <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">BiotechOS</p>
        <p className="text-xs text-gray-600 mt-0.5">Admin Portal</p>
      </div>
      <nav className="flex flex-col gap-1 p-3 flex-1">
        {NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              pathname.startsWith(item.href)
                ? 'bg-red-50 text-red-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            {item.label}
          </Link>
        ))}
        <div className="mt-auto pt-4 border-t border-gray-100 mx-1">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-red-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>
    </aside>
  );
}
