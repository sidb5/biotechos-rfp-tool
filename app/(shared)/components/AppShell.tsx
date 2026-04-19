'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';
import ThemeToggle from '@shared/components/ThemeToggle';

// ─── Nav structure ─────────────────────────────────────────────────────────

const PRIMARY_NAV = [
  {
    href: '/dashboard', label: 'Dashboard',
    icon: <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    href: '/quotes', label: 'Quotes',
    icon: <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    href: '/requests', label: 'RFP Bids',
    icon: <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>,
  },
  {
    href: '/actions-needed', label: 'Actions Needed',
    icon: <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
  },
  {
    href: '/notifications', label: 'Notifications',
    icon: <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  },
];

const SECONDARY_NAV = [
  {
    href: '/analytics', label: 'Analytics',
    icon: <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  },
  {
    href: '/benchmarks', label: 'Benchmarks',
    icon: <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>,
  },
  {
    href: '/library', label: 'Library',
    icon: <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>,
  },
];

const ACCOUNT_NAV = [
  { href: '/profile',            label: 'Profile'       },
  { href: '/settings/billing',   label: 'Billing'       },
  { href: '/settings/referrals', label: 'Referrals'     },
  { href: '/settings',           label: 'Settings'      },
  { href: '/settings/notifications', label: 'Notifications' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard')      return pathname === '/dashboard';
  if (href === '/quotes')         return pathname === '/quotes' || pathname.startsWith('/quote/');
  if (href === '/requests')       return pathname === '/requests' || pathname.startsWith('/rfp/') && !pathname.startsWith('/rfp/new');
  if (href === '/actions-needed') return pathname === '/actions-needed';
  if (href === '/settings')       return pathname === '/settings';
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
  const accountRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [userInitial, setUserInitial] = useState('U');
  const [userEmail, setUserEmail]     = useState('');

  // Unread notification count — refreshes every 30 s
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    async function fetchUnread() {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('read', false);
      setUnreadCount(count ?? 0);
    }
    void fetchUnread();
    const interval = setInterval(() => { void fetchUnread(); }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch user email for profile pill
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? '';
      setUserEmail(email);
      setUserInitial((email[0] ?? 'U').toUpperCase());
    });
  }, []);

  // Close account popover on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (accountOpen && accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [accountOpen]);

  return (
    <aside className="hidden md:flex flex-col w-52 shrink-0 bg-white border-r border-gray-100 h-screen fixed top-0 left-0 z-20">

      {/* ── Logo + create buttons ── */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-gray-100">
        <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-3">Proposal Engine</p>
        <div className="flex gap-1.5">
          <button
            onClick={() => router.push('/rfp/new?mode=quick_quote')}
            className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors"
          >
            + Quote
          </button>
          <button
            onClick={() => router.push('/rfp/new?mode=formal_rfp')}
            className="flex-1 py-1.5 border border-green-600 text-green-700 hover:bg-green-50 text-xs font-semibold rounded-lg transition-colors"
          >
            + RFP Bid
          </button>
        </div>
      </div>

      {/* ── Scrollable nav (scrollbar hidden) ── */}
      <div
        className="flex-1 min-h-0 overflow-y-auto py-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
      >
        <nav className="px-3 flex flex-col gap-0.5">
          {PRIMARY_NAV.map(({ href, label, icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className={active ? 'text-green-600' : 'text-gray-400'}>{icon}</span>
                <span className="flex-1">{label}</span>
                {href === '/notifications' && unreadCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                {href === '/actions-needed' && unreadCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-600 px-1.5 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mx-4 my-2 border-t border-gray-100" />

        <nav className="px-3 flex flex-col gap-0.5">
          {SECONDARY_NAV.map(({ href, label, icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <span className={active ? 'text-green-600' : 'text-gray-400'}>{icon}</span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── User profile pill — always visible at bottom ── */}
      <div ref={accountRef} className="shrink-0 p-3 border-t border-gray-100 relative">
        {/* Account popover — expands upward */}
        {accountOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1">
            {ACCOUNT_NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setAccountOpen(false)}
                className={`flex items-center px-4 py-2 text-sm transition-colors ${
                  isActive(pathname, href)
                    ? 'text-green-700 bg-green-50'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {label}
              </Link>
            ))}
            <div className="mx-3 my-1 border-t border-gray-100" />
            <ThemeToggle />
            <button
              onClick={() => { setAccountOpen(false); onSignOut(); }}
              className="w-full flex items-center px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}

        {/* The pill button */}
        <button
          onClick={() => setAccountOpen(o => !o)}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
        >
          <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-white">{userInitial}</span>
          </div>
          <span className="flex-1 text-left text-xs text-gray-600 truncate">{userEmail || 'Account'}</span>
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${accountOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
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
          {SECONDARY_NAV.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                isActive(pathname, href) ? 'bg-green-50 text-green-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className={isActive(pathname, href) ? 'text-green-600' : 'text-gray-400'}>{icon}</span>
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
        {/* Dashboard */}
        <Link
          href="/dashboard"
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full text-xs font-medium transition-colors ${
            isActive(pathname, '/dashboard') ? 'text-green-600' : 'text-gray-400'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive(pathname, '/dashboard') ? 2.5 : 1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Dashboard
        </Link>

        {/* Actions */}
        <Link
          href="/actions-needed"
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full text-xs font-medium transition-colors ${
            isActive(pathname, '/actions-needed') ? 'text-green-600' : 'text-gray-400'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive(pathname, '/actions-needed') ? 2.5 : 1.8} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          Actions
        </Link>

        {/* Centre + button */}
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => router.push('/rfp/new')}
            className="w-12 h-12 bg-green-600 hover:bg-green-700 text-white text-2xl font-bold rounded-full flex items-center justify-center shadow-lg transition-colors -mt-4"
            aria-label="New quote or RFP response"
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
      <div className="flex-1 md:ml-52 flex flex-col min-h-screen">
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
      <div className="flex-1 md:ml-52 flex flex-col min-h-screen">
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
