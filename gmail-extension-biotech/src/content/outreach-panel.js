// Outreach panel — side panel for the compose flow.
// User selects a study brief + CROs → generates IP-safe outreach email → sends.

(function initOutreachPanel(root) {
  const CFG = root.BIOTECHOS_CONFIG;
  const { el, klass, waitFor } = root.BIOTECHOS_DOM;
  const P = CFG.CSS_PREFIX;

  // ── API proxy helper ───────────────────────────────────────────────────────
  function apiCall(method, args) {
    return new Promise((resolve, reject) => {
      if (!chrome?.runtime?.sendMessage) {
        return reject(new Error('Extension context lost — please refresh this Gmail tab'));
      }
      chrome.runtime.sendMessage({ type: CFG.MESSAGES.API_CALL, payload: { method, args } }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res && res.ok) return resolve(res.data);
        reject(new Error(res?.error || 'API call failed'));
      });
    });
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let panelEl   = null;
  let authState = null;
  let composeDialog = null;
  let panelTheme = 'light';

  let state = {
    // Fresh outreach phases: select | generating | generated | done
    // Continuation phases:   continuation-generating | continuation-generated | done
    phase:           'select',
    briefs:          [],
    selectedBriefId: null,
    croQuery:        '',
    croResults:      [],        // [{id, name, email, tags, source}]
    croSearching:    false,
    croSource:       null,      // 'directory' | 'engagement' | null
    manualCros:      [],
    selectedIds:     new Set(),
    subject:         '',
    body:            '',
    error:           null,
    loading:         false,
    // Continuation mode
    isReplyCompose:         false,
    continuationEmail:      '',
    continuationLooking:    false,   // auto-lookup in progress
    continuationEngagement: null,
    continuationMatchType:  null,
    continuationBody:       '',
    continuationSubject:    null,
    includeSubject:         false,
    showNewOutreach:        true,    // false by default in reply mode
  };

  function setState(patch) {
    Object.assign(state, patch);
    render();
  }

  function applyTheme() {
    document.body.setAttribute('data-bio-oe-theme', panelTheme);
    if (!panelEl) return;
    const btn = panelEl.querySelector(`[data-${P}mark="theme-btn"]`);
    if (btn) btn.textContent = panelTheme === 'dark' ? '☀' : '🌙';
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getAllSelectedCros() {
    const fromSearch = state.croResults.filter(c => state.selectedIds.has(c.id));
    const fromManual = state.manualCros.filter(c => state.selectedIds.has(c.id));
    return [...fromSearch, ...fromManual];
  }

  async function runCroSearch(q) {
    setState({ croSearching: true, error: null });
    try {
      const res = await apiCall('searchCros', { q: q || '' });
      setState({ croResults: res.cros || [], croSource: res.source || null, croSearching: false });
    } catch (err) {
      setState({ croSearching: false, error: `CRO search failed: ${err.message}` });
    }
  }

  // Auto-lookup runs on panel open — stays on 'select' phase, no user click needed.
  async function autoLookupContinuation(email) {
    if (!email) return;
    setState({ continuationLooking: true });
    try {
      const res = await apiCall('lookupEngagement', { email });
      setState({ continuationEngagement: res.engagement || null, continuationMatchType: res.matchType, continuationLooking: false });
    } catch (err) {
      setState({ continuationLooking: false });
      console.warn('[biotechos] continuation auto-lookup failed:', err.message);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    if (!panelEl) return;
    const body = panelEl.querySelector(`.${P}op-body`);
    if (!body) return;
    body.innerHTML = '';

    if (state.phase === 'select')                   renderSelect(body);
    if (state.phase === 'generating')               renderGenerating(body);
    if (state.phase === 'generated')                renderGenerated(body);
    if (state.phase === 'continuation-generating')  renderGenerating(body);
    if (state.phase === 'continuation-generated')   renderContinuationGenerated(body);
    if (state.phase === 'done')                     renderDone(body);
  }

  function section(label) {
    const wrap = el('div', { cls: klass('op-section') });
    if (label) wrap.appendChild(el('p', { cls: klass('op-label'), text: label }));
    return wrap;
  }

  function skeletonRows(n) {
    const wrap = el('div', { cls: klass('op-skeleton-list') });
    for (let i = 0; i < n; i++) {
      const row = el('div', { cls: klass('op-skeleton-row') });
      row.innerHTML = `<span class="${P}skeleton ${P}skeleton--name"></span><span class="${P}skeleton ${P}skeleton--email"></span>`;
      wrap.appendChild(row);
    }
    return wrap;
  }

  function renderCroResults(croSec) {
    if (state.croSearching) {
      croSec.appendChild(skeletonRows(5));
      return;
    }

    if (state.croResults.length > 0) {
      const allRow = el('div', { cls: klass('op-select-all-row') });
      const selAllBtn   = el('button', { cls: klass('op-btn--link'), attrs: { type: 'button' }, text: 'Select all' });
      const unselAllBtn = el('button', { cls: klass('op-btn--link'), attrs: { type: 'button' }, text: 'Unselect all' });
      selAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = new Set(state.selectedIds); state.croResults.forEach(c => s.add(c.id));
        setState({ selectedIds: s });
      });
      unselAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = new Set(state.selectedIds); state.croResults.forEach(c => s.delete(c.id));
        setState({ selectedIds: s });
      });
      allRow.appendChild(selAllBtn);
      allRow.appendChild(el('span', { text: ' · ' }));
      allRow.appendChild(unselAllBtn);
      croSec.appendChild(allRow);
    }

    for (const cro of state.croResults) {
      const row = el('div', { cls: klass('op-cro-row') });
      const cb  = el('input', { attrs: { type: 'checkbox', id: `cro-${cro.id}` } });
      cb.checked = state.selectedIds.has(cro.id);
      cb.addEventListener('change', () => {
        const s = new Set(state.selectedIds);
        cb.checked ? s.add(cro.id) : s.delete(cro.id);
        setState({ selectedIds: s });
      });
      const lbl = el('label', { attrs: { for: `cro-${cro.id}` } });
      const tags = cro.tags?.length ? `<span class="${P}op-cro-tags">${cro.tags.join(' · ')}</span>` : '';
      lbl.innerHTML = `<strong>${cro.name}</strong>${tags}`;
      if (cro.email) {
        const emailSpan = el('em'); emailSpan.textContent = cro.email;
        lbl.appendChild(emailSpan);
      } else {
        const emailIn = el('input', { cls: klass('op-input', 'op-input--inline'),
          attrs: { type: 'email', placeholder: 'enter email…', id: `cro-email-${cro.id}` } });
        emailIn.addEventListener('input', () => { cro.email = emailIn.value.trim(); });
        emailIn.addEventListener('click', (e) => e.stopPropagation());
        lbl.appendChild(emailIn);
      }
      row.appendChild(cb); row.appendChild(lbl);
      croSec.appendChild(row);
    }

    if (state.croResults.length === 0 && state.croQuery) {
      croSec.appendChild(el('p', { cls: klass('op-hint'), text: 'No results — add manually below.' }));
    }
    if (state.croResults.length === 0 && !state.croQuery) {
      croSec.appendChild(el('p', { cls: klass('op-hint'), text: 'Type a name to search, or add CROs manually below.' }));
    }
  }

  function renderNewOutreachForm(container) {
    // Brief selector
    const briefSec = section('1. Select study brief');
    if (state.loading) {
      briefSec.appendChild(skeletonRows(2));
    } else {
      const briefSel = el('select', { cls: klass('op-select') });
      briefSel.appendChild(el('option', { attrs: { value: '' }, text: '— Choose a brief —' }));
      for (const b of state.briefs) {
        const opt = el('option', { attrs: { value: b.id }, text: b.title });
        if (b.id === state.selectedBriefId) opt.selected = true;
        briefSel.appendChild(opt);
      }
      briefSel.addEventListener('change', (e) => setState({ selectedBriefId: e.target.value, error: null }));
      briefSec.appendChild(briefSel);
    }
    container.appendChild(briefSec);

    // CRO search
    const croSec = section('2. Search & select CROs');
    const searchRow = el('div', { cls: klass('op-search-row') });
    const searchIn  = el('input', { cls: klass('op-input'), attrs: {
      type: 'text', placeholder: 'Search CROs by name…', value: state.croQuery
    }});
    let searchTimer = null;
    searchIn.addEventListener('input', () => {
      state.croQuery = searchIn.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runCroSearch(searchIn.value), 350);
    });
    searchRow.appendChild(searchIn);
    croSec.appendChild(searchRow);
    if (state.croSource === 'engagement') {
      croSec.appendChild(el('p', { cls: klass('op-info'),
        text: 'Searching your past engagements — global CRO directory coming soon.' }));
    }
    renderCroResults(croSec);
    container.appendChild(croSec);

    // Manual CRO entry
    const manSec = section('+ Add CRO manually');
    for (const cro of state.manualCros) {
      const row = el('div', { cls: klass('op-cro-row') });
      const cb  = el('input', { attrs: { type: 'checkbox', id: `cro-${cro.id}` } });
      cb.checked = state.selectedIds.has(cro.id);
      cb.addEventListener('change', () => {
        const s = new Set(state.selectedIds);
        cb.checked ? s.add(cro.id) : s.delete(cro.id);
        setState({ selectedIds: s });
      });
      const lbl = el('label', { attrs: { for: `cro-${cro.id}` } });
      lbl.innerHTML = `<strong>${cro.name}</strong> <em>${cro.email}</em>`;
      const rm = el('button', { cls: klass('op-rm'), attrs: { type: 'button', title: 'Remove' }, text: '×' });
      rm.addEventListener('click', () => {
        const s = new Set(state.selectedIds); s.delete(cro.id);
        setState({ manualCros: state.manualCros.filter(c => c.id !== cro.id), selectedIds: s });
      });
      row.appendChild(cb); row.appendChild(lbl); row.appendChild(rm);
      manSec.appendChild(row);
    }
    const addRow  = el('div', { cls: klass('op-add-row') });
    const nameIn  = el('input', { cls: klass('op-input'), attrs: { type: 'text', placeholder: 'CRO name' } });
    const emailIn = el('input', { cls: klass('op-input'), attrs: { type: 'email', placeholder: 'email@cro.com' } });
    const addBtn  = el('button', { cls: klass('op-btn', 'op-btn--ghost'), attrs: { type: 'button' }, text: '+ Add' });
    addBtn.addEventListener('click', () => {
      const name = nameIn.value.trim(), email = emailIn.value.trim();
      if (!name || !email) return;
      const id = `m-${Date.now()}`;
      const s  = new Set(state.selectedIds); s.add(id);
      setState({ manualCros: [...state.manualCros, { id, name, email }], selectedIds: s });
      nameIn.value = ''; emailIn.value = '';
    });
    addRow.appendChild(nameIn); addRow.appendChild(emailIn); addRow.appendChild(addBtn);
    manSec.appendChild(addRow);
    container.appendChild(manSec);

    if (state.error) container.appendChild(el('p', { cls: klass('op-error'), text: `⚠ ${state.error}` }));

    const cros   = getAllSelectedCros();
    const canGen = !!state.selectedBriefId && cros.length > 0;
    const genBtn = el('button', { cls: klass('op-btn', 'op-btn--primary'), attrs: { type: 'button' },
      text: 'Generate outreach email →' });
    genBtn.disabled = !canGen;
    if (canGen) genBtn.title = `Individual emails to: ${cros.map(c => c.name).join(', ')}`;
    genBtn.addEventListener('click', (e) => { e.stopPropagation(); generateEmail(); });
    container.appendChild(genBtn);
  }

  function renderSelect(container) {
    // ── Reply mode: continuation card at top ────────────────────────────────
    if (state.isReplyCompose) {
      const card = el('div', { cls: klass('op-continuation-banner') });

      if (state.continuationLooking) {
        // Loading skeleton
        card.innerHTML = `<p class="${P}op-continuation-title">↩ Continuing conversation…</p>`;
        card.appendChild(skeletonRows(2));

      } else if (state.continuationEngagement) {
        const eng = state.continuationEngagement;
        const matchNote = state.continuationMatchType === 'domain'
          ? ` <span style="opacity:.7;font-size:11px">(domain match)</span>` : '';
        card.innerHTML = `
          <p class="${P}op-continuation-title">↩ Continue this conversation</p>
          <div class="${P}op-cont-found-card">
            <strong>${eng.cro_name}</strong>${matchNote}<br>
            <span style="opacity:.8;font-size:11px">${eng.cro_email}</span><br>
            <span style="opacity:.7;font-size:11px">Stage: ${eng.stage}</span>
          </div>`;
        const cbRow = el('div', { cls: klass('op-checkbox-row') });
        const subCb = el('input', { attrs: { type: 'checkbox', id: 'cont-subj-cb' } });
        subCb.checked = state.includeSubject;
        subCb.addEventListener('change', () => { state.includeSubject = subCb.checked; });
        const subLbl = el('label', { attrs: { for: 'cont-subj-cb' }, text: ' Also suggest a new subject line' });
        cbRow.appendChild(subCb); cbRow.appendChild(subLbl);
        card.appendChild(cbRow);
        const genBtn = el('button', { cls: klass('op-btn', 'op-btn--continue'), attrs: { type: 'button' },
          text: 'Generate follow-up →' });
        genBtn.addEventListener('click', (e) => { e.stopPropagation(); generateContinuationEmail(); });
        card.appendChild(genBtn);

      } else {
        // No match found — manual email entry
        card.innerHTML = `<p class="${P}op-continuation-title">↩ Continue a conversation</p>
          <p style="font-size:12px;opacity:.85;margin:0">No engagement found for this thread. Enter the CRO's email to look up:</p>`;
        const emailIn = el('input', { cls: klass('op-input'), attrs: {
          type: 'email', placeholder: 'cro@example.com', value: state.continuationEmail,
          style: 'background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.4);color:#fff'
        }});
        emailIn.addEventListener('input', () => { state.continuationEmail = emailIn.value.trim(); });
        card.appendChild(emailIn);
        const lookupBtn = el('button', { cls: klass('op-btn', 'op-btn--continue'), attrs: { type: 'button' },
          text: 'Look up →' });
        lookupBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          autoLookupContinuation(state.continuationEmail);
        });
        card.appendChild(lookupBtn);
      }

      if (state.error) card.appendChild(el('p', { cls: klass('op-error'), text: `⚠ ${state.error}` }));
      container.appendChild(card);

      // Divider with "start new outreach" toggle
      const divider = el('div', { cls: klass('op-divider') });
      divider.textContent = 'or start a new outreach';
      const toggleBtn = el('button', { cls: klass('op-btn--link'), attrs: { type: 'button' },
        text: state.showNewOutreach ? '▲ hide' : '▼ show' });
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setState({ showNewOutreach: !state.showNewOutreach });
      });
      divider.appendChild(toggleBtn);
      container.appendChild(divider);

      if (!state.showNewOutreach) return;
    }

    // ── Standard new outreach form ───────────────────────────────────────────
    renderNewOutreachForm(container);
  }

  function renderGenerating(container) {
    const wrap = el('div', { cls: klass('op-generating') });
    wrap.innerHTML = `<div class="${P}op-spinner"></div><p class="${P}op-status">✦ Generating IP-safe outreach email…</p><p class="${P}op-hint">No compound names or mechanisms will appear.</p>`;
    container.appendChild(wrap);
  }

  function renderGenerated(container) {
    const cros = getAllSelectedCros();

    // Subject
    const subSec = section('Subject');
    const subIn  = el('input', { cls: klass('op-input'), attrs: { type: 'text', value: state.subject } });
    subIn.addEventListener('input', () => { state.subject = subIn.value; });
    subSec.appendChild(subIn);
    container.appendChild(subSec);

    // Recipients — individual emails, one per CRO
    const rcpSec = section(`${cros.length} individual email${cros.length > 1 ? 's' : ''} — one per CRO`);
    for (const c of cros) {
      rcpSec.appendChild(el('p', { cls: klass('op-recipient'), text: `→ ${c.name} <${c.email}>` }));
    }
    container.appendChild(rcpSec);

    // Body
    const bodySec = section('Email body  ({{CRO_NAME}} replaced per recipient)');
    const bodyTa  = el('textarea', { cls: klass('op-textarea') });
    bodyTa.value  = state.body;
    bodyTa.rows   = 11;
    bodyTa.addEventListener('input', () => { state.body = bodyTa.value; });
    bodySec.appendChild(bodyTa);
    container.appendChild(bodySec);

    if (state.error) {
      container.appendChild(el('p', { cls: klass('op-error'), text: `⚠ ${state.error}` }));
    }

    const btnRow  = el('div', { cls: klass('op-btn-row') });
    const regenBtn = el('button', { cls: klass('op-btn', 'op-btn--ghost'), attrs: { type: 'button' }, text: '↺ Regenerate' });
    regenBtn.addEventListener('click', (e) => { e.stopPropagation(); generateEmail(); });
    const sendBtn  = el('button', { cls: klass('op-btn', 'op-btn--primary'), attrs: { type: 'button' },
      text: `Open ${cros.length} compose${cros.length > 1 ? 's' : ''} & log →` });
    sendBtn.addEventListener('click', (e) => { e.stopPropagation(); populateAndLog(); });
    btnRow.appendChild(regenBtn); btnRow.appendChild(sendBtn);
    container.appendChild(btnRow);
  }

  // ── Continuation mode render ───────────────────────────────────────────────
  function renderContinuationConfirm(container) {
    const eng = state.continuationEngagement;

    if (!eng) {
      // No match found — show manual email input
      const sec = section('Continue conversation with a CRO');
      sec.appendChild(el('p', { cls: klass('op-hint'),
        text: 'No engagement found automatically. Enter the CRO email to look up.' }));
      const emailIn = el('input', { cls: klass('op-input'),
        attrs: { type: 'email', placeholder: 'cro@example.com', value: state.continuationEmail } });
      emailIn.addEventListener('input', () => { state.continuationEmail = emailIn.value.trim(); });
      sec.appendChild(emailIn);
      if (state.error) sec.appendChild(el('p', { cls: klass('op-error'), text: `⚠ ${state.error}` }));
      const row = el('div', { cls: klass('op-btn-row') });
      const backBtn  = el('button', { cls: klass('op-btn', 'op-btn--ghost'), attrs: { type: 'button' }, text: '← Back' });
      backBtn.addEventListener('click', (e) => { e.stopPropagation(); setState({ phase: 'select', error: null }); });
      const lookupBtn = el('button', { cls: klass('op-btn', 'op-btn--primary'), attrs: { type: 'button' }, text: 'Look up →' });
      lookupBtn.addEventListener('click', (e) => { e.stopPropagation(); startContinuationMode(state.continuationEmail); });
      row.appendChild(backBtn); row.appendChild(lookupBtn);
      sec.appendChild(row);
      container.appendChild(sec);
      return;
    }

    // Match found — show confirmation card
    const sec = section('Continue conversation');
    const matchNote = state.continuationMatchType === 'domain'
      ? `(matched by domain @${eng.cro_email.split('@')[1]})`
      : '';
    sec.appendChild(el('p', { cls: klass('op-hint'), text: `Found engagement:` }));
    const card = el('div', { cls: klass('op-cro-card') });
    card.innerHTML = `<strong>${eng.cro_name}</strong><br><em>${eng.cro_email}</em> ${matchNote}<br>Stage: ${eng.stage}`;
    sec.appendChild(card);

    const subjectRow = el('div', { cls: klass('op-checkbox-row') });
    const subCb = el('input', { attrs: { type: 'checkbox', id: 'cont-subj-cb' } });
    subCb.checked = state.includeSubject;
    subCb.addEventListener('change', () => { state.includeSubject = subCb.checked; });
    const subLbl = el('label', { attrs: { for: 'cont-subj-cb' }, text: ' Also suggest a new subject line' });
    subjectRow.appendChild(subCb); subjectRow.appendChild(subLbl);
    sec.appendChild(subjectRow);

    if (state.error) sec.appendChild(el('p', { cls: klass('op-error'), text: `⚠ ${state.error}` }));

    const row = el('div', { cls: klass('op-btn-row') });
    const backBtn = el('button', { cls: klass('op-btn', 'op-btn--ghost'), attrs: { type: 'button' }, text: '← Back' });
    backBtn.addEventListener('click', (e) => { e.stopPropagation(); setState({ phase: 'select', error: null }); });
    const genBtn = el('button', { cls: klass('op-btn', 'op-btn--primary'), attrs: { type: 'button' }, text: 'Generate follow-up →' });
    genBtn.addEventListener('click', (e) => { e.stopPropagation(); generateContinuationEmail(); });
    row.appendChild(backBtn); row.appendChild(genBtn);
    sec.appendChild(row);
    container.appendChild(sec);
  }

  function renderContinuationGenerated(container) {
    const bodySec = section('Follow-up email body');
    const bodyTa  = el('textarea', { cls: klass('op-textarea') });
    bodyTa.value  = state.continuationBody;
    bodyTa.rows   = 10;
    bodyTa.addEventListener('input', () => { state.continuationBody = bodyTa.value; });
    bodySec.appendChild(bodyTa);
    container.appendChild(bodySec);

    if (state.continuationSubject) {
      const subSec = section('Suggested subject (will replace current)');
      const subIn  = el('input', { cls: klass('op-input'), attrs: { type: 'text', value: state.continuationSubject } });
      subIn.addEventListener('input', () => { state.continuationSubject = subIn.value; });
      subSec.appendChild(subIn);
      container.appendChild(subSec);
    }

    if (state.error) container.appendChild(el('p', { cls: klass('op-error'), text: `⚠ ${state.error}` }));

    const btnRow  = el('div', { cls: klass('op-btn-row') });
    const regenBtn = el('button', { cls: klass('op-btn', 'op-btn--ghost'), attrs: { type: 'button' }, text: '↺ Regenerate' });
    regenBtn.addEventListener('click', (e) => { e.stopPropagation(); generateContinuationEmail(); });
    const popBtn  = el('button', { cls: klass('op-btn', 'op-btn--primary'), attrs: { type: 'button' }, text: 'Populate body →' });
    popBtn.addEventListener('click', (e) => { e.stopPropagation(); populateContinuation(); });
    btnRow.appendChild(regenBtn); btnRow.appendChild(popBtn);
    container.appendChild(btnRow);
  }

  // ── Continuation actions ───────────────────────────────────────────────────
  async function startContinuationMode(emailOverride) {
    const email = emailOverride || state.continuationEmail;
    setState({ phase: 'continuation-confirm', continuationEmail: email, continuationEngagement: null, error: null });
    if (!email) return;
    try {
      const res = await apiCall('lookupEngagement', { email });
      setState({ continuationEngagement: res.engagement || null, continuationMatchType: res.matchType });
    } catch (err) {
      setState({ error: `Lookup failed: ${err.message}` });
    }
  }

  async function generateContinuationEmail() {
    const eng = state.continuationEngagement;
    if (!eng) return;
    const currentSubject = composeDialog?.querySelector('input[name="subjectbox"]')?.value || '';
    setState({ phase: 'continuation-generating', error: null });
    try {
      const res = await apiCall('generateContinuation', {
        engagementId:   eng.id,
        croName:        eng.cro_name,
        currentSubject,
        includeSubject: state.includeSubject,
      });
      setState({ phase: 'continuation-generated', continuationBody: res.body, continuationSubject: res.subject ?? null });
    } catch (err) {
      setState({ phase: 'continuation-confirm', error: `Generation failed: ${err.message}` });
    }
  }

  async function populateContinuation() {
    const dialog = composeDialog || document.querySelector('[role="dialog"]');
    if (!dialog) return;

    // Body only
    const bodyEl = await waitFor('[role="textbox"][aria-label="Message Body"], .Am.Al.editable', { root: dialog, timeoutMs: 3000 });
    if (bodyEl) {
      bodyEl.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, state.continuationBody || '');
    }

    // Subject — only if user opted in and Claude returned one
    if (state.continuationSubject && state.includeSubject) {
      const subIn = dialog.querySelector('input[name="subjectbox"], [aria-label="Subject"]');
      if (subIn) {
        subIn.focus();
        _nativeSetter.call(subIn, state.continuationSubject);
        subIn.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    setState({ phase: 'done' });
  }

  function renderDone(container) {
    const wrap = el('div', { cls: klass('op-done') });
    wrap.innerHTML = `
      <div class="${P}op-done-icon">✓</div>
      <p class="${P}op-done-title">Email populated &amp; logged</p>
      <p class="${P}op-done-sub">Review the email in Gmail and click Send. CRO replies will land in your inbox.</p>`;
    container.appendChild(wrap);
    const closeBtn = el('button', { cls: klass('op-btn', 'op-btn--ghost'), attrs: { type: 'button' }, text: 'Close' });
    closeBtn.addEventListener('click', close);
    container.appendChild(closeBtn);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function generateEmail() {
    const cros = getAllSelectedCros();
    setState({ phase: 'generating', error: null });
    try {
      const res = await apiCall('generateOutreach', {
        briefId:  state.selectedBriefId,
        croNames: cros.map(c => c.name)
      });
      setState({ phase: 'generated', subject: res.subject, body: res.body });
    } catch (err) {
      setState({ phase: 'select', error: `Generation failed: ${err.message}` });
    }
  }

  // Opens a new Gmail compose window and returns the dialog element.
  async function openNewGmailCompose() {
    const existing = new Set(document.querySelectorAll('[role="dialog"]'));
    console.log('[biotechos] openNewGmailCompose: existing dialogs =', existing.size);

    const btn = document.querySelector('[data-tooltip^="Compose"], [gh="cm"], [aria-label^="Compose"], .T-I.T-I-KE');
    console.log('[biotechos] compose btn found:', !!btn, btn?.outerHTML?.slice(0, 120));
    if (!btn) {
      // Last resort: find any element with text "Compose" in the sidebar
      const all = [...document.querySelectorAll('div[role="button"], div[tabindex]')];
      const fallback = all.find(el => el.textContent?.trim() === 'Compose');
      console.log('[biotechos] fallback compose btn:', !!fallback, fallback?.outerHTML?.slice(0, 120));
      if (!fallback) return null;
      fallback.click();
    } else {
      btn.click();
    }

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 150));
      const allDialogs = [...document.querySelectorAll('[role="dialog"]')];
      console.log('[biotechos] polling dialogs, total now:', allDialogs.length);
      const fresh = allDialogs.find(d => !existing.has(d));
      if (fresh) { console.log('[biotechos] new dialog found!'); return fresh; }
    }
    console.log('[biotechos] timed out — no new dialog appeared');
    return null;
  }

  async function populateAndLog() {
    const cros = getAllSelectedCros();
    setState({ phase: 'done' });

    for (let i = 0; i < cros.length; i++) {
      const cro = cros[i];

      if (i > 0) {
        const newDialog = await openNewGmailCompose();
        if (!newDialog) { console.warn('[biotechos] could not open compose for', cro.name); continue; }
        composeDialog = newDialog;
        await new Promise(r => setTimeout(r, 400));
      }

      document.dispatchEvent(new CustomEvent('bio-oe-populate-compose', {
        detail: {
          to:      cro.email,
          subject: state.subject,
          body:    state.body.replace(/\{\{CRO_NAME\}\}/gi, cro.name),
        }
      }));

      // Brief gap so Gmail can settle before next compose opens
      await new Promise(r => setTimeout(r, 500));
    }

    // Log in app (best-effort)
    try {
      await apiCall('logOutreach', {
        briefId: state.selectedBriefId,
        cros,
        subject: state.subject,
        body:    state.body,
      });
    } catch (err) {
      console.warn('[biotechos] failed to log outreach', err);
    }
  }

  // ── Panel lifecycle ────────────────────────────────────────────────────────
  function buildPanel() {
    panelEl = el('div', {
      cls:   klass('op-panel'),
      attrs: { [`data-${P}mark`]: 'outreach-panel', role: 'dialog', 'aria-label': 'BiotechOS Outreach' }
    });

    const header = el('div', { cls: klass('op-header') });
    const title  = el('div', { cls: klass('op-title') });
    title.innerHTML = `<span class="${P}op-logo">✦</span> Create CRO Outreach`;
    const headerActions = el('div', { cls: klass('op-header-actions') });
    const themeBtn = el('button', {
      cls:   klass('op-theme-btn'),
      attrs: { type: 'button', title: 'Toggle theme', [`data-${P}mark`]: 'theme-btn' },
      text:  '🌙'
    });
    themeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panelTheme = panelTheme === 'light' ? 'dark' : 'light';
      applyTheme();
      try { chrome.storage.local.set({ biotechos_theme: panelTheme }); } catch {}
    });
    const closeBtn = el('button', {
      cls:   klass('op-close'),
      attrs: { type: 'button', 'aria-label': 'Close', title: 'Close' },
      text:  '×'
    });
    closeBtn.addEventListener('click', close);
    headerActions.appendChild(themeBtn); headerActions.appendChild(closeBtn);
    header.appendChild(title); header.appendChild(headerActions);
    panelEl.appendChild(header);
    panelEl.appendChild(el('div', { cls: klass('op-body') }));
    document.body.appendChild(panelEl);
  }

  async function open(dialog, auth, gmailState, isInlineReply) {
    authState     = auth;
    composeDialog = dialog;

    if (!panelEl || !document.body.contains(panelEl)) buildPanel();
    panelEl.style.display = 'flex';

    // Load saved theme (default: match OS preference)
    try {
      chrome.storage.local.get('biotechos_theme', (result) => {
        panelTheme = result.biotechos_theme || 'light';
        applyTheme();
      });
    } catch { applyTheme(); }

    // isInlineReply = true  → button was injected into an inline reply form (not a popup dialog)
    // Fall back to chip detection for popup reply composes (reply-in-new-window)
    const existingChip   = dialog.querySelector('[data-hovercard-id]');
    const isReplyCompose = !!(isInlineReply || existingChip);

    // Detect CRO email for continuation mode
    let detectedEmail = '';

    // 1. Try reading pre-filled To chip directly from the compose container.
    //    Gmail inline replies pre-populate the To chip with data-hovercard-id = email.
    const toChip = dialog.querySelector('[data-hovercard-id]');
    if (toChip) {
      detectedEmail = toChip.dataset.hovercardId || toChip.getAttribute('email') || '';
    }
    if (!detectedEmail) {
      const emailAttr = dialog.querySelector('[email]');
      detectedEmail = emailAttr?.getAttribute('email') || '';
    }

    // 2. Fallback: scan thread emails, excluding the user's own address
    if (!detectedEmail && isInlineReply && gmailState?.openEmails?.length) {
      const selfEmail = (
        dialog.querySelector('input[name="from"]')?.value ||
        auth?.profile?.userEmail || ''
      ).toLowerCase();
      const inbound = [...gmailState.openEmails].reverse()
        .find(e => e.from && e.from.toLowerCase() !== selfEmail);
      detectedEmail = inbound?.from || '';
      console.log('[biotechos] open: inline reply fallback email from thread:', detectedEmail, '(self=', selfEmail, ')');
    }

    console.log('[biotechos] open: isReplyCompose=', isReplyCompose, 'detectedEmail=', detectedEmail);

    setState({
      phase: 'select', briefs: [], selectedBriefId: null,
      croQuery: '', croResults: [], croSearching: false, croSource: null,
      manualCros: [], selectedIds: new Set(),
      subject: '', body: '', error: null, loading: true,
      isReplyCompose, continuationEmail: detectedEmail,
      continuationLooking: false, continuationEngagement: null, continuationMatchType: null,
      continuationBody: '', continuationSubject: null, includeSubject: false,
      showNewOutreach: !isReplyCompose,
    });

    // Fire all three independently so a slow/hanging CRO search doesn't block briefs.
    const briefTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Request timed out — check extension auth')), 10000));
    Promise.race([apiCall('getBriefs', {}), briefTimeout])
      .then(res => {
        console.log('[biotechos] getBriefs result:', res);
        setState({ briefs: res.briefs || [], loading: false });
      })
      .catch(err => {
        console.error('[biotechos] getBriefs error:', err.message);
        setState({ error: `Could not load briefs: ${err.message}`, loading: false });
      });

    runCroSearch('');

    if (isReplyCompose && detectedEmail) autoLookupContinuation(detectedEmail);
  }

  function close() {
    if (panelEl) panelEl.style.display = 'none';
  }

  // Native value setter — still used for the subject field
  const _nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

  async function addEmailChip(input, email) {
    if (!input || !email) return;
    input.focus();
    await new Promise(r => setTimeout(r, 200));
    document.execCommand('insertText', false, email + ',');
    await new Promise(r => setTimeout(r, 350));
  }

  // ── Compose population listener ───────────────────────────────────────────
  document.addEventListener('bio-oe-populate-compose', async (e) => {
    const { to, subject, body } = e.detail || {};
    const dialog = composeDialog || document.querySelector('[role="dialog"]');
    if (!dialog) return;

    // 1. To field — CRO email address
    if (to) {
      const toInput = dialog.querySelector('input[aria-label*="To rec" i]');
      if (toInput) await addEmailChip(toInput, to);
    }

    // 2. Subject
    if (subject) {
      const subIn = dialog.querySelector('input[name="subjectbox"], [aria-label="Subject"]');
      if (subIn) {
        subIn.focus();
        _nativeSetter.call(subIn, subject);
        subIn.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 80));
      }
    }

    // 3. Body
    const bodyEl = await waitFor('[role="textbox"][aria-label="Message Body"], .Am.Al.editable', { root: dialog, timeoutMs: 3000 });
    if (bodyEl) {
      bodyEl.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, body || '');
    }
  });

  root.BIOTECHOS_OUTREACH_PANEL = { open, close };
})(typeof self !== 'undefined' ? self : globalThis);
