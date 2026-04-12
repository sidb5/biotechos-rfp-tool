'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import ThemeToggle from '@shared/components/ThemeToggle';

const NAV = [
  {
    label: 'Dashboard',
    href:  '/biotech/dashboard',
    icon:  (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Study Briefs',
    href:  '/biotech/briefs',
    icon:  (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    label: 'Engagements',
    href:  '/biotech/engagements',
    icon:  (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href:  '/biotech/settings',
    icon:  (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function BiotechNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    if (href === '/biotech/dashboard') return pathname === href;
    return pathname.startsWith(href);
  }

  const navLinks = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map(item => (
        <a
          key={item.href}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isActive(item.href)
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <span className={isActive(item.href) ? 'text-blue-600' : 'text-gray-400'}>
            {item.icon}
          </span>
          {item.label}
        </a>
      ))}

      <div className="mt-auto pt-4 border-t border-gray-100 mx-1 space-y-1">
        <a
          href="/biotech/briefs/new"
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          New Brief
        </a>
        <ThemeToggle className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors" />
      </div>
    </nav>
  );

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-gray-100 bg-white min-h-screen sticky top-0">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">BiotechOS</p>
          <p className="text-xs text-gray-600 mt-0.5">CRO Engagement Pipeline</p>
        </div>
        <div className="flex-1 flex flex-col">
          {navLinks}
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-30">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">BiotechOS</p>
        </div>
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="text-gray-600 hover:text-gray-900 transition-colors p-1"
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu dropdown */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-20 bg-black/60" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute top-[52px] left-0 right-0 bg-white border-b border-gray-100 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {navLinks}
          </div>
        </div>
      )}
    </>
  );
}
