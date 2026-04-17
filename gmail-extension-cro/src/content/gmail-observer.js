// Gmail SPA observer — tells the rest of the extension "where we are" in Gmail.
//
// Gmail is a single-page app that never reloads. Every click on an email updates
// the URL hash and swaps DOM nodes. We need three things:
//   1. A reliable notion of "what view is on screen" (list, thread, compose).
//   2. The active thread id when the user opens an email.
//   3. An event when either of those changes, debounced so we don't re-render
//      on every tiny mutation.
//
// We expose a simple API via `window.BIOTECHOS_GMAIL`:
//   subscribe(cb) -> unsubscribe
//   getState() -> { view, threadId, url, subject, openEmails: [...] }

(function initGmailObserver(root) {
  const CFG = root.BIOTECHOS_CONFIG;
  const { debounce } = root.BIOTECHOS_DOM;

  // ── View classification ────────────────────────────────────────────────────
  // Gmail hash layout for a logged-in user:
  //   #inbox                      -> list view
  //   #inbox/<threadId>           -> thread open
  //   #search/foo                 -> search list
  //   #search/foo/<threadId>      -> thread open from search
  //   #label/Bucket/<threadId>    -> thread open from a label
  //
  // Thread IDs come in two formats:
  //   Old (hex):       187af23bd4c12345  (16 hex chars)
  //   New (base64url): FMfcgzQZTCqHTknGwDLBBxZmhHtnCJLB  (20+ mixed-case alphanum)
  // The old regex only matched hex — modern Gmail accounts fail it entirely.
  const THREAD_ID_RE = /\/([a-zA-Z0-9_-]{16,})(?:$|\?)/;

  function classifyHash(hash) {
    const h = hash || location.hash || '';
    if (!h || h === '#') return { view: 'list', threadId: null };

    // Compose-only view: #inbox?compose=new or similar.
    if (/[?&]compose=/.test(h)) return { view: 'compose', threadId: null };

    const m = h.match(THREAD_ID_RE);
    if (m) return { view: 'thread', threadId: m[1] };

    return { view: 'list', threadId: null };
  }

  // DOM-based fallback: if the URL doesn't match any thread pattern but Gmail
  // has clearly rendered a thread (subject heading + email cards present), treat
  // it as a thread view. This handles Gmail URL formats we haven't seen yet.
  function domConfirmsThread() {
    const hasSubject = !!document.querySelector('h2.hP, [role="main"] h2');
    const hasCards   = document.querySelectorAll('.gs').length > 0;
    return hasSubject && hasCards;
  }

  // ── DOM probes ─────────────────────────────────────────────────────────────
  // These selectors are deliberately conservative. Gmail ships small tweaks
  // constantly, so we cast a wide net and verify content looks email-ish
  // before trusting it.

  // An open thread's subject lives in the thread header.
  function readOpenSubject() {
    const nodes = document.querySelectorAll('h2.hP, [role="main"] h2');
    for (const n of nodes) {
      const text = (n.textContent || '').trim();
      if (text && text.length < 300) return text;
    }
    return null;
  }

  // Each individual email card inside a conversation.
  // `.gs` is the long-standing container for an expanded message.
  function readOpenEmails() {
    const cards = Array.from(document.querySelectorAll('.gs'));
    if (cards.length === 0) return [];
    return cards.map((card, i) => {
      const fromNode = card.querySelector('.gD, span.go');
      const bodyNode = card.querySelector('.a3s, .ii.gt, .a3s.aiL');
      return {
        index: i,
        cardEl: card,
        from: fromNode ? (fromNode.getAttribute('email') || fromNode.textContent || '').trim() : null,
        // We expose only the text preview here — full HTML stays in the DOM.
        preview: bodyNode ? (bodyNode.textContent || '').trim().slice(0, 400) : ''
      };
    });
  }

  // Check Gmail is actually mounted. Gmail boots the chat-only iframe first;
  // on those URLs nothing email-related will ever appear.
  function gmailReady() {
    return !!document.querySelector('[role="main"], #\\:2, .nH');
  }

  // ── State + subscribers ────────────────────────────────────────────────────
  let state = {
    view: 'list',
    threadId: null,
    url: location.href,
    subject: null,
    openEmails: [],
    ready: false
  };

  const listeners = new Set();
  function emit() {
    for (const cb of listeners) {
      try { cb(state); } catch (err) { console.warn('[biotechos] listener error', err); }
    }
  }

  function recompute(reason) {
    let classified = classifyHash(location.hash);
    // DOM fallback: if the URL pattern didn't identify a thread but the page
    // clearly shows one (subject + email cards), promote to thread view.
    if (classified.view !== 'thread' && domConfirmsThread()) {
      classified = { view: 'thread', threadId: classified.threadId };
    }
    const openEmails = classified.view === 'thread' ? readOpenEmails() : [];
    const subject = classified.view === 'thread' ? readOpenSubject() : null;

    const next = {
      view: classified.view,
      threadId: classified.threadId,
      url: location.href,
      subject,
      openEmails,
      ready: gmailReady()
    };

    const changed =
      next.view !== state.view ||
      next.threadId !== state.threadId ||
      next.subject !== state.subject ||
      next.openEmails.length !== state.openEmails.length ||
      next.ready !== state.ready;

    state = next;
    if (changed) {
      if (reason) state._reason = reason;
      emit();
    }
  }

  const recomputeDebounced = debounce(() => recompute('mutation'), 120);

  // ── Wire up listeners ──────────────────────────────────────────────────────
  function start() {
    // Hash changes are the primary signal.
    window.addEventListener('hashchange', () => recompute('hashchange'));
    window.addEventListener('popstate', () => recompute('popstate'));

    // Belt and braces: Gmail occasionally swaps the main panel without a
    // hashchange (e.g. mark-as-read, expanding an inline message). Watch
    // mutations on the main mounted region and debounce hard.
    const mo = new MutationObserver(recomputeDebounced);
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Safety-net poll — cheap (string compare + a single querySelector), but
    // catches the rare case where Gmail mutates in a detached tree.
    setInterval(() => {
      if (location.href !== state.url) recompute('poll-url');
    }, CFG.SPA_POLL_MS);

    // First pass once Gmail finishes booting.
    if (gmailReady()) {
      recompute('init');
    } else {
      const bootCheck = setInterval(() => {
        if (gmailReady()) {
          clearInterval(bootCheck);
          recompute('boot');
        }
      }, 250);
    }
  }

  root.BIOTECHOS_GMAIL = {
    subscribe(cb) {
      listeners.add(cb);
      // Fire immediately with current state so subscribers don't race the boot.
      try { cb(state); } catch (err) { console.warn('[biotechos] listener error', err); }
      return () => listeners.delete(cb);
    },
    getState() { return state; },
    _start: start
  };
})(typeof self !== 'undefined' ? self : globalThis);
