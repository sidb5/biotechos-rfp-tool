// Main content script. Runs inside every Gmail tab.
//
// Responsibilities by task:
//   Task 1: Boot safely, start Gmail SPA observer, inject status badge.
//   Task 2: Cache auth state, respond to AUTH_CHANGED broadcasts.
//   Task 3: Wire Gmail view changes → quote button injection + lazy observer.
//           Gate button on auth state (no auth = no button).
//   Task 4: Register onGenerate callback → open the side panel (stub here,
//           implemented in sidebar.js which is loaded in Task 4).

(function bootContentScript(root) {
  if (window.top !== window) return; // ignore Gmail's embedded iframes

  const CFG     = root.BIOTECHOS_CONFIG;
  const { el, klass, purgeInjected } = root.BIOTECHOS_DOM;
  const GMAIL   = root.BIOTECHOS_GMAIL;
  const QB      = root.BIOTECHOS_QUOTE_BUTTON;
  const SIDEBAR = root.BIOTECHOS_SIDEBAR;

  if (!CFG || !GMAIL || !QB || !SIDEBAR) {
    console.warn('[biotechos] content script missing dependencies');
    return;
  }

  if (root.__BIOTECHOS_CONTENT_BOOTED__) return;
  root.__BIOTECHOS_CONTENT_BOOTED__ = true;

  console.info('[biotechos] content script booted');

  // ── Auth state ──────────────────────────────────────────────────────────
  let authState = null;

  function isAuthenticated() {
    return !!(authState && authState.ok && authState.authenticated);
  }

  // ── Status badge ────────────────────────────────────────────────────────
  let badgeEl = null;

  function ensureBadge() {
    if (badgeEl && document.body.contains(badgeEl)) return badgeEl;
    badgeEl = el('div', {
      cls: klass('badge'),
      attrs: {
        [`data-${CFG.CSS_PREFIX}mark`]: 'badge',
        role: 'status',
        'aria-live': 'polite'
      }
    }, [
      el('span', { cls: klass('badge-dot'), attrs: { [`data-${CFG.CSS_PREFIX}mark`]: 'badge-dot' } }),
      el('span', { cls: klass('badge-label'), text: 'BiotechOS', attrs: { [`data-${CFG.CSS_PREFIX}mark`]: 'badge-label' } })
    ]);
    document.body.appendChild(badgeEl);
    return badgeEl;
  }

  function updateBadge(state) {
    const b     = ensureBadge();
    const label = b.querySelector(`[data-${CFG.CSS_PREFIX}mark="badge-label"]`);
    const dot   = b.querySelector(`[data-${CFG.CSS_PREFIX}mark="badge-dot"]`);
    if (!label || !dot) return;

    if (authState && !authState.ok) {
      label.textContent = 'BiotechOS · offline';
      dot.className = klass('badge-dot', 'badge-dot--error');
      b.title = authState.error || 'Cannot reach BiotechOS';
      return;
    }
    if (authState && authState.ok && !authState.authenticated) {
      label.textContent = 'BiotechOS · sign in';
      dot.className = klass('badge-dot', 'badge-dot--idle');
      b.title = 'Sign in at BiotechOS to generate quotes from Gmail';
      return;
    }

    b.title = authState?.profile?.companyName
      ? `Signed in as ${authState.profile.companyName}`
      : 'BiotechOS Quote Assistant';

    if (!state.ready) {
      label.textContent = 'BiotechOS · loading…';
      dot.className = klass('badge-dot', 'badge-dot--idle');
      return;
    }

    if (state.view === 'thread') {
      label.textContent = state.subject
        ? `BiotechOS · ${truncate(state.subject, 40)}`
        : 'BiotechOS · thread open';
      dot.className = klass('badge-dot', 'badge-dot--active');
    } else if (state.view === 'compose') {
      label.textContent = 'BiotechOS · composing';
      dot.className = klass('badge-dot', 'badge-dot--active');
    } else {
      label.textContent = 'BiotechOS · ready';
      dot.className = klass('badge-dot', 'badge-dot--idle');
    }
  }

  function truncate(s, n) {
    return s && s.length > n ? s.slice(0, n - 1) + '…' : (s || '');
  }

  // ── Gmail observer subscription ─────────────────────────────────────────
  let lastThreadId = null;

  GMAIL.subscribe((state) => {
    updateBadge(state);

    // Relay to service worker (popup context panel).
    try {
      const p = chrome.runtime.sendMessage({
        type: CFG.MESSAGES.GMAIL_STATE_CHANGED,
        payload: {
          view:        state.view,
          threadId:    state.threadId,
          url:         state.url,
          subject:     state.subject,
          emailCount:  state.openEmails.length
        }
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* worker sleeping */ }

    // ── Task 3: quote button gating ─────────────────────────────────────
    if (state.view === 'thread' && state.ready) {
      if (isAuthenticated()) {
        // New thread opened — trigger a fresh scan.
        if (state.threadId !== lastThreadId) {
          lastThreadId = state.threadId;
          // Small defer so Gmail finishes painting the thread before we query.
          setTimeout(() => QB.onThreadOpen(state), 80);
        }
      } else if (authState !== null) {
        // Auth loaded but user isn't signed in — clean up stale buttons.
        // (Don't close if authState is null — we're just waiting for CHECK_AUTH.)
        QB.onThreadClose();
      }
    } else if (state.view !== 'thread') {
      if (lastThreadId !== null) {
        lastThreadId = null;
        QB.onThreadClose();
        // Remove any injected buttons; they'll be re-evaluated on re-entry.
        purgeInjected(document);
      }
    }
  });

  // ── Task 4: wire quote button → sidebar ────────────────────────────────
  QB.setOnGenerate(({ card, btn, from, body, subject, detection }) => {
    SIDEBAR.startGenerate({ card, btn, from, body, subject, detection, authState });
  });

  // ── Message listener ────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return false;

    if (msg.type === CFG.MESSAGES.PING) {
      const s = GMAIL.getState();
      sendResponse({
        ok: true, ts: Date.now(),
        state: { view: s.view, threadId: s.threadId, subject: s.subject,
                 emailCount: s.openEmails.length, ready: s.ready },
        auth: authState
      });
      return false;
    }

    if (msg.type === CFG.MESSAGES.AUTH_CHANGED) {
      const wasAuthed = isAuthenticated();
      authState = msg.payload || null;
      updateBadge(GMAIL.getState());
      // If auth just dropped, purge quote buttons and close sidebar.
      if (wasAuthed && !isAuthenticated()) {
        QB.onThreadClose();
        SIDEBAR.closeSidebar();
        purgeInjected(document);
      }

      // If auth just arrived and we're in a thread, inject buttons now.
      if (!wasAuthed && isAuthenticated()) {
        const s = GMAIL.getState();
        if (s.view === 'thread' && s.ready) {
          lastThreadId = s.threadId;
          setTimeout(() => QB.onThreadOpen(s), 80);
        }
      }

      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  // ── Boot ────────────────────────────────────────────────────────────────
  try {
    const p = chrome.runtime.sendMessage({ type: CFG.MESSAGES.CHECK_AUTH });
    if (p && typeof p.then === 'function') {
      p.then((state) => {
        if (state) {
          authState = state;
          updateBadge(GMAIL.getState());
          const s = GMAIL.getState();
          if (isAuthenticated() && s.view === 'thread' && s.ready) {
            lastThreadId = s.threadId;
            QB.onThreadOpen(s);
          }
        }
      }).catch(() => {});
    }
  } catch { /* worker asleep */ }

  GMAIL._start();
})(typeof self !== 'undefined' ? self : globalThis);
