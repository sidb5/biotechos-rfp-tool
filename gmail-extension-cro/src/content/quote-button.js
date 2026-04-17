// Quote button injector.
// Scans expanded email cards in an open Gmail thread, scores them via the
// detector, and injects a "Generate Quote" button into Gmail's action bar
// for any email that looks like a biotech study request.
//
// Gmail loads email bodies lazily — a card's action bar and body may not
// exist in the DOM when the thread first renders. We use a MutationObserver
// on the thread container to retry pending cards as they hydrate.
//
// Dependency load order (enforced by manifest.json):
//   config.js → dom-utils.js → email-detector.js → quote-button.js

(function initQuoteButton(root) {
  const CFG   = root.BIOTECHOS_CONFIG;
  const DOM   = root.BIOTECHOS_DOM;
  const DET   = root.BIOTECHOS_DETECTOR;
  const { el, klass, debounce } = DOM;

  if (!CFG || !DOM || !DET) {
    console.warn('[biotechos] quote-button.js: missing dependency');
    return;
  }

  // ── Gmail DOM selectors ─────────────────────────────────────────────────
  // These target the most stable Gmail landmarks. Multiple fallbacks keep us
  // working across Gmail's "default", "compact", and "comfortable" densities.
  const SEL = {
    emailCard:   '.gs, .adn',                  // expanded message container
    actionBar:   '.ade, .bBb, .adf.T-I-J3, .btC, .aaq, [role="toolbar"]',
    emailBody:   '.a3s, .ii.gt, .a3s.aiL, .a3s.aXjCH, [data-message-id] .a3s',
    emailFrom:   '.gD, span[email]',           // <span email="…"> sender node
    threadMain:  '[role="main"]'               // thread scroll container
  };

  // Selector strings for the Reply button — used as action bar fallback.
  const REPLY_BTN_SEL = [
    '[data-tooltip="Reply"]',
    '[aria-label="Reply"]',
    'button[title="Reply"]',
    'button[title*="Reply" i]',
    '.aB.gA[aria-label*="Reply" i]'
  ].join(', ');

  // Robustly locate the action bar within a card.
  // Tries known class selectors first, then falls back to finding whichever
  // element contains the Reply button — the most stable landmark in Gmail.
  function findActionBar(card) {
    const byClass = card.querySelector(SEL.actionBar);
    if (byClass) return byClass;

    // Fallback: find the Reply button and use its direct parent as the container.
    const replyBtn = card.querySelector(REPLY_BTN_SEL);
    if (replyBtn && replyBtn.parentElement) {
      console.info('[biotechos] action bar fallback: using Reply button parent', replyBtn.parentElement);
      return replyBtn.parentElement;
    }

    return null;
  }

  // WeakMap: emailCardElement → 'pending' | 'scanning' | 'injected' | 'skipped'
  // WeakMap entries are GC-d automatically when Gmail removes card elements on
  // SPA navigation — no manual cleanup needed.
  const cardState = new WeakMap();

  // Callback registered by content.js for when the user clicks Generate Quote.
  let onGenerateCallback = null;

  // Subject from the current thread — read once per thread open, passed into
  // every card scan to boost keyword signal without re-querying the DOM.
  let currentSubject = '';

  // Active MutationObserver watching for lazily-hydrated cards.
  let lazyObserver = null;

  // ── Button construction ─────────────────────────────────────────────────
  function buildButton(card) {
    const btn = el('button', {
      cls: klass('quote-btn'),
      attrs: {
        type: 'button',
        title: 'Generate quote with BiotechOS',
        [`data-${CFG.CSS_PREFIX}mark`]: 'quote-btn',
        'aria-label': 'Generate a CRO quote with BiotechOS',
        tabindex: '0'
      }
    }, [
      el('span', { cls: klass('quote-btn-icon'), attrs: { 'aria-hidden': 'true' } }),
      el('span', { cls: klass('quote-btn-label'), text: 'Generate Quote' })
    ]);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      fireGenerate(card, btn);
    });

    // Keyboard: Space already triggers click on <button>, but Gmail intercepts
    // keyboard events aggressively — belt-and-braces.
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        fireGenerate(card, btn);
      }
    });

    return btn;
  }

  function fireGenerate(card, btn) {
    const fromEl  = card.querySelector(SEL.emailFrom);
    const bodyEl  = card.querySelector(SEL.emailBody);

    const from    = fromEl ? (fromEl.getAttribute('email') || fromEl.textContent || '').trim() : '';
    const body    = bodyEl ? (bodyEl.textContent || '').trim() : '';
    const subject = currentSubject;
    const detection = DET.score(subject + ' ' + body);

    // Visual feedback — button enters "loading" state until sidebar takes over.
    btn.classList.add(klass('quote-btn--loading'));
    btn.disabled = true;

    if (typeof onGenerateCallback === 'function') {
      onGenerateCallback({ card, btn, from, body, subject, detection });
    } else {
      // Task 4 not wired yet — reset button after a beat.
      setTimeout(() => {
        btn.classList.remove(klass('quote-btn--loading'));
        btn.disabled = false;
      }, 800);
    }
  }

  // ── Card processing ─────────────────────────────────────────────────────
  function tryInjectCard(card) {
    const state = cardState.get(card);
    if (state === 'injected' || state === 'skipped') return;

    // Body not hydrated yet — leave in pending state; observer will retry.
    const bodyEl = card.querySelector(SEL.emailBody);
    if (!bodyEl) {
      cardState.set(card, 'pending');
      return;
    }

    // Find insertion point: prefer the Reply button's parent (robust across
    // Gmail versions), fall back to any action bar container.
    const replyBtn = card.querySelector(REPLY_BTN_SEL);
    const actionBar = replyBtn ? replyBtn.parentElement : findActionBar(card);

    if (!actionBar) {
      cardState.set(card, 'pending');
      return;
    }

    // Don't double-inject if we already put a button here.
    if (actionBar.querySelector(`[data-${CFG.CSS_PREFIX}mark="quote-btn"]`)) {
      cardState.set(card, 'injected');
      return;
    }

    cardState.set(card, 'scanning');

    const from   = (() => {
      const n = card.querySelector(SEL.emailFrom);
      return n ? (n.getAttribute('email') || n.textContent || '').trim() : '';
    })();
    const body   = (bodyEl.textContent || '').trim();
    const result = DET.score(currentSubject + ' ' + body);

    console.debug('[biotechos] detector result:', { confident: result.confident, score: result.score, matched: result.matched.map(m => m.term) });

    if (!result.confident) {
      cardState.set(card, 'skipped');
      return;
    }

    const btn = buildButton(card);
    // Insert right before Reply so it's the first visible action.
    if (replyBtn) {
      replyBtn.parentElement.insertBefore(btn, replyBtn);
    } else {
      actionBar.insertBefore(btn, actionBar.firstChild);
    }
    cardState.set(card, 'injected');
    console.info('[biotechos] ✦ Generate Quote button injected!', { score: result.score });
  }

  // Scan every expanded card visible in the current thread.
  function scanAllCards() {
    const cards = document.querySelectorAll(SEL.emailCard);
    for (const card of cards) {
      tryInjectCard(card);
    }
  }

  // ── Lazy-loading observer ───────────────────────────────────────────────
  // Gmail expands email bodies asynchronously. We watch the main thread
  // container for DOM additions and retry pending cards on each mutation.
  const debouncedRetry = debounce(() => {
    const cards = document.querySelectorAll(SEL.emailCard);
    let hasPending = false;
    for (const card of cards) {
      const s = cardState.get(card);
      if (s === 'pending' || s === undefined) {
        tryInjectCard(card);
        if (cardState.get(card) === 'pending') hasPending = true;
      }
    }
    // Disconnect once all visible cards are resolved.
    if (!hasPending && lazyObserver) {
      const stillPending = Array.from(document.querySelectorAll(SEL.emailCard))
        .some(c => cardState.get(c) === 'pending' || cardState.get(c) === undefined);
      if (!stillPending) {
        lazyObserver.disconnect();
        lazyObserver = null;
      }
    }
  }, 150);

  function startLazyObserver() {
    if (lazyObserver) lazyObserver.disconnect();

    const anchor = document.querySelector(SEL.threadMain) || document.body;
    lazyObserver = new MutationObserver(debouncedRetry);
    lazyObserver.observe(anchor, { childList: true, subtree: true });
  }

  // ── Public API ──────────────────────────────────────────────────────────
  // Called by content.js whenever the Gmail observer reports a thread change.
  function onThreadOpen(gmailState) {
    currentSubject = gmailState.subject || '';
    const allCards = document.querySelectorAll(SEL.emailCard);
    console.debug('[biotechos] onThreadOpen', { subject: currentSubject, cardCount: allCards.length });

    // Stop watching the previous thread.
    if (lazyObserver) { lazyObserver.disconnect(); lazyObserver = null; }

    // Initial synchronous scan — catches already-expanded cards.
    scanAllCards();

    // Start observer for cards that hydrate after render.
    const hasPending = Array.from(document.querySelectorAll(SEL.emailCard))
      .some(c => cardState.get(c) === 'pending' || cardState.get(c) === undefined);
    if (hasPending) startLazyObserver();
  }

  // Called when user leaves a thread (back to list, different thread, etc.)
  function onThreadClose() {
    currentSubject = '';
    if (lazyObserver) { lazyObserver.disconnect(); lazyObserver = null; }
    // The DOM nodes are removed by Gmail so the WeakMap entries GC cleanly.
  }

  // content.js registers a handler here so Task 4 (sidebar) can be wired in
  // without this file needing to know anything about it.
  function setOnGenerate(cb) {
    onGenerateCallback = typeof cb === 'function' ? cb : null;
  }

  root.BIOTECHOS_QUOTE_BUTTON = { onThreadOpen, onThreadClose, setOnGenerate };
})(typeof self !== 'undefined' ? self : globalThis);
