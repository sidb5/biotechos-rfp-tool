'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Global navigation progress bar.
 * Shows a thin animated bar at the top of the viewport when a same-origin
 * link/row click triggers a page navigation. Hides when the route changes.
 * Drop into root layout — works across all apps (CRO, biotech, admin).
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the route changes, finish the bar and hide it
  useEffect(() => {
    if (visible) {
      // Jump to 100% then fade out
      setWidth(100);
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 300);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Listen for clicks on links / clickable rows that will trigger navigation
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // Don't show for modified clicks (new tab, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      const target = e.target as HTMLElement;

      // Walk up to find the nearest <a> with href, or an element with
      // an onClick that uses router.push (cursor-pointer is the signal)
      let el: HTMLElement | null = target;
      let href: string | null = null;

      while (el && el !== document.body) {
        if (el.tagName === 'A') {
          href = el.getAttribute('href');
          break;
        }
        // Clickable rows (cursor-pointer on tr/div/li) that navigate
        if (
          el.classList.contains('cursor-pointer') &&
          (el.tagName === 'TR' || el.tagName === 'DIV' || el.tagName === 'LI')
        ) {
          href = '__row_click__';
          break;
        }
        el = el.parentElement;
      }

      if (!href) return;

      // Skip external links, anchor links, and javascript: hrefs
      if (href !== '__row_click__') {
        if (href.startsWith('http') && !href.startsWith(window.location.origin)) return;
        if (href.startsWith('#') || href.startsWith('javascript:')) return;
        if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
        // Skip if it's the current page
        if (href === window.location.pathname) return;
      }

      // Start the progress bar
      startProgress();
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startProgress() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    setVisible(true);
    setWidth(15);

    // Gradually increase width (slowing as it approaches 90%)
    let current = 15;
    timerRef.current = setInterval(() => {
      current += (90 - current) * 0.08;
      if (current >= 89) {
        if (timerRef.current) clearInterval(timerRef.current);
        current = 90;
      }
      setWidth(current);
    }, 100);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none"
      style={{ opacity: width >= 100 ? 0 : 1, transition: 'opacity 300ms ease' }}
    >
      <div
        className="h-full bg-blue-500 rounded-r-full"
        style={{
          width: `${width}%`,
          transition: width === 0 ? 'none' : 'width 200ms ease',
          boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)',
        }}
      />
    </div>
  );
}
