// Watches for Gmail compose windows and injects the "Create outreach email" button
// into the compose toolbar next to the Send button.

(function initComposeDetector(root) {
  const CFG = root.BIOTECHOS_CONFIG;
  const { el, klass } = root.BIOTECHOS_DOM;
  const P = CFG.CSS_PREFIX;

  let onClickCallback = null;

  // Broad send-button selector — Gmail uses various tooltip/aria-label forms
  const SEND_SEL = '[data-tooltip="Send"], [data-tooltip^="Send"], [aria-label="Send"], [aria-label^="Send "]';

  function injectIntoCompose(container, source) {
    if (container.querySelector(`[data-${P}mark="compose-btn"]`)) return; // already injected

    const tryInject = () => {
      const sendBtn = container.querySelector(SEND_SEL);
      if (!sendBtn) return false;

      console.log(`[biotechos] compose-detector: injecting button (source=${source})`, container);

      const btn = el('button', {
        cls:   klass('compose-btn'),
        attrs: {
          type:             'button',
          title:            'Create IP-safe CRO outreach email via BiotechOS',
          [`data-${P}mark`]: 'compose-btn'
        }
      });
      const label = isInlineReply ? 'Create follow-up email' : 'Create outreach email';
      btn.innerHTML = `<span class="${P}compose-btn-icon">✦</span><span>${label}</span>`;
      // Use both mousedown (capture phase) + click — Gmail's inline reply toolbar
      // has a transparent overlay that swallows click events before they reach children.
      let fired = false;
      const fire = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (fired) return; fired = true;
        console.log('[biotechos] compose-btn fired, isInlineReply=', isInlineReply);
        if (onClickCallback) onClickCallback({ dialog: container, isInlineReply });
        setTimeout(() => { fired = false; }, 300);
      };
      btn.addEventListener('mousedown', fire, true);   // capture phase, beats Gmail
      btn.addEventListener('click',     fire, true);

      const sendParent = sendBtn.closest('.wG, .aDh, [class*="send"]') || sendBtn.parentElement;
      sendParent.insertBefore(btn, sendParent.firstChild);
      return true;
    };
    const isInlineReply = source === 'inline-reply' || source === 'inline-mutation' || source === 'inline-scan';

    if (!tryInject()) {
      let attempts = 0;
      const interval = setInterval(() => {
        if (tryInject() || ++attempts > 15) {
          if (attempts > 15) console.log('[biotechos] compose-detector: gave up injecting, no send btn found in', container);
          clearInterval(interval);
        }
      }, 200);
    }
  }

  // Walk up from a Send button to find the smallest element that also contains a body editor.
  function findInlineContainer(sendBtn) {
    let node = sendBtn.parentElement;
    for (let i = 0; i < 15; i++) {
      if (!node || node === document.body) break;
      if (node.querySelector('[role="textbox"], .Am.Al.editable, .Am.Al')) return node;
      node = node.parentElement;
    }
    return null;
  }

  // Scan the whole document for inline reply forms not already injected.
  // Called on mutations AND as a periodic fallback.
  function scanForInlineForms() {
    const allSendBtns = document.querySelectorAll(SEND_SEL);
    for (const btn of allSendBtns) {
      if (btn.closest('[role="dialog"]')) continue; // handled by dialog path
      if (btn.closest(`[data-${P}mark="compose-btn"]`)) continue;
      const container = findInlineContainer(btn);
      if (!container) {
        console.log('[biotechos] compose-detector: found Send btn without identifiable container', btn);
        continue;
      }
      if (!container.querySelector(`[data-${P}mark="compose-btn"]`)) {
        console.log('[biotechos] compose-detector: inline reply form detected via scan', container.tagName, container.className?.slice?.(0, 60));
        injectIntoCompose(container, 'inline-scan');
      }
    }
  }

  // Watch for compose dialogs AND inline reply forms appearing in the DOM
  const mo = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;

        // ── Full compose dialogs (role="dialog") — skip our own panels ──────
        const dialogs = [];
        if (node.matches('[role="dialog"]') && !node.hasAttribute(`data-${P}mark`)) dialogs.push(node);
        node.querySelectorAll(`[role="dialog"]:not([data-${P}mark])`).forEach(d => dialogs.push(d));
        for (const d of dialogs) {
          console.log('[biotechos] compose-detector: dialog added', d.className?.slice?.(0, 60));
          setTimeout(() => injectIntoCompose(d, 'dialog'), 150);
        }

        // ── Inline reply/forward forms ────────────────────────────────────
        if (!node.closest('[role="dialog"]')) {
          const sendBtns = node.matches(SEND_SEL) ? [node] : [...node.querySelectorAll(SEND_SEL)];
          for (const btn of sendBtns) {
            if (btn.closest('[role="dialog"]')) continue;
            const container = findInlineContainer(btn);
            console.log('[biotechos] compose-detector: inline Send btn found via mutation, container=', container?.tagName, container?.className?.slice?.(0, 60));
            if (container) setTimeout(() => injectIntoCompose(container, 'inline-reply'), 200);
          }
        }
      }
    }
  });

  // Periodic scan catches cases where Gmail renders compose forms without a clean
  // addedNode event (e.g. re-using a cached DOM element).
  let scanCount = 0;
  function startPeriodicScan() {
    scanCount = 0;
    const id = setInterval(() => {
      scanForInlineForms();
      if (++scanCount > 20) clearInterval(id); // scan for 10 s after start
    }, 500);
  }

  function start() {
    mo.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('[role="dialog"]').forEach(d => injectIntoCompose(d, 'init-dialog'));
    scanForInlineForms(); // catch anything already open
    startPeriodicScan();
    // Re-scan whenever URL changes (thread navigation)
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        startPeriodicScan();
      }
    }, 800);
  }

  root.BIOTECHOS_COMPOSE = {
    setOnClick(cb) { onClickCallback = cb; },
    start
  };
})(typeof self !== 'undefined' ? self : globalThis);
