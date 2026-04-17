// Gmail Compose Population (Task 5)
//
// Listens for the `cro-qg-reply-with-quote` event dispatched by the sidebar
// after the user clicks "Reply with Quote →". From there it:
//
//   1. Calls shareQuote (enable) via the service worker to get the share_token.
//   2. Clicks the Reply button on the triggering email card so Gmail opens its
//      compose overlay naturally — no fake DOM creation, no iframe surgery.
//   3. Waits for the compose body to appear, then injects professional email
//      HTML using document.execCommand('insertHTML'), which is the only method
//      that triggers Gmail's internal mutation observers reliably.
//   4. Updates the subject line to "Quote – <original subject>".
//   5. Shows a branded toast confirming success.
//
// Fallback: if the compose window can't be found within the timeout, the full
// HTML is copied to the clipboard and a toast guides the user to paste it
// manually.

(function initCompose(root) {
  const CFG = root.BIOTECHOS_CONFIG;
  const { el, klass, waitFor } = root.BIOTECHOS_DOM;
  const MSG = CFG.MESSAGES;

  if (!CFG || !root.BIOTECHOS_DOM) {
    console.warn('[biotechos] compose.js: missing dependencies');
    return;
  }

  // ── API proxy (same pattern as sidebar.js) ───────────────────────────────
  function apiCall(method, args) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: MSG.API_CALL, payload: { method, args } },
        (res) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!res || !res.ok) {
            const err = new Error(res?.error || 'API call failed');
            err.authError = !!res?.authError;
            return reject(err);
          }
          resolve(res.data);
        }
      );
    });
  }

  // ── Gmail compose selectors ───────────────────────────────────────────────
  // Gmail changes class names frequently; we try several and take the first
  // that exists. `waitFor` already handles the MutationObserver retry loop.
  const REPLY_BTN_SEL   = [
    '[data-tooltip="Reply"]',
    '[aria-label="Reply"]',
    'button.aB.gA',
    '.ade button:first-child'
  ].join(', ');

  const COMPOSE_BODY_SEL = [
    'div[aria-label="Message Body"][contenteditable="true"]',
    'div.Am.Al.editable[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]'
  ].join(', ');

  const SUBJECT_INPUT_SEL = [
    'input[name="subjectbox"]',
    'input[aria-label="Subject"]',
    'input[placeholder="Subject"]'
  ].join(', ');

  // ── Toast notifications ───────────────────────────────────────────────────
  function showToast(message, type = 'success') {
    // Remove any existing toast first.
    document.querySelectorAll(`[data-${CFG.CSS_PREFIX}mark="toast"]`).forEach(t => t.remove());

    const toast = el('div', {
      cls: klass('toast', `toast--${type}`),
      attrs: {
        [`data-${CFG.CSS_PREFIX}mark`]: 'toast',
        role: 'status',
        'aria-live': 'polite'
      }
    }, [
      el('span', { cls: klass('toast-icon'), text: type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ' }),
      el('span', { cls: klass('toast-msg'),  text: message })
    ]);

    document.body.appendChild(toast);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => toast.classList.add(klass('toast--visible')))
    );
    setTimeout(() => {
      toast.classList.remove(klass('toast--visible'));
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // ── Email HTML builder ────────────────────────────────────────────────────
  // Produces email-client-safe HTML: inline styles, table-based layout, no
  // external resources, no CSS classes. Tested to render well in Gmail,
  // Outlook, and Apple Mail (the three clients most biotech recipients use).
  function buildEmailHtml({ quoteData, parsedSummary, from, subject, shareUrl, shareToken, authProfile }) {
    const scope     = quoteData.scope || '';
    const timeline  = Array.isArray(quoteData.timeline) ? quoteData.timeline : [];
    const investment = Array.isArray(quoteData.investment) ? quoteData.investment.filter(r => r.item) : [];
    const croName   = authProfile?.companyName || 'Our team';
    const accessCode = shareToken ? shareToken.slice(-6) : '';

    const studyType = parsedSummary?.study_type || 'preclinical study';

    // Greeting: extract first name from sender email if possible.
    const senderName = (() => {
      const name = (from || '').split('<')[0].trim().split(' ')[0];
      return name && name.length > 1 && name.length < 20 ? name : 'Team';
    })();

    // ── Investment table rows ──────────────────────────────────────────────
    const investmentRows = investment.length
      ? investment.map(r => `
        <tr>
          <td style="padding:7px 10px;border:1px solid #e0e0e0;">${esc(r.item)}</td>
          <td style="padding:7px 10px;border:1px solid #e0e0e0;text-align:right;">${esc(r.qty)}</td>
          <td style="padding:7px 10px;border:1px solid #e0e0e0;text-align:right;">${esc(r.unit_price)}</td>
          <td style="padding:7px 10px;border:1px solid #e0e0e0;text-align:right;font-weight:600;">${esc(r.total)}</td>
        </tr>`).join('')
      : `<tr><td colspan="4" style="padding:7px 10px;border:1px solid #e0e0e0;color:#888;font-style:italic;">Pricing to be confirmed</td></tr>`;

    // ── Timeline rows ──────────────────────────────────────────────────────
    const timelineRows = timeline.filter(r => r.description || r.date).map(r => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #e0e0e0;font-weight:600;white-space:nowrap;">${esc(r.label)}</td>
        <td style="padding:6px 10px;border:1px solid #e0e0e0;">${esc(r.description)}</td>
        <td style="padding:6px 10px;border:1px solid #e0e0e0;white-space:nowrap;">${esc(r.date)}</td>
      </tr>`).join('');

    // ── CTA block ──────────────────────────────────────────────────────────
    const ctaBlock = shareUrl ? `
      <div style="margin:24px 0;padding:16px;background:#f0f4fe;border-radius:8px;border-left:3px solid #1a73e8;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#202124;">View your quote online</p>
        <p style="margin:0 0 12px;font-size:13px;color:#5f6368;">
          The complete quote is available online and includes all details, our team qualifications, and facility information.
        </p>
        <a href="${shareUrl}" style="display:inline-block;background:#1a73e8;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:13px;font-weight:600;">View Complete Quote</a>
        ${accessCode ? `<span style="margin-left:12px;font-size:12px;color:#7a4f00;background:#fff8e1;border:1px solid #f9ab00;border-radius:4px;padding:4px 8px;white-space:nowrap;">Access code: <strong style="font-family:monospace;">${esc(accessCode)}</strong></span>` : ''}
      </div>` : '';

    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#202124;max-width:620px;">

<p style="margin:0 0 16px;">Dear ${esc(senderName)},</p>

<p style="margin:0 0 16px;">Thank you for your enquiry. Please find our preliminary quote for the ${esc(studyType)} study below. We would be happy to discuss any aspect of this in more detail.</p>

<h3 style="font-size:14px;font-weight:600;color:#1a73e8;border-bottom:2px solid #e8eaed;padding-bottom:6px;margin:20px 0 10px;">Scope of Work</h3>
<p style="margin:0 0 20px;">${esc(scope).replace(/\n/g, '<br>')}</p>

${investment.length ? `
<h3 style="font-size:14px;font-weight:600;color:#1a73e8;border-bottom:2px solid #e8eaed;padding-bottom:6px;margin:20px 0 10px;">Investment</h3>
<table style="border-collapse:collapse;width:100%;margin-bottom:20px;font-size:13px;">
  <thead>
    <tr style="background:#f8f9fa;">
      <th style="padding:8px 10px;border:1px solid #e0e0e0;text-align:left;">Item / Assay</th>
      <th style="padding:8px 10px;border:1px solid #e0e0e0;text-align:right;">Qty</th>
      <th style="padding:8px 10px;border:1px solid #e0e0e0;text-align:right;">Unit Price</th>
      <th style="padding:8px 10px;border:1px solid #e0e0e0;text-align:right;">Total</th>
    </tr>
  </thead>
  <tbody>${investmentRows}</tbody>
</table>` : ''}

${timelineRows ? `
<h3 style="font-size:14px;font-weight:600;color:#1a73e8;border-bottom:2px solid #e8eaed;padding-bottom:6px;margin:20px 0 10px;">Proposed Timeline</h3>
<table style="border-collapse:collapse;width:100%;margin-bottom:20px;font-size:13px;">
  <tbody>${timelineRows}</tbody>
</table>` : ''}

${ctaBlock}

<p style="margin:20px 0 8px;">Please don't hesitate to reach out if you have any questions or would like to discuss the study design in more detail.</p>

<p style="margin:0;">Best regards,<br><strong>${esc(croName)}</strong></p>

<hr style="border:none;border-top:1px solid #e8eaed;margin:24px 0 16px;">
<p style="font-size:11px;color:#9aa0a6;margin:0;">This quote was generated with <a href="https://biotechos.com" style="color:#9aa0a6;">BiotechOS</a> · Quote valid for 30 days</p>
</div>`;
  }

  // HTML-escape helper — prevents injection if any email field contained special chars.
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Compose injection ─────────────────────────────────────────────────────
  async function injectIntoCompose(html, newSubject) {
    // Gmail's compose body — check for both reply and new-compose selectors.
    const body = await waitFor(COMPOSE_BODY_SEL, { timeoutMs: 5000 });
    if (!body) return false;

    // Give Gmail one extra frame to finish setting up event handlers.
    await new Promise(r => setTimeout(r, 100));

    // Select all existing content in the compose area (quoted text, signature,
    // placeholder text) so our insertHTML replaces it cleanly.
    body.focus();
    document.execCommand('selectAll', false, null);
    // insertHTML is the only method that correctly triggers Gmail's internal
    // undo stack and mutation observers. Setting innerHTML directly causes
    // the compose to lose track of its state on submit.
    document.execCommand('insertHTML', false, html);

    // Subject — try to update it. In reply mode Gmail may ignore this or
    // prompt the user; we attempt it and swallow any errors.
    if (newSubject) {
      const subjectInput = document.querySelector(SUBJECT_INPUT_SEL);
      if (subjectInput) {
        subjectInput.focus();
        // Select all and replace so Gmail's change handlers fire correctly.
        subjectInput.select();
        document.execCommand('insertText', false, newSubject);
        subjectInput.blur();
      }
    }

    return true;
  }

  // ── Clipboard fallback ────────────────────────────────────────────────────
  async function copyToClipboard(html) {
    try {
      // Modern clipboard API — works in extension contexts with user gesture.
      const blob = new Blob([html], { type: 'text/html' });
      const item = new ClipboardItem({ 'text/html': blob });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      // Legacy fallback via a hidden textarea (plain text only).
      try {
        const el = document.createElement('textarea');
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        el.value = html.replace(/<[^>]+>/g, ''); // strip tags for plain text
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        el.remove();
        return true;
      } catch {
        return false;
      }
    }
  }

  // ── Main entry point ──────────────────────────────────────────────────────
  // Called from content.js when it receives the `cro-qg-reply-with-quote` event.
  async function handleReplyWithQuote(detail) {
    const { proposalId, quoteData, parsedSummary, from, subject } = detail;

    // Step 1: enable share link and get the token.
    let shareToken = null;
    let shareUrl   = null;
    try {
      const shareResult = await apiCall('shareQuote', { proposal_id: proposalId, action: 'enable' });
      if (shareResult?.share_token) {
        shareToken = shareResult.share_token;
        // Build the public URL. The API base matches the app origin where /q/[token] lives.
        const apiBase = await new Promise(res =>
          chrome.storage.sync.get('biotechos.apiBase', v =>
            res(v['biotechos.apiBase'] || 'http://localhost:3000')
          )
        );
        shareUrl = `${apiBase.replace(/\/$/, '')}/q/${shareToken}`;
      }
    } catch (err) {
      console.warn('[biotechos] could not enable share link:', err.message);
      // Non-fatal — email goes out without the online-view link.
    }

    // Step 2: get the auth profile for the CRO name in the email signature.
    const authProfile = await new Promise(res =>
      chrome.storage.sync.get('biotechos.user', v => res(v['biotechos.user'] || null))
    );

    // Step 3: build email HTML.
    const html = buildEmailHtml({ quoteData, parsedSummary, from, subject, shareUrl, shareToken, authProfile });
    const newSubject = `Quote – ${parsedSummary?.study_type || subject || 'Preclinical Study'}`;

    // Step 4: find and click the Reply button on the triggering card.
    // The card may have been scrolled out of view; bring it into view first.
    const threadMain = document.querySelector('[role="main"]');
    const cards = threadMain ? threadMain.querySelectorAll('.gs') : [];
    let replyBtn = null;

    // Prefer the LAST expanded card (most recent email in the thread — the one
    // most likely to be the inbound request we're quoting).
    for (let i = cards.length - 1; i >= 0; i--) {
      replyBtn = cards[i].querySelector(REPLY_BTN_SEL);
      if (replyBtn) break;
    }

    if (replyBtn) {
      replyBtn.scrollIntoView({ block: 'nearest' });
      replyBtn.click();

      const injected = await injectIntoCompose(html, newSubject);
      if (injected) {
        showToast('Quote added to reply — review and send when ready.');
        return;
      }
    }

    // Step 5: fallback — copy HTML to clipboard and tell the user.
    const copied = await copyToClipboard(html);
    if (copied) {
      showToast(
        'Could not find the compose window. Quote HTML copied — paste it into Gmail.',
        'info'
      );
    } else {
      showToast('Could not open Gmail compose. Try clicking Reply manually first.', 'error');
    }
  }

  // ── Register the event listener ───────────────────────────────────────────
  // The sidebar dispatches this on document after saving the quote.
  document.addEventListener(`${CFG.CSS_PREFIX}reply-with-quote`, (e) => {
    handleReplyWithQuote(e.detail).catch(err => {
      console.error('[biotechos] compose population failed:', err);
      showToast(err?.message || 'Something went wrong composing the email.', 'error');
    });
  });

  root.BIOTECHOS_COMPOSE = { handleReplyWithQuote, showToast };
})(typeof self !== 'undefined' ? self : globalThis);
