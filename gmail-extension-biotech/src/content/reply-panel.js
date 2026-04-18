// Reply panel — side panel for the thread reply flow.
// Analyses an incoming CRO email → gap analysis → generates follow-up reply.

(function initReplyPanel(root) {
  const CFG = root.BIOTECHOS_CONFIG;
  const { el, klass, waitFor } = root.BIOTECHOS_DOM;
  const P = CFG.CSS_PREFIX;

  // ── API proxy ──────────────────────────────────────────────────────────────
  function apiCall(method, args) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: CFG.MESSAGES.API_CALL, payload: { method, args } }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res && res.ok) return resolve(res.data);
        reject(new Error(res?.error || 'API call failed'));
      });
    });
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let panelEl    = null;
  let triggerBtn = null;
  let panelTheme = 'light';

  function applyTheme() {
    document.body.setAttribute('data-bio-oe-theme', panelTheme);
    if (!panelEl) return;
    const btn = panelEl.querySelector(`[data-${P}mark="rp-theme-btn"]`);
    if (btn) btn.textContent = panelTheme === 'dark' ? '☀' : '🌙';
  }

  let state = {
    phase:         'loading',  // loading | analysed | generating | generated | done
    engagementId:  null,
    croName:       null,
    subject:       '',
    emailBody:     '',
    senderEmail:   '',
    gapAnalysis:   null,       // { confirmed, unaddressed, concerns, suggested_questions }
    selectedItems: new Set(),  // items user wants in the reply
    replySubject:  '',
    replyBody:     '',
    error:         null,
  };

  function setState(patch) { Object.assign(state, patch); render(); }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    if (!panelEl) return;
    const body = panelEl.querySelector(`.${P}rp-body`);
    if (!body) return;
    body.innerHTML = '';
    if (state.phase === 'loading')    renderLoading(body);
    if (state.phase === 'analysed')   renderAnalysed(body);
    if (state.phase === 'generating') renderGenerating(body);
    if (state.phase === 'generated')  renderGenerated(body);
    if (state.phase === 'done')       renderDone(body);
    if (state.error && state.phase !== 'analysed' && state.phase !== 'generated') {
      body.appendChild(el('p', { cls: klass('rp-error'), text: `⚠ ${state.error}` }));
      if (state.phase === 'loading') {
        const retryBtn = el('button', { cls: klass('rp-btn', 'rp-btn--ghost'), attrs: { type: 'button' }, text: '↺ Retry' });
        retryBtn.addEventListener('click', () => analyse());
        body.appendChild(retryBtn);
      }
    }
  }

  function section(label) {
    const w = el('div', { cls: klass('rp-section') });
    if (label) w.appendChild(el('p', { cls: klass('rp-label'), text: label }));
    return w;
  }

  function renderLoading(container) {
    const wrap = el('div', { cls: klass('rp-loading') });
    wrap.innerHTML = `<div class="${P}rp-spinner"></div><p class="${P}rp-status">Analysing CRO reply…</p>`;
    container.appendChild(wrap);
  }

  function renderAnalysed(container) {
    const ga = state.gapAnalysis || {};

    // Summary
    if (ga.cro_summary) {
      const sumSec = section(null);
      sumSec.appendChild(el('p', { cls: klass('rp-summary'), text: ga.cro_summary }));
      container.appendChild(sumSec);
    }

    // Confirmed
    if (ga.confirmed?.length) {
      const sec = section(`✓ Confirmed (${ga.confirmed.length})`);
      sec.classList.add(klass('rp-section--confirmed'));
      for (const item of ga.confirmed) {
        sec.appendChild(el('p', { cls: klass('rp-item', 'rp-item--confirmed'), text: item }));
      }
      container.appendChild(sec);
    }

    // Needs follow-up
    const followupItems = [...(ga.unaddressed || []), ...(ga.suggested_questions || [])];
    if (followupItems.length) {
      const sec = section(`↻ Needs follow-up (${followupItems.length})`);
      sec.classList.add(klass('rp-section--followup'));
      for (const item of followupItems) {
        const row = el('div', { cls: klass('rp-item-row') });
        const cb  = el('input', { attrs: { type: 'checkbox' } });
        cb.checked = state.selectedItems.has(item);
        cb.addEventListener('change', () => {
          const s = new Set(state.selectedItems);
          cb.checked ? s.add(item) : s.delete(item);
          setState({ selectedItems: s });
        });
        const txt = el('span', { cls: klass('rp-item-text'), text: item });
        row.appendChild(cb); row.appendChild(txt);
        sec.appendChild(row);
      }
      container.appendChild(sec);
    }

    // Concerns
    if (ga.concerns?.length) {
      const sec = section(`⚠ Concerns (${ga.concerns.length})`);
      sec.classList.add(klass('rp-section--concerns'));
      for (const item of ga.concerns) {
        const row = el('div', { cls: klass('rp-item-row') });
        const cb  = el('input', { attrs: { type: 'checkbox' } });
        cb.checked = state.selectedItems.has(item);
        cb.addEventListener('change', () => {
          const s = new Set(state.selectedItems);
          cb.checked ? s.add(item) : s.delete(item);
          setState({ selectedItems: s });
        });
        const txt = el('span', { cls: klass('rp-item-text'), text: item });
        row.appendChild(cb); row.appendChild(txt);
        sec.appendChild(row);
      }
      container.appendChild(sec);
    }

    if (state.error) {
      container.appendChild(el('p', { cls: klass('rp-error'), text: `⚠ ${state.error}` }));
    }

    const canGen = state.selectedItems.size > 0;
    const genBtn = el('button', {
      cls:   klass('rp-btn', 'rp-btn--primary'),
      attrs: { type: 'button' },
      text:  `Generate reply (${state.selectedItems.size} point${state.selectedItems.size === 1 ? '' : 's'} selected) →`
    });
    genBtn.disabled = !canGen;
    genBtn.addEventListener('click', generateReply);
    container.appendChild(genBtn);
  }

  function renderGenerating(container) {
    const wrap = el('div', { cls: klass('rp-loading') });
    wrap.innerHTML = `<div class="${P}rp-spinner"></div><p class="${P}rp-status">Generating follow-up reply…</p>`;
    container.appendChild(wrap);
  }

  function renderGenerated(container) {
    const subSec = section('Subject');
    const subIn  = el('input', { cls: klass('rp-input'), attrs: { type: 'text', value: state.replySubject } });
    subIn.addEventListener('input', () => { state.replySubject = subIn.value; });
    subSec.appendChild(subIn);
    container.appendChild(subSec);

    const bodySec = section('Reply body');
    const bodyTa  = el('textarea', { cls: klass('rp-textarea') });
    bodyTa.value  = state.replyBody;
    bodyTa.rows   = 11;
    bodyTa.addEventListener('input', () => { state.replyBody = bodyTa.value; });
    bodySec.appendChild(bodyTa);
    container.appendChild(bodySec);

    if (state.error) {
      container.appendChild(el('p', { cls: klass('rp-error'), text: `⚠ ${state.error}` }));
    }

    const btnRow  = el('div', { cls: klass('rp-btn-row') });
    const regenBtn = el('button', { cls: klass('rp-btn', 'rp-btn--ghost'), attrs: { type: 'button' }, text: '↺ Regenerate' });
    regenBtn.addEventListener('click', generateReply);
    const sendBtn  = el('button', { cls: klass('rp-btn', 'rp-btn--primary'), attrs: { type: 'button' }, text: 'Populate reply & log →' });
    sendBtn.addEventListener('click', populateReply);
    btnRow.appendChild(regenBtn); btnRow.appendChild(sendBtn);
    container.appendChild(btnRow);
  }

  function renderDone(container) {
    const wrap = el('div', { cls: klass('rp-done') });
    wrap.innerHTML = `
      <div class="${P}rp-done-icon">✓</div>
      <p class="${P}rp-done-title">Reply populated &amp; logged</p>
      <p class="${P}rp-done-sub">Review in Gmail and click Send. This exchange is logged in BiotechOS.</p>`;
    container.appendChild(wrap);
    const closeBtn = el('button', { cls: klass('rp-btn', 'rp-btn--ghost'), attrs: { type: 'button' }, text: 'Close' });
    closeBtn.addEventListener('click', close);
    container.appendChild(closeBtn);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function analyse() {
    setState({ phase: 'loading', error: null, gapAnalysis: null, selectedItems: new Set() });
    try {
      const res = await apiCall('analyzeReply', {
        emailBody:   state.emailBody,
        senderEmail: state.senderEmail,
      });
      setState({
        phase:        'analysed',
        engagementId: res.engagement_id || null,
        croName:      res.cro_name      || null,
        gapAnalysis:  res.gap_analysis  || {},
      });
    } catch (err) {
      setState({ phase: 'loading', error: `Analysis failed: ${err.message}` });
    }
  }

  async function generateReply() {
    setState({ phase: 'generating', error: null });
    try {
      const res = await apiCall('generateReply', {
        croName:         state.croName,
        selectedItems:   Array.from(state.selectedItems),
        originalSubject: state.subject,
      });
      setState({ phase: 'generated', replySubject: res.subject, replyBody: res.body });
    } catch (err) {
      setState({ phase: 'analysed', error: `Reply generation failed: ${err.message}` });
    }
  }

  async function populateReply() {
    // Populate Gmail reply compose via custom event
    document.dispatchEvent(new CustomEvent('bio-oe-populate-reply', {
      detail: { subject: state.replySubject, body: state.replyBody }
    }));

    setState({ phase: 'done' });

    // Log in app (best-effort)
    try {
      await apiCall('logReply', {
        engagementId: state.engagementId,
        subject:      state.replySubject,
        replyBody:    state.replyBody,
        gapAnalysis:  state.gapAnalysis,
      });
    } catch (err) {
      console.warn('[biotechos] failed to log reply', err);
    }
  }

  // ── Panel lifecycle ────────────────────────────────────────────────────────
  function buildPanel() {
    panelEl = el('div', {
      cls:   klass('rp-panel'),
      attrs: { [`data-${P}mark`]: 'reply-panel', role: 'dialog', 'aria-label': 'BiotechOS Reply Analysis' }
    });

    const header   = el('div', { cls: klass('rp-header') });
    const titleEl  = el('div', { cls: klass('rp-title') });
    titleEl.innerHTML = `<span class="${P}rp-logo">✦</span> Analyse &amp; Reply`;
    const headerActions = el('div', { cls: klass('op-header-actions') });
    const themeBtn = el('button', {
      cls:   klass('op-theme-btn'),
      attrs: { type: 'button', title: 'Toggle theme', [`data-${P}mark`]: 'rp-theme-btn' },
      text:  '🌙'
    });
    themeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panelTheme = panelTheme === 'light' ? 'dark' : 'light';
      applyTheme();
      try { chrome.storage.local.set({ biotechos_theme: panelTheme }); } catch {}
    });
    const closeBtn = el('button', {
      cls:   klass('rp-close'),
      attrs: { type: 'button', 'aria-label': 'Close', title: 'Close' },
      text:  '×'
    });
    closeBtn.addEventListener('click', close);
    headerActions.appendChild(themeBtn); headerActions.appendChild(closeBtn);
    header.appendChild(titleEl); header.appendChild(headerActions);
    panelEl.appendChild(header);
    panelEl.appendChild(el('div', { cls: klass('rp-body') }));
    document.body.appendChild(panelEl);
  }

  function open({ from, body, subject, btn }) {
    triggerBtn = btn;
    if (!panelEl || !document.body.contains(panelEl)) buildPanel();
    panelEl.style.display = 'flex';
    try {
      chrome.storage.local.get('biotechos_theme', (result) => {
        panelTheme = result.biotechos_theme || 'light';
        applyTheme();
      });
    } catch { applyTheme(); }
    setState({ senderEmail: from || '', emailBody: body || '', subject: subject || '', phase: 'loading', error: null });
    analyse();
  }

  function close() {
    if (panelEl) panelEl.style.display = 'none';
    if (triggerBtn) { try { triggerBtn.focus(); } catch { /* ignore */ } }
  }

  // Listener for Gmail reply populate event
  document.addEventListener('bio-oe-populate-reply', async (e) => {
    const { body: replyBody } = e.detail || {};
    if (!replyBody) return;

    // Find and click the Reply button on the last email card
    const cards   = document.querySelectorAll('.gs');
    const lastCard = cards[cards.length - 1];
    if (!lastCard) return;

    const replyBtn = lastCard.querySelector('[data-tooltip*="Reply"], [aria-label*="Reply"]');
    if (replyBtn) replyBtn.click();

    // Wait for compose area and inject text
    const composeBody = await waitFor('.Am.Al.editable, [role="textbox"][aria-label="Message Body"]', { timeoutMs: 4000 });
    if (composeBody) {
      composeBody.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, replyBody);
    }
  });

  root.BIOTECHOS_REPLY_PANEL = { open, close };
})(typeof self !== 'undefined' ? self : globalThis);
