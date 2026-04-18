// Gmail SPA observer — identical to CRO extension, namespace-agnostic.
// Tells the rest of the extension what view is on screen and what thread is open.

(function initGmailObserver(root) {
  const CFG = root.BIOTECHOS_CONFIG;
  const { debounce } = root.BIOTECHOS_DOM;

  const THREAD_ID_RE = /\/([a-zA-Z0-9_-]{16,})(?:$|\?)/;

  function classifyHash(hash) {
    const h = hash || location.hash || '';
    if (!h || h === '#') return { view: 'list', threadId: null };
    if (/[?&]compose=/.test(h)) return { view: 'compose', threadId: null };
    const m = h.match(THREAD_ID_RE);
    if (m) return { view: 'thread', threadId: m[1] };
    return { view: 'list', threadId: null };
  }

  function domConfirmsThread() {
    const hasSubject = !!document.querySelector('h2.hP, [role="main"] h2');
    const hasCards   = document.querySelectorAll('.gs').length > 0;
    return hasSubject && hasCards;
  }

  function readOpenSubject() {
    const nodes = document.querySelectorAll('h2.hP, [role="main"] h2');
    for (const n of nodes) {
      const text = (n.textContent || '').trim();
      if (text && text.length < 300) return text;
    }
    return null;
  }

  function readOpenEmails() {
    return Array.from(document.querySelectorAll('.gs')).map((card, i) => {
      const fromNode = card.querySelector('.gD, span.go');
      const bodyNode = card.querySelector('.a3s, .ii.gt, .a3s.aiL');
      return {
        index:   i,
        cardEl:  card,
        from:    fromNode ? (fromNode.getAttribute('email') || fromNode.textContent || '').trim() : null,
        preview: bodyNode ? (bodyNode.textContent || '').trim().slice(0, 400) : ''
      };
    });
  }

  function gmailReady() {
    return !!document.querySelector('[role="main"], #\\:2, .nH');
  }

  let state = { view: 'list', threadId: null, url: location.href, subject: null, openEmails: [], ready: false };
  const listeners = new Set();

  function emit() {
    for (const cb of listeners) {
      try { cb(state); } catch (err) { console.warn('[biotechos] listener error', err); }
    }
  }

  function recompute(reason) {
    let classified = classifyHash(location.hash);
    if (classified.view !== 'thread' && domConfirmsThread()) {
      classified = { view: 'thread', threadId: classified.threadId };
    }
    const openEmails = classified.view === 'thread' ? readOpenEmails() : [];
    const subject    = classified.view === 'thread' ? readOpenSubject() : null;
    const next = { view: classified.view, threadId: classified.threadId, url: location.href, subject, openEmails, ready: gmailReady() };
    const changed = next.view !== state.view || next.threadId !== state.threadId ||
      next.subject !== state.subject || next.openEmails.length !== state.openEmails.length || next.ready !== state.ready;
    state = next;
    if (changed) { if (reason) state._reason = reason; emit(); }
  }

  const recomputeDebounced = debounce(() => recompute('mutation'), 120);

  function start() {
    window.addEventListener('hashchange', () => recompute('hashchange'));
    window.addEventListener('popstate',   () => recompute('popstate'));
    const mo = new MutationObserver(recomputeDebounced);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(() => { if (location.href !== state.url) recompute('poll-url'); }, CFG.SPA_POLL_MS);
    if (gmailReady()) { recompute('init'); }
    else {
      const bootCheck = setInterval(() => {
        if (gmailReady()) { clearInterval(bootCheck); recompute('boot'); }
      }, 250);
    }
  }

  root.BIOTECHOS_GMAIL = {
    subscribe(cb) {
      listeners.add(cb);
      try { cb(state); } catch (err) { console.warn('[biotechos] listener error', err); }
      return () => listeners.delete(cb);
    },
    getState() { return state; },
    _start: start
  };
})(typeof self !== 'undefined' ? self : globalThis);
