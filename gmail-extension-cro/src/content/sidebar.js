// Quote Generation Side Panel
//
// Task 6 additions on top of Task 4:
//   * `.sb-body` wrapper so header/footer stay pinned while content scrolls.
//   * Focus trap — Tab/Shift-Tab cycles inside the sidebar; close returns
//     focus to the button that triggered it.
//   * Loading skeleton — three shimmer placeholder cards replace the spinner.
//   * Grand total row — pricing section auto-sums visible totals.
//   * Staggered section entrance animation — sections fade/slide in sequence.

(function initSidebar(root) {
  const CFG = root.BIOTECHOS_CONFIG;
  const { el, klass } = root.BIOTECHOS_DOM;
  const MSG = CFG.MESSAGES;

  if (!CFG || !root.BIOTECHOS_DOM) {
    console.warn('[biotechos] sidebar.js: missing dependencies');
    return;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let sidebarEl   = null;
  let phase       = 'idle';
  let session     = null;
  let retryArgs   = null;
  let activeBtn   = null;
  let prevFocus   = null;
  let sidebarTheme = 'light';

  function applyTheme() {
    document.body.setAttribute('data-cro-qg-theme', sidebarTheme);
    if (!sidebarEl) return;
    const btn = sidebarEl.querySelector(`[data-${CFG.CSS_PREFIX}mark="theme-btn"]`);
    if (btn) btn.textContent = sidebarTheme === 'dark' ? '☀' : '🌙';
  }

  // ── API proxy ──────────────────────────────────────────────────────────────
  function apiCall(method, args) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: MSG.API_CALL, payload: { method, args } },
        (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!res || !res.ok) {
            const err = new Error(res?.error || 'API call failed');
            err.code      = res?.code;
            err.authError = !!res?.authError;
            return reject(err);
          }
          resolve(res.data);
        }
      );
    });
  }

  // ── Focus trap ─────────────────────────────────────────────────────────────
  const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

  function getFocusable() {
    return sidebarEl ? Array.from(sidebarEl.querySelectorAll(FOCUSABLE)) : [];
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSidebar();
      return;
    }
    if (e.key !== 'Tab' || !sidebarEl) return;

    const nodes = getFocusable();
    if (!nodes.length) { e.preventDefault(); return; }

    const first = nodes[0];
    const last  = nodes[nodes.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }

  // ── Sidebar shell ──────────────────────────────────────────────────────────
  function mount() {
    if (sidebarEl && document.body.contains(sidebarEl)) return sidebarEl;

    prevFocus = document.activeElement;

    sidebarEl = el('div', {
      cls: klass('sidebar'),
      attrs: {
        [`data-${CFG.CSS_PREFIX}mark`]: 'sidebar',
        role: 'complementary',
        'aria-label': 'BiotechOS Quote Generator',
        tabindex: '-1'
      }
    });

    document.body.appendChild(sidebarEl);
    document.addEventListener('keydown', onKeyDown, true);

    try {
      chrome.storage.local.get('biotechos_theme', (result) => {
        sidebarTheme = result.biotechos_theme || 'light';
        applyTheme();
      });
    } catch { applyTheme(); }

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        sidebarEl.classList.add(klass('sidebar--open'));
        // Move focus into sidebar so screen readers announce it.
        sidebarEl.focus();
      })
    );

    return sidebarEl;
  }

  function closeSidebar() {
    if (!sidebarEl) return;
    sidebarEl.classList.remove(klass('sidebar--open'));
    document.removeEventListener('keydown', onKeyDown, true);

    if (activeBtn) {
      activeBtn.classList.remove(klass('quote-btn--loading'));
      activeBtn.disabled = false;
      activeBtn = null;
    }

    // Return focus to whichever element had it before the sidebar opened.
    if (prevFocus && typeof prevFocus.focus === 'function') {
      try { prevFocus.focus(); } catch { /* ignore */ }
      prevFocus = null;
    }

    setTimeout(() => {
      if (sidebarEl) { sidebarEl.remove(); sidebarEl = null; }
      phase   = 'idle';
      session = null;
    }, 300);
  }

  // ── Scrollable body wrapper ────────────────────────────────────────────────
  // Header and footer are sticky; only the body scrolls. Without this wrapper
  // the old `> *:not(header):not(footer) { flex: 1 }` CSS selector applies
  // flex: 1 to each section individually, which breaks scrolling.
  function makeBody(...children) {
    return el('div', { cls: klass('sb-body') }, children.filter(Boolean));
  }

  // ── Phase renderers ────────────────────────────────────────────────────────
  function renderLoading(message, step, totalSteps) {
    const sb = mount();
    sb.innerHTML = '';
    sb.appendChild(buildHeader({ title: 'Generating Quote…', proposalId: null }));
    sb.appendChild(makeBody(buildSkeleton(message, step, totalSteps)));
  }

  function setLoadingText(text, step, totalSteps) {
    const node = sidebarEl && sidebarEl.querySelector(`.${klass('sb-loading-text')}`);
    if (node) node.textContent = text;
    const stepNode = sidebarEl && sidebarEl.querySelector(`.${klass('sb-loading-step')}`);
    if (stepNode && step) stepNode.textContent = `Step ${step} of ${totalSteps}`;
    if (stepNode && step) stepNode.style.setProperty('--sb-step-pct', `${Math.round((step / totalSteps) * 100)}%`);
  }

  function renderError(message, needsPageReload = false) {
    const sb = mount();
    sb.innerHTML = '';
    sb.appendChild(buildHeader({ title: 'Quote Generation', proposalId: null }));

    const actionBtn = el('button', {
      cls: klass('sb-btn', 'sb-btn--secondary'),
      text: needsPageReload ? '↺ Reload Gmail tab' : 'Try again',
      attrs: { type: 'button' }
    });
    if (needsPageReload) {
      actionBtn.addEventListener('click', () => window.location.reload());
    } else {
      actionBtn.addEventListener('click', () => { if (retryArgs) startGenerate(retryArgs); });
    }

    sb.appendChild(makeBody(
      el('div', { cls: klass('sb-error') }, [
        el('div', { cls: klass('sb-error-icon'), text: '⚠' }),
        el('p',   { cls: klass('sb-error-msg'),  text: message }),
        actionBtn
      ])
    ));
  }

  function renderLoaded() {
    if (!session) return;
    const { proposalId, quoteData, parsedSummary, from, subject } = session;
    const sb = mount();
    sb.innerHTML = '';

    sb.appendChild(buildHeader({ title: 'Quote Preview', proposalId }));

    // Sections are added to the body wrapper with staggered animation indices.
    const sections = [
      buildSummaryCard(parsedSummary, from, subject),
      buildScopeSection(quoteData),
      buildTimelineSection(quoteData),
      buildPricingSection(quoteData)
    ].filter(Boolean);

    sections.forEach((s, i) => s.style.setProperty('--sb-enter-i', i));
    sections.forEach(s => s.classList.add(klass('sb-section--enter')));

    sb.appendChild(makeBody(...sections));
    sb.appendChild(buildFooter(proposalId));

    // Trigger entrance animations on next paint.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        sections.forEach(s => s.classList.add(klass('sb-section--visible')))
      )
    );
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  function buildSkeleton(message, step, totalSteps) {
    const shimmer = (w, h = '12px') => {
      const d = el('div', { cls: klass('sb-shimmer') });
      d.style.width  = w;
      d.style.height = h;
      return d;
    };

    const stepEl = el('div', { cls: klass('sb-loading-step') });
    stepEl.textContent = step ? `Step ${step} of ${totalSteps}` : `Step 1 of 3`;
    stepEl.style.setProperty('--sb-step-pct', step ? `${Math.round((step / totalSteps) * 100)}%` : '10%');

    return el('div', { cls: klass('sb-skeleton') }, [
      el('div', { cls: klass('sb-status-box') }, [
        el('span', { cls: klass('sb-status-dot') }),
        el('p', { cls: klass('sb-loading-text'), text: message || 'Analysing request…' }),
      ]),
      stepEl,
      el('div', { cls: klass('sb-skeleton-card') }, [shimmer('60%'), shimmer('80%', '10px'), shimmer('45%', '10px')]),
      el('div', { cls: klass('sb-skeleton-card') }, [shimmer('40%'), shimmer('100%', '52px')]),
      el('div', { cls: klass('sb-skeleton-card') }, [
        shimmer('35%'),
        shimmer('100%', '10px'), shimmer('100%', '10px'), shimmer('80%', '10px')
      ])
    ]);
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  function buildHeader({ title, proposalId }) {
    const closeBtn = el('button', {
      cls: klass('sb-close'),
      attrs: { type: 'button', 'aria-label': 'Close sidebar (Esc)', title: 'Close (Esc)' }
    });
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', closeSidebar);

    const themeBtn = el('button', {
      cls:   klass('sb-theme-btn'),
      attrs: { type: 'button', title: 'Toggle theme', [`data-${CFG.CSS_PREFIX}mark`]: 'theme-btn' },
      text:  sidebarTheme === 'dark' ? '☀' : '🌙'
    });
    themeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebarTheme = sidebarTheme === 'light' ? 'dark' : 'light';
      applyTheme();
      try { chrome.storage.local.set({ biotechos_theme: sidebarTheme }); } catch {}
    });

    const children = [
      closeBtn,
      el('h2', { cls: klass('sb-title'), text: title })
    ];

    if (proposalId) {
      const regenBtn = el('button', {
        cls: klass('sb-btn', 'sb-btn--ghost'),
        text: '↺ Regenerate',
        attrs: { type: 'button', title: 'Ask AI for a new scope paragraph' }
      });
      regenBtn.addEventListener('click', () => handleRegen(proposalId, regenBtn));
      children.push(regenBtn);
    }

    children.push(themeBtn);

    return el('div', { cls: klass('sb-header') }, children);
  }

  // ── Summary card ───────────────────────────────────────────────────────────
  function buildSummaryCard(parsed, from, subject) {
    const chips  = [];
    if (parsed?.study_type)     chips.push(parsed.study_type);
    if (parsed?.species)        chips.push(parsed.species);
    if (parsed?.timeline_weeks) chips.push(`${parsed.timeline_weeks}w`);
    if ((parsed?.special_requirements || []).some(r => /glp/i.test(r))) chips.push('GLP');
    if (parsed?.request_type === 'formal_rfp')       chips.push('Formal RFP');
    if (parsed?.request_type === 'informal_request') chips.push('Informal request');

    const warnings = parsed?.missing_critical_info || [];
    const assays   = parsed?.assay_types || [];

    return el('div', { cls: klass('sb-card', 'sb-card--summary') }, [
      el('div', { cls: klass('sb-from'),    text: from || 'Unknown sender' }),
      subject ? el('div', { cls: klass('sb-subject'), text: subject }) : null,
      assays.length  ? el('div', { cls: klass('sb-assays'), text: assays.join(' · ') }) : null,
      chips.length   ? el('div', { cls: klass('sb-chips') },
          chips.map(c => el('span', { cls: klass('sb-chip'), text: c }))) : null,
      warnings.length ? el('div', { cls: klass('sb-warnings') },
          warnings.map(w => el('p', { cls: klass('sb-warning'), text: '⚠ ' + w }))) : null
    ].filter(Boolean));
  }

  // ── Scope section ──────────────────────────────────────────────────────────
  function buildScopeSection(quoteData) {
    const ta = el('textarea', {
      cls: klass('sb-textarea'),
      attrs: { rows: '6', placeholder: 'AI-generated scope will appear here…', 'aria-label': 'Scope of work' }
    });
    ta.value = quoteData.scope || '';

    function autoResize() { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
    ta.addEventListener('input', () => { quoteData.scope = ta.value; autoResize(); });
    requestAnimationFrame(autoResize);

    return el('div', { cls: klass('sb-section') }, [
      el('h3', { cls: klass('sb-section-title'), text: 'Scope of Work' }),
      ta
    ]);
  }

  // ── Timeline section ───────────────────────────────────────────────────────
  function buildTimelineSection(quoteData) {
    const rows = quoteData.timeline && quoteData.timeline.length
      ? quoteData.timeline
      : [
          { label: 'Study start',     description: '', date: '' },
          { label: 'Key milestone',   description: '', date: '' },
          { label: 'Report delivery', description: '', date: '' }
        ];
    quoteData.timeline = rows;

    const rowEls = rows.map((row, i) => {
      const descIn = el('input', {
        cls: klass('sb-input', 'sb-input--flex'),
        attrs: { type: 'text', placeholder: row.label, value: row.description || '', 'aria-label': row.label + ' description' }
      });
      const dateIn = el('input', {
        cls: klass('sb-input', 'sb-input--date'),
        attrs: { type: 'date', value: row.date || '', 'aria-label': row.label + ' date' }
      });
      descIn.addEventListener('input', () => { rows[i].description = descIn.value; });
      dateIn.addEventListener('input', () => { rows[i].date        = dateIn.value; });

      return el('div', { cls: klass('sb-tl-row') }, [
        el('span', { cls: klass('sb-tl-label'), text: row.label }),
        descIn, dateIn
      ]);
    });

    return el('div', { cls: klass('sb-section') }, [
      el('h3', { cls: klass('sb-section-title'), text: 'Timeline' }),
      el('div', { cls: klass('sb-timeline') }, rowEls)
    ]);
  }

  // ── Pricing section ────────────────────────────────────────────────────────
  function buildPricingSection(quoteData) {
    if (!quoteData.investment || !quoteData.investment.length) {
      quoteData.investment = [{ item: '', qty: '', unit_price: '', total: '' }];
    }

    function parseAmt(s) { return parseFloat((s || '').replace(/[$,]/g, '')); }
    function fmtAmt(n)    { return isFinite(n) && n > 0 ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : ''; }

    function calcTotal(qty, price) {
      const q = parseFloat((qty || '').replace(/,/g, ''));
      const p = parseAmt(price);
      return isFinite(q) && isFinite(p) && q > 0 && p > 0 ? fmtAmt(q * p) : '';
    }

    // Grand total row — sums all non-empty total cells.
    let grandTotalEl = null;

    function refreshGrandTotal() {
      if (!grandTotalEl) return;
      const sum = (quoteData.investment || []).reduce((acc, r) => {
        const v = parseAmt(r.total);
        return acc + (isFinite(v) ? v : 0);
      }, 0);
      grandTotalEl.textContent = sum > 0 ? fmtAmt(sum) : '—';
    }

    const tableEl = el('div', { cls: klass('sb-pricing-table') });

    tableEl.appendChild(el('div', { cls: klass('sb-pricing-head') }, [
      el('span', { text: 'Item / Assay' }),
      el('span', { text: 'Qty' }),
      el('span', { text: 'Unit $' }),
      el('span', { text: 'Total' }),
      el('span')
    ]));

    function buildRow(rowData, index) {
      const itemIn  = el('input', { cls: klass('sb-input'),                  attrs: { type: 'text', placeholder: 'Assay / service', value: rowData.item  || '', 'aria-label': 'Line item name' } });
      const qtyIn   = el('input', { cls: klass('sb-input', 'sb-input--narrow'), attrs: { type: 'text', placeholder: '—',  value: rowData.qty   || '', 'aria-label': 'Quantity' } });
      const priceIn = el('input', { cls: klass('sb-input', 'sb-input--narrow'), attrs: { type: 'text', placeholder: '$0', value: rowData.unit_price || '', 'aria-label': 'Unit price' } });
      const totalEl = el('span', { cls: klass('sb-pricing-total'), text: rowData.total || '' });
      const delBtn  = el('button', { cls: klass('sb-pricing-del'), attrs: { type: 'button', 'aria-label': 'Remove line' } });
      delBtn.innerHTML = '&times;';

      function sync() {
        const inv = quoteData.investment;
        if (!inv || index >= inv.length) return;
        inv[index].item       = itemIn.value;
        inv[index].qty        = qtyIn.value;
        inv[index].unit_price = priceIn.value;
        const t = calcTotal(qtyIn.value, priceIn.value);
        inv[index].total      = t;
        totalEl.textContent   = t;
        refreshGrandTotal();
      }
      itemIn.addEventListener('input',  sync);
      qtyIn.addEventListener('input',   sync);
      priceIn.addEventListener('input', sync);

      delBtn.addEventListener('click', () => {
        quoteData.investment.splice(index, 1);
        rowEl.remove();
        refreshGrandTotal();
      });

      const rowEl = el('div', { cls: klass('sb-pricing-row') }, [itemIn, qtyIn, priceIn, totalEl, delBtn]);
      return rowEl;
    }

    quoteData.investment.forEach((row, i) => tableEl.appendChild(buildRow(row, i)));

    const addBtn = el('button', {
      cls: klass('sb-btn', 'sb-btn--add'),
      text: '+ Add line item',
      attrs: { type: 'button' }
    });
    addBtn.addEventListener('click', () => {
      const newRow = { item: '', qty: '', unit_price: '', total: '' };
      quoteData.investment.push(newRow);
      tableEl.insertBefore(buildRow(newRow, quoteData.investment.length - 1), grandTotalRowEl);
    });

    // Grand total row
    grandTotalEl = el('span', { cls: klass('sb-pricing-total', 'sb-pricing-grand'), text: '—' });
    const grandTotalRowEl = el('div', { cls: klass('sb-pricing-row', 'sb-pricing-row--total') }, [
      el('span', { cls: klass('sb-pricing-grand-label'), text: 'Total' }),
      el('span'),
      el('span'),
      grandTotalEl,
      el('span')
    ]);

    tableEl.appendChild(addBtn);
    tableEl.appendChild(grandTotalRowEl);
    refreshGrandTotal();

    return el('div', { cls: klass('sb-section') }, [
      el('h3', { cls: klass('sb-section-title'), text: 'Investment' }),
      el('p',  { cls: klass('sb-section-hint'), text: 'Fill in your pricing — not AI-generated.' }),
      tableEl
    ]);
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  function buildFooter(proposalId) {
    const replyBtn = el('button', {
      cls: klass('sb-btn', 'sb-btn--primary'),
      text: 'Reply with Quote →',
      attrs: { type: 'button' }
    });
    replyBtn.addEventListener('click', () => handleReply(proposalId, replyBtn));
    return el('div', { cls: klass('sb-footer') }, [replyBtn]);
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleRegen(proposalId, btn) {
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const data = await apiCall('generateScope', { proposal_id: proposalId });
      if (data?.scope && session) {
        session.quoteData.scope = data.scope;
        const ta = sidebarEl && sidebarEl.querySelector(`.${klass('sb-textarea')}`);
        if (ta) { ta.value = data.scope; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
      }
    } catch (err) {
      console.warn('[biotechos] regen scope failed:', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '↺ Regenerate';
    }
  }

  async function handleReply(proposalId, btn) {
    if (!session) return;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await apiCall('saveQuote', { proposal_id: proposalId, quote_data: session.quoteData });
      btn.textContent = 'Opening reply…';
      document.dispatchEvent(new CustomEvent(`${CFG.CSS_PREFIX}reply-with-quote`, {
        bubbles: false,
        detail: {
          proposalId,
          quoteData:     session.quoteData,
          parsedSummary: session.parsedSummary,
          from:          session.from,
          subject:       session.subject
        }
      }));
      setTimeout(() => { btn.textContent = 'Reply with Quote →'; btn.disabled = false; }, 1500);
    } catch (err) {
      btn.textContent = err.message || 'Save failed — retry';
      btn.disabled = false;
    }
  }

  // ── Main generate flow ──────────────────────────────────────────────────────
  async function startGenerate(args) {
    const { btn, from, body, subject, authState: auth } = args;
    retryArgs = args;
    activeBtn = btn;
    phase     = 'loading';

    renderLoading('Analysing request…', 1, 3);

    try {
      const croProfileId = auth && auth.profile && auth.profile.id;
      if (!croProfileId) throw new Error('CRO profile not found. Complete your BiotechOS profile before generating quotes.');

      const rawText = `Subject: ${subject || '(no subject)'}\nFrom: ${from || ''}\n\n${body || ''}`;

      setLoadingText('Analysing request…', 1, 3);
      const parsed = await apiCall('analyzeIntake', { text: rawText });

      if (parsed?.request_type === 'not_a_request') {
        throw new Error("This email doesn't look like a study request. Open a quote request email and try again.");
      }

      setLoadingText('Creating proposal…', 2, 3);
      const created = await apiCall('createIntake', {
        cro_profile_id: croProfileId,
        raw_text:        rawText,
        parsed_summary:  parsed,
        biotech_name:    parsed?.biotech_name || null
      });

      const proposalId = created?.proposal_id;
      if (!proposalId) throw new Error('Failed to create proposal in BiotechOS.');

      setLoadingText('Writing scope with AI…', 3, 3);
      const scopeResult = await apiCall('generateScope', { proposal_id: proposalId });

      const assayTypes = Array.isArray(parsed?.assay_types) ? parsed.assay_types : [];
      const investment = assayTypes.length
        ? assayTypes.map(a => ({ item: a, qty: parsed?.sample_count || '', unit_price: '', total: '' }))
        : [{ item: '', qty: '', unit_price: '', total: '' }];

      session = {
        proposalId,
        parsedSummary: parsed,
        from, subject,
        quoteData: {
          mode: 'quick_quote',
          scope: scopeResult?.scope || '',
          timeline: [
            { label: 'Study start',     description: '', date: '' },
            { label: 'Key milestone',   description: '', date: '' },
            { label: 'Report delivery', description: '', date: '' }
          ],
          investment,
          next_steps: []
        }
      };

      phase = 'loaded';
      renderLoaded();

      if (activeBtn) {
        activeBtn.classList.remove(klass('quote-btn--loading'));
        activeBtn.disabled = false;
        activeBtn = null;
      }

    } catch (err) {
      phase = 'error';
      const msg = err?.message || '';
      const isStaleContext = /extension context invalidated|context invalidated/i.test(msg);
      renderError(
        isStaleContext
          ? 'The extension was reloaded. Please refresh this Gmail tab (press F5) and try again.'
          : msg || 'Something went wrong. Please try again.',
        isStaleContext
      );
      if (activeBtn) {
        activeBtn.classList.remove(klass('quote-btn--loading'));
        activeBtn.disabled = false;
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  root.BIOTECHOS_SIDEBAR = { startGenerate, closeSidebar };
})(typeof self !== 'undefined' ? self : globalThis);
