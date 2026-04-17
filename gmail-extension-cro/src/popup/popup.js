// Popup controller.
// Runs in the extension popup context — `chrome.*` APIs available,
// `document` is the popup window (not the page).
//
// Task 2 behaviour:
//   * On open, render from cached auth state immediately, then kick off a
//     fresh CHECK_AUTH in the background.
//   * Subscribe to AUTH_CHANGED messages from the service worker so the
//     popup reflects login/logout as soon as it happens in any tab.
//   * Sign in / sign out / open app / re-check are all stateless calls into
//     the service worker.

(function initPopup() {
  const CFG = self.BIOTECHOS_CONFIG;
  const KEYS = CFG.STORAGE_KEYS;
  const MSG = CFG.MESSAGES;
  // Note: the popup never talks to the backend directly — every API call is
  // proxied through the service worker. That keeps credentials + host
  // permissions in one place and simplifies error handling.

  const els = {
    welcomeCard: document.getElementById('welcomeCard'),
    btnDismissWelcome: document.getElementById('btnDismissWelcome'),
    statusDot: document.getElementById('statusDot'),
    statusTitle: document.getElementById('statusTitle'),
    statusSub: document.getElementById('statusSub'),

    profileCard: document.getElementById('profileCard'),
    profileAvatar: document.getElementById('profileAvatar'),
    profileCompany: document.getElementById('profileCompany'),
    profileEmail: document.getElementById('profileEmail'),

    ctxView: document.getElementById('ctxView'),
    ctxThread: document.getElementById('ctxThread'),
    ctxSubject: document.getElementById('ctxSubject'),

    btnRefreshGmail: document.getElementById('btnRefreshGmail'),
    btnRecheck: document.getElementById('btnRecheck'),
    btnLogin: document.getElementById('btnLogin'),
    btnOpenApp: document.getElementById('btnOpenApp'),
    btnSignOut: document.getElementById('btnSignOut'),

    apiBaseInput: document.getElementById('apiBaseInput'),
    btnSaveApiBase: document.getElementById('btnSaveApiBase'),
    saveHint: document.getElementById('saveHint')
  };

  // ── Rendering ────────────────────────────────────────────────────────────
  // A single pure function from auth state to DOM so we can re-render
  // whenever state arrives — whether from CHECK_AUTH, AUTH_CHANGED, or the
  // cached profile we load on open.
  function renderAuth(state) {
    // Default: hide every action button, show them based on state below.
    els.btnLogin.hidden = true;
    els.btnOpenApp.hidden = true;
    els.btnSignOut.hidden = true;

    if (!state) {
      setStatus('idle', 'Checking connection…', 'Contacting BiotechOS');
      renderProfile(null);
      return;
    }

    if (state.apiBase) {
      els.apiBaseInput.placeholder = state.apiBase;
    }

    if (state.ok && state.authenticated) {
      const email = state.profile?.userEmail;
      setStatus('ok', 'Connected to BiotechOS', email ? `Signed in as ${email}` : 'You are signed in');
      renderProfile(state.profile || null);
      els.btnOpenApp.hidden = false;
      els.btnSignOut.hidden = false;
      return;
    }

    if (state.ok && !state.authenticated) {
      setStatus('warn', 'Not signed in', 'Sign in at BiotechOS to generate quotes');
      renderProfile(null);
      els.btnLogin.hidden = false;
      return;
    }

    // Backend unreachable, bad URL, unexpected error.
    const detail = state.error
      ? state.error
      : state.status
        ? `HTTP ${state.status}`
        : 'Backend unreachable';
    setStatus('error', 'Cannot reach BiotechOS', detail);
    renderProfile(null);
    // Offer an escape hatch: still let the user open the app directly.
    els.btnOpenApp.hidden = false;
  }

  function setStatus(state, title, sub) {
    els.statusDot.dataset.state = state;
    els.statusTitle.textContent = title;
    els.statusSub.textContent = sub || '';
  }

  function renderProfile(profile) {
    if (!profile) {
      els.profileCard.hidden = true;
      els.profileAvatar.style.backgroundImage = '';
      return;
    }
    els.profileCard.hidden = false;
    els.profileCompany.textContent = profile.companyName || 'CRO account';
    els.profileEmail.textContent = profile.userEmail || '';

    if (profile.logoUrl) {
      // url() content must be safe from " quotes — the backend never stores
      // control characters here, but we still encode defensively.
      const safe = String(profile.logoUrl).replace(/"/g, '%22');
      els.profileAvatar.style.backgroundImage = `url("${safe}")`;
      els.profileAvatar.style.backgroundColor = 'transparent';
    } else {
      els.profileAvatar.style.backgroundImage = '';
      els.profileAvatar.style.backgroundColor = '';
    }
  }

  // ── Gmail context panel ─────────────────────────────────────────────────
  let _gmailTabId = null;

  // When the extension is reloaded during development, the old content scripts
  // in existing Gmail tabs become orphaned (chrome APIs throw "context
  // invalidated"). We can silently re-inject them via chrome.scripting rather
  // than forcing the user to reload the tab.
  async function tryAutoReinject(tabId) {
    try {
      // Clear the boot guard so content.js doesn't skip re-initialisation.
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => { delete window.__BIOTECHOS_CONTENT_BOOTED__; }
      });
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['src/content/content.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          'src/common/config.js',
          'src/common/dom-utils.js',
          'src/content/email-detector.js',
          'src/content/gmail-observer.js',
          'src/content/quote-button.js',
          'src/content/sidebar.js',
          'src/content/compose.js',
          'src/content/content.js'
        ]
      });
      return true;
    } catch {
      return false;
    }
  }

  async function refreshGmailContext() {
    els.ctxView.textContent = '—';
    els.ctxThread.textContent = '—';
    els.ctxSubject.textContent = '—';
    els.btnRefreshGmail.hidden = true;
    _gmailTabId = null;

    let tab;
    try {
      const active = await chrome.tabs.query({ url: 'https://mail.google.com/*', active: true, currentWindow: true });
      tab = active[0];
    } catch { /* ignore */ }

    if (!tab) {
      try {
        const anyTab = await chrome.tabs.query({ url: 'https://mail.google.com/*' });
        tab = anyTab[0];
      } catch { /* ignore */ }
    }

    if (!tab) {
      els.ctxView.textContent = 'Open Gmail to use';
      return;
    }

    _gmailTabId = tab.id;

    // Prefer a direct PING to the content script (fresh data); fall back to
    // the service worker's cached GMAIL_STATE_CHANGED payload if the content
    // script hasn't responded (e.g. after extension reload, context is stale).
    let state = null;
    try {
      const pong = await chrome.tabs.sendMessage(tab.id, { type: MSG.PING });
      if (pong && pong.state) state = pong.state;
    } catch { /* content script not ready or stale */ }

    if (!state) {
      try {
        const bg = await chrome.runtime.sendMessage({ type: MSG.PING });
        state = bg?.lastGmailState || null;
      } catch { /* ignore */ }
    }

    if (!state) {
      // Both pings failed — content scripts are likely orphaned after extension
      // reload. Try silently re-injecting them before falling back to a manual
      // refresh prompt.
      els.ctxView.textContent = 'reconnecting…';
      const reinjected = await tryAutoReinject(tab.id);
      if (reinjected) {
        await new Promise(r => setTimeout(r, 800));
        try {
          const pong = await chrome.tabs.sendMessage(tab.id, { type: MSG.PING });
          if (pong && pong.state) state = pong.state;
        } catch { /* still not ready */ }
      }
    }

    if (!state) {
      // Auto-reinject also failed — tab may need a full reload.
      els.ctxView.textContent = 'needs refresh';
      els.btnRefreshGmail.hidden = false;
      return;
    }

    els.ctxView.textContent = state.view || '—';
    els.ctxThread.textContent = state.threadId ? state.threadId.slice(0, 10) + '…' : '—';
    els.ctxSubject.textContent = state.subject || '—';
    els.ctxSubject.title = state.subject || '';
  }

  // Reload the Gmail tab so fresh content scripts are injected, then
  // re-poll the context after a short delay for the tab to finish loading.
  els.btnRefreshGmail.addEventListener('click', async () => {
    if (!_gmailTabId) return;
    els.btnRefreshGmail.textContent = 'Refreshing…';
    els.btnRefreshGmail.disabled = true;
    try {
      await chrome.tabs.reload(_gmailTabId);
      // Wait for the tab to finish loading before polling context.
      setTimeout(() => {
        els.btnRefreshGmail.textContent = '↺ Refresh Gmail tab';
        els.btnRefreshGmail.disabled = false;
        refreshGmailContext();
        setTimeout(refreshGmailContext, 1500);
      }, 2500);
    } catch {
      els.btnRefreshGmail.textContent = '↺ Refresh Gmail tab';
      els.btnRefreshGmail.disabled = false;
    }
  });

  // ── Initial state: cached profile first, then a live check ──────────────
  async function boot() {
    // Render cached data immediately so the popup never flashes a "loading"
    // state for returning users.
    const cached = await chrome.storage.sync.get([KEYS.USER, KEYS.API_BASE, KEYS.LAST_HEALTH_OK]);
    if (cached[KEYS.USER]) {
      renderAuth({
        ok: cached[KEYS.LAST_HEALTH_OK] !== false,
        authenticated: true,
        apiBase: cached[KEYS.API_BASE],
        profile: cached[KEYS.USER]
      });
    }

    await loadApiBase();
    await runAuthCheck();
    refreshGmailContext();
    setTimeout(refreshGmailContext, 400); // covers first-open race with content script boot
  }

  async function runAuthCheck() {
    try {
      const state = await chrome.runtime.sendMessage({ type: MSG.CHECK_AUTH });
      renderAuth(state);
    } catch (err) {
      renderAuth({
        ok: false,
        authenticated: false,
        error: err?.message || 'Background worker unavailable'
      });
    }
  }

  // Live updates: the service worker broadcasts AUTH_CHANGED on cookie
  // changes, sign-outs, and post-login checks. The popup only needs to
  // re-render — no polling loop.
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type === MSG.AUTH_CHANGED) renderAuth(msg.payload);
    return false;
  });

  // ── API base override ────────────────────────────────────────────────────
  async function loadApiBase() {
    const got = await chrome.storage.sync.get(KEYS.API_BASE);
    els.apiBaseInput.value = got[KEYS.API_BASE] || '';
    els.apiBaseInput.placeholder = got[KEYS.API_BASE] || CFG.DEFAULT_API_BASE;
  }

  async function saveApiBase() {
    const raw = (els.apiBaseInput.value || '').trim();
    if (!raw) {
      await chrome.storage.sync.remove(KEYS.API_BASE);
      els.saveHint.textContent = `Reset to default (${CFG.DEFAULT_API_BASE})`;
      els.saveHint.dataset.state = 'ok';
    } else {
      let url;
      try { url = new URL(raw); } catch {
        els.saveHint.textContent = 'Enter a valid URL (including https://)';
        els.saveHint.dataset.state = 'error';
        return;
      }
      await chrome.storage.sync.set({ [KEYS.API_BASE]: url.origin });
      els.saveHint.textContent = `Saved: ${url.origin}`;
      els.saveHint.dataset.state = 'ok';
    }
    await loadApiBase();
    await runAuthCheck();
  }

  // ── Button handlers ──────────────────────────────────────────────────────
  els.btnRecheck.addEventListener('click', () => {
    setStatus('idle', 'Re-checking…', 'Contacting BiotechOS');
    runAuthCheck();
  });

  els.btnLogin.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: MSG.OPEN_LOGIN });
    window.close();
  });

  els.btnOpenApp.addEventListener('click', async () => {
    const { [KEYS.API_BASE]: base } = await chrome.storage.sync.get(KEYS.API_BASE);
    const target = (base || CFG.DEFAULT_API_BASE).replace(/\/$/, '') + '/dashboard';
    chrome.tabs.create({ url: target });
    window.close();
  });

  els.btnSignOut.addEventListener('click', async () => {
    els.btnSignOut.disabled = true;
    setStatus('idle', 'Signing out…', '');
    try {
      const res = await chrome.runtime.sendMessage({ type: MSG.SIGN_OUT });
      if (res && res.state) {
        renderAuth(res.state);
      } else {
        await runAuthCheck();
      }
    } finally {
      els.btnSignOut.disabled = false;
    }
  });

  els.btnSaveApiBase.addEventListener('click', saveApiBase);
  els.apiBaseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveApiBase();
  });

  // ── First-run onboarding ─────────────────────────────────────────────────
  async function checkFirstRun() {
    const { 'biotechos.onboarded': onboarded } = await chrome.storage.local.get('biotechos.onboarded');
    if (!onboarded) {
      els.welcomeCard.hidden = false;
    }
  }

  els.btnDismissWelcome.addEventListener('click', async () => {
    await chrome.storage.local.set({ 'biotechos.onboarded': true });
    els.welcomeCard.hidden = true;
  });

  // ── Boot ─────────────────────────────────────────────────────────────────
  // Everything inside boot() tolerates a cold service worker — chrome will
  // spin one up in response to the first sendMessage.
  checkFirstRun();
  boot();
})();
