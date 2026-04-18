// Main content script — boots the biotech outreach extension in every Gmail tab.

(function bootContentScript(root) {
  if (window.top !== window) return; // ignore Gmail iframes

  const CFG    = root.BIOTECHOS_CONFIG;
  const { el, klass, purgeInjected } = root.BIOTECHOS_DOM;
  const GMAIL  = root.BIOTECHOS_GMAIL;
  const COMPOSE = root.BIOTECHOS_COMPOSE;
  const RP     = root.BIOTECHOS_REPLY_BUTTON;
  const REPLY_PANEL = root.BIOTECHOS_REPLY_PANEL;
  const OUTREACH_PANEL = root.BIOTECHOS_OUTREACH_PANEL;

  if (!CFG || !GMAIL || !COMPOSE || !RP) {
    console.warn('[biotechos] content script missing dependencies');
    return;
  }

  if (root.__BIOTECHOS_BIOTECH_BOOTED__) return;
  root.__BIOTECHOS_BIOTECH_BOOTED__ = true;

  console.info('[biotechos] biotech outreach content script booted');

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
      cls:   klass('badge'),
      attrs: { [`data-${CFG.CSS_PREFIX}mark`]: 'badge', role: 'status', 'aria-live': 'polite' }
    }, [
      el('span', { cls: klass('badge-dot'), attrs: { [`data-${CFG.CSS_PREFIX}mark`]: 'badge-dot' } }),
      el('span', { cls: klass('badge-label'), text: 'BiotechOS Outreach', attrs: { [`data-${CFG.CSS_PREFIX}mark`]: 'badge-label' } })
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
      return;
    }
    if (authState && authState.ok && !authState.authenticated) {
      label.textContent = 'BiotechOS · sign in';
      dot.className = klass('badge-dot', 'badge-dot--idle');
      return;
    }

    if (!state.ready) {
      label.textContent = 'BiotechOS · loading…';
      dot.className = klass('badge-dot', 'badge-dot--idle');
      return;
    }

    if (state.view === 'thread') {
      label.textContent = 'BiotechOS · thread';
      dot.className = klass('badge-dot', 'badge-dot--active');
    } else if (state.view === 'compose') {
      label.textContent = 'BiotechOS · composing';
      dot.className = klass('badge-dot', 'badge-dot--active');
    } else {
      label.textContent = 'BiotechOS Outreach · ready';
      dot.className = klass('badge-dot', 'badge-dot--idle');
    }
  }

  // ── Gmail observer subscription ─────────────────────────────────────────
  let lastThreadId = null;

  GMAIL.subscribe((state) => {
    updateBadge(state);

    try {
      const p = chrome.runtime.sendMessage({
        type:    CFG.MESSAGES.GMAIL_STATE_CHANGED,
        payload: { view: state.view, threadId: state.threadId, url: state.url, subject: state.subject, emailCount: state.openEmails.length }
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* worker sleeping */ }

    if (state.view === 'thread' && state.ready && isAuthenticated()) {
      if (state.threadId !== lastThreadId) {
        lastThreadId = state.threadId;
        setTimeout(() => RP.onThreadOpen(state), 80);
      }
    } else if (state.view !== 'thread') {
      if (lastThreadId !== null) {
        lastThreadId = null;
        RP.onThreadClose();
        purgeInjected(document);
      }
    }
  });

  // ── Wire reply button → reply panel ─────────────────────────────────────
  RP.setOnGenerate(({ card, btn, from, body, subject }) => {
    REPLY_PANEL.open({ from, body, subject, btn });
  });

  // ── Wire compose button → outreach panel ────────────────────────────────
  COMPOSE.setOnClick(({ dialog, isInlineReply }) => {
    OUTREACH_PANEL.open(dialog, authState, GMAIL.getState(), isInlineReply);
  });

  // ── Message listener ────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return false;

    if (msg.type === CFG.MESSAGES.PING) {
      const s = GMAIL.getState();
      sendResponse({ ok: true, ts: Date.now(), state: { view: s.view, threadId: s.threadId, subject: s.subject, emailCount: s.openEmails.length, ready: s.ready }, auth: authState });
      return false;
    }

    if (msg.type === CFG.MESSAGES.AUTH_CHANGED) {
      const wasAuthed = isAuthenticated();
      authState = msg.payload || null;
      updateBadge(GMAIL.getState());

      if (wasAuthed && !isAuthenticated()) {
        RP.onThreadClose();
        purgeInjected(document);
      }
      if (!wasAuthed && isAuthenticated()) {
        const s = GMAIL.getState();
        if (s.view === 'thread' && s.ready) {
          lastThreadId = s.threadId;
          setTimeout(() => RP.onThreadOpen(s), 80);
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
            RP.onThreadOpen(s);
          }
        }
      }).catch(() => {});
    }
  } catch { /* worker asleep */ }

  GMAIL._start();
  COMPOSE.start();
})(typeof self !== 'undefined' ? self : globalThis);
