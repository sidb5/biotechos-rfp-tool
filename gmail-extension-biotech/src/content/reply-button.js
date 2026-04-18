// Injects "Generate reply" button into email thread cards when viewing a CRO reply.
// Pattern mirrors the CRO extension's quote-button.js.

(function initReplyButton(root) {
  const CFG = root.BIOTECHOS_CONFIG;
  const { el, klass } = root.BIOTECHOS_DOM;
  const P = CFG.CSS_PREFIX;

  let onGenerateCallback = null;
  let scanInterval       = null;

  // ── Card scanner ─────────────────────────────────────────────────────────
  // Scans the current thread for email cards and injects the button on each
  // inbound (non-self) card that doesn't already have one.
  function scanCards(gmailState) {
    const cards = gmailState?.openEmails || [];
    for (const { cardEl, from } of cards) {
      if (!cardEl || !from) continue;
      if (cardEl.querySelector(`[data-${P}mark="reply-btn"]`)) continue;

      // Find the action bar (.ade) — where Reply/Forward live
      const actionBar = cardEl.querySelector('.ade, [data-tooltip*="Reply"], [data-tooltip*="More"]');
      if (!actionBar) continue;
      const toolbar = actionBar.closest('.ade') || actionBar.parentElement;
      if (!toolbar) continue;

      injectButton(toolbar, cardEl, from);
    }
  }

  function injectButton(toolbar, card, from) {
    const btn = el('button', {
      cls:   klass('reply-btn'),
      attrs: {
        type:             'button',
        title:            'Analyse this CRO reply and generate a follow-up via BiotechOS',
        [`data-${P}mark`]: 'reply-btn'
      }
    });
    btn.innerHTML = `<span class="${P}reply-btn-icon">✦</span><span>Generate reply</span>`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!onGenerateCallback) return;

      // Read the full email body text from the card
      const bodyNode = card.querySelector('.a3s.aiL, .a3s, .ii.gt');
      const body     = bodyNode ? (bodyNode.innerText || bodyNode.textContent || '').trim() : '';
      const subject  = document.querySelector('h2.hP')?.textContent?.trim() || '';

      onGenerateCallback({ card, btn, from, body, subject });
    });

    toolbar.insertBefore(btn, toolbar.firstChild);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function onThreadOpen(gmailState) {
    // Immediate scan
    scanCards(gmailState);
    // Keep scanning — Gmail lazy-loads email bodies
    if (scanInterval) clearInterval(scanInterval);
    let ticks = 0;
    scanInterval = setInterval(() => {
      scanCards(gmailState);
      if (++ticks > 20) clearInterval(scanInterval);
    }, 400);
  }

  function onThreadClose() {
    if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  }

  function setOnGenerate(cb) { onGenerateCallback = cb; }

  root.BIOTECHOS_REPLY_BUTTON = { onThreadOpen, onThreadClose, setOnGenerate };
})(typeof self !== 'undefined' ? self : globalThis);
