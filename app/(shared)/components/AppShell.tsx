'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import ThemeToggle from '@shared/components/ThemeToggle';

// ─── Nav structure ─────────────────────────────────────────────────────────

const PRIMARY_NAV = [
  { href: '/dashboard', label: 'Proposals' },
  { href: '/requests',  label: 'RFP/Quote Requests'  },
];

const SECONDARY_NAV = [
  { href: '/analytics',  label: 'Analytics'   },
  { href: '/benchmarks', label: 'Benchmarks'  },
  { href: '/library',    label: 'Library'     },
];

const ACCOUNT_NAV = [
  { href: '/profile',                label: 'Profile'       },
  { href: '/settings/billing',       label: 'Billing'       },
  { href: '/settings/referrals',     label: 'Referrals'     },
  { href: '/settings/notifications', label: 'Notifications' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/proposals/');
  if (href === '/requests')  return pathname === '/requests' || pathname === '/rfp/new';
  return pathname.startsWith(href);
}

// ─── Keyboard shortcut N ──────────────────────────────────────────────────

function KeyboardShortcutN() {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        router.push('/rfp/new');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);
  return null;
}

// ─── Desktop Sidebar ───────────────────────────────────────────────────────

function Sidebar({ onSignOut }: { onSignOut: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white border-r border-gray-100 min-h-screen fixed top-0 left-0 z-20">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100">
        <p className="text-xs font-bold tracking-widest uppercase text-gray-400">Proposal Engine</p>
      </div>

      {/* + New quote */}
      <div className="px-4 pt-4">
        <button
          onClick={() => router.push('/rfp/new')}
          className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-base leading-none">+</span> New quote
        </button>
      </div>

      {/* Primary nav */}
      <nav className="px-3 pt-4 flex flex-col gap-0.5">
        {PRIMARY_NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive(pathname, href)
                ? 'bg-green-50 text-green-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-4 my-3 border-t border-gray-100" />

      {/* Secondary nav */}
      <nav className="px-3 flex flex-col gap-0.5">
        {SECONDARY_NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              isActive(pathname, href)
                ? 'bg-green-50 text-green-700'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Account — pinned to bottom */}
      <div className="mt-auto px-3 pb-4 border-t border-gray-100 pt-3">
        {ACCOUNT_NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              isActive(pathname, href)
                ? 'bg-green-50 text-green-700'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            {label}
          </Link>
        ))}
        <ThemeToggle />
        <button
          onClick={onSignOut}
          className="w-full flex items-center px-3 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors mt-0.5"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ─── Mobile "More" Drawer ─────────────────────────────────────────────────

function MobileMoreDrawer({ open, onClose, onSignOut }: { open: boolean; onClose: () => void; onSignOut: () => void }) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on outside tap
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (open && drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={onClose} />
      )}
      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl z-40 md:hidden transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-4" />

        <div className="px-4 pb-24 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 px-3 mb-2">Analytics</p>
          {SECONDARY_NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                isActive(pathname, href) ? 'bg-green-50 text-green-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </Link>
          ))}

          <div className="my-2 border-t border-gray-100" />
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 px-3 mb-2">Account</p>
          {ACCOUNT_NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                isActive(pathname, href) ? 'bg-green-50 text-green-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </Link>
          ))}
          <button
            onClick={() => { onClose(); onSignOut(); }}
            className="flex items-center px-3 py-3 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Mobile Bottom Tab Bar ─────────────────────────────────────────────────

function MobileTabBar({ onMoreClick }: { onMoreClick: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30 md:hidden safe-area-pb">
      <div className="flex items-center h-16">
        {/* Proposals */}
        <Link
          href="/dashboard"
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full text-xs font-medium transition-colors ${
            isActive(pathname, '/dashboard') ? 'text-green-600' : 'text-gray-400'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive(pathname, '/dashboard') ? 2.5 : 1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Proposals
        </Link>

        {/* Requests */}
        <Link
          href="/requests"
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full text-xs font-medium transition-colors ${
            isActive(pathname, '/requests') ? 'text-green-600' : 'text-gray-400'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive(pathname, '/requests') ? 2.5 : 1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Requests
        </Link>

        {/* Centre + button */}
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => router.push('/rfp/new')}
            className="w-12 h-12 bg-green-600 hover:bg-green-700 text-white text-2xl font-bold rounded-full flex items-center justify-center shadow-lg transition-colors -mt-4"
            aria-label="New quote"
          >
            +
          </button>
        </div>

        {/* More */}
        <button
          onClick={onMoreClick}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full text-xs font-medium text-gray-400"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          More
        </button>
      </div>
    </nav>
  );
}

// ─── App Shell ─────────────────────────────────────────────────────────────

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  headerActions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  /** When true, skip rendering Sidebar + MobileTabBar (they live in the layout) */
  navInLayout?: boolean;
}

export default function AppShell({ children, title, headerActions, backHref, backLabel, navInLayout }: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // When nav lives in the layout, only render header + content (no sidebar/mobile nav)
  if (navInLayout) {
    return (
      <>
        <header className="bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between gap-4 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            {backHref && (
              <Link href={backHref} className="text-sm text-gray-400 hover:text-gray-600 shrink-0">
                ← {backLabel ?? 'Back'}
              </Link>
            )}
            <h1 className="text-base font-bold text-gray-900 truncate">{title}</h1>
          </div>
          {headerActions && <div className="flex items-center gap-2 shrink-0">{headerActions}</div>}
        </header>
        <main className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <KeyboardShortcutN />

      {/* Desktop sidebar */}
      <Sidebar onSignOut={handleSignOut} />

      {/* Main content — offset by sidebar width on desktop */}
      <div className="flex-1 md:ml-56 flex flex-col min-h-screen">
        {/* Page header */}
        <header className="bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between gap-4 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            {backHref && (
              <Link href={backHref} className="text-sm text-gray-400 hover:text-gray-600 shrink-0">
                ← {backLabel ?? 'Back'}
              </Link>
            )}
            <h1 className="text-base font-bold text-gray-900 truncate">{title}</h1>
          </div>
          {headerActions && <div className="flex items-center gap-2 shrink-0">{headerActions}</div>}
        </header>

        {/* Page body — with padding for mobile bottom bar */}
        <main className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <MobileTabBar onMoreClick={() => setMoreOpen(true)} />

      {/* Mobile more drawer */}
      <MobileMoreDrawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onSignOut={handleSignOut}
      />
    </div>
  );
}

/** Standalone CRO nav shell for use in layout.tsx — renders sidebar + mobile nav only */
export function CRONavShell({ children }: { children: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <KeyboardShortcutN />
      <Sidebar onSignOut={handleSignOut} />
      <div className="flex-1 md:ml-56 flex flex-col min-h-screen">
        {children}
      </div>
      <MobileTabBar onMoreClick={() => setMoreOpen(true)} />
      <MobileMoreDrawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
