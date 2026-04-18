// Popup controller — identical pattern to CRO extension, adapted for biotech.

(function initPopup() {
  const CFG  = self.BIOTECHOS_CONFIG;
  const KEYS = CFG.STORAGE_KEYS;
  const MSG  = CFG.MESSAGES;

  const els = {
    welcomeCard:      document.getElementById('welcomeCard'),
    btnDismissWelcome:document.getElementById('btnDismissWelcome'),
    statusDot:        document.getElementById('statusDot'),
    statusTitle:      document.getElementById('statusTitle'),
    statusSub:        document.getElementById('statusSub'),
    profileCard:      document.getElementById('profileCard'),
    profileAvatar:    document.getElementById('profileAvatar'),
    profileCompany:   document.getElementById('profileCompany'),
    profileEmail:     document.getElementById('profileEmail'),
    ctxView:          document.getElementById('ctxView'),
    ctxThread:        document.getElementById('ctxThread'),
    ctxSubject:       document.getElementById('ctxSubject'),
    btnRefreshGmail:  document.getElementById('btnRefreshGmail'),
    btnRecheck:       document.getElementById('btnRecheck'),
    btnLogin:         document.getElementById('btnLogin'),
    btnOpenApp:       document.getElementById('btnOpenApp'),
    btnSignOut:       document.getElementById('btnSignOut'),
    apiBaseInput:     document.getElementById('apiBaseInput'),
    btnSaveApiBase:   document.getElementById('btnSaveApiBase'),
    saveHint:         document.getElementById('saveHint')
  };

  function renderAuth(state) {
    els.btnLogin.hidden = true;
    els.btnOpenApp.hidden = true;
    els.btnSignOut.hidden = true;

    if (!state) { setStatus('idle', 'Checking connection…', 'Contacting BiotechOS'); renderProfile(null); return; }
    if (state.apiBase) els.apiBaseInput.placeholder = state.apiBase;

    if (state.ok && state.authenticated) {
      const email = state.profile?.userEmail;
      setStatus('ok', 'Connected to BiotechOS', email ? `Signed in as ${email}` : 'You are signed in');
      renderProfile(state.profile || null);
      els.btnOpenApp.hidden = false;
      els.btnSignOut.hidden = false;
      return;
    }
    if (state.ok && !state.authenticated) {
      setStatus('warn', 'Not signed in', 'Sign in at BiotechOS to use this extension');
      renderProfile(null);
      els.btnLogin.hidden = false;
      return;
    }
    const detail = state.error ? state.error : state.status ? `HTTP ${state.status}` : 'Backend unreachable';
    setStatus('error', 'Cannot reach BiotechOS', detail);
    renderProfile(null);
    els.btnOpenApp.hidden = false;
  }

  function setStatus(state, title, sub) {
    els.statusDot.dataset.state = state;
    els.statusTitle.textContent = title;
    els.statusSub.textContent   = sub || '';
  }

  function renderProfile(profile) {
    if (!profile) { els.profileCard.hidden = true; return; }
    els.profileCard.hidden  = false;
    els.profileCompany.textContent = profile.companyName || 'Biotech account';
    els.profileEmail.textContent   = profile.userEmail  || '';
    if (profile.logoUrl) {
      const safe = String(profile.logoUrl).replace(/"/g, '%22');
      els.profileAvatar.style.backgroundImage = `url("${safe}")`;
      els.profileAvatar.style.backgroundColor = 'transparent';
    } else {
      els.profileAvatar.style.backgroundImage = '';
      els.profileAvatar.style.backgroundColor = '';
    }
  }

  let _gmailTabId = null;

  async function tryAutoReinject(tabId) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: () => { delete window.__BIOTECHOS_BIOTECH_BOOTED__; } });
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['src/content/content.css'] });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/common/config.js','src/common/dom-utils.js','src/content/gmail-observer.js','src/content/compose-detector.js','src/content/outreach-panel.js','src/content/reply-button.js','src/content/reply-panel.js','src/content/content.js']
      });
      return true;
    } catch { return false; }
  }

  async function refreshGmailContext() {
    els.ctxView.textContent = '—'; els.ctxThread.textContent = '—'; els.ctxSubject.textContent = '—';
    els.btnRefreshGmail.hidden = true; _gmailTabId = null;

    let tab;
    try { [tab] = await chrome.tabs.query({ url: 'https://mail.google.com/*', active: true, currentWindow: true }); } catch { /* ignore */ }
    if (!tab) { try { [tab] = await chrome.tabs.query({ url: 'https://mail.google.com/*' }); } catch { /* ignore */ } }
    if (!tab) { els.ctxView.textContent = 'Open Gmail to use'; return; }
    _gmailTabId = tab.id;

    let state = null;
    try { const pong = await chrome.tabs.sendMessage(tab.id, { type: MSG.PING }); if (pong?.state) state = pong.state; } catch { /* ignore */ }
    if (!state) { try { const bg = await chrome.runtime.sendMessage({ type: MSG.PING }); state = bg?.lastGmailState || null; } catch { /* ignore */ } }
    if (!state) {
      els.ctxView.textContent = 'reconnecting…';
      const reinjected = await tryAutoReinject(tab.id);
      if (reinjected) {
        await new Promise(r => setTimeout(r, 800));
        try { const pong = await chrome.tabs.sendMessage(tab.id, { type: MSG.PING }); if (pong?.state) state = pong.state; } catch { /* ignore */ }
      }
    }
    if (!state) { els.ctxView.textContent = 'needs refresh'; els.btnRefreshGmail.hidden = false; return; }

    els.ctxView.textContent    = state.view    || '—';
    els.ctxThread.textContent  = state.threadId ? state.threadId.slice(0, 10) + '…' : '—';
    els.ctxSubject.textContent = state.subject  || '—';
    els.ctxSubject.title       = state.subject  || '';
  }

  els.btnRefreshGmail.addEventListener('click', async () => {
    if (!_gmailTabId) return;
    els.btnRefreshGmail.textContent = 'Refreshing…';
    els.btnRefreshGmail.disabled    = true;
    try {
      await chrome.tabs.reload(_gmailTabId);
      setTimeout(() => { els.btnRefreshGmail.textContent = '↺ Refresh Gmail tab'; els.btnRefreshGmail.disabled = false; refreshGmailContext(); setTimeout(refreshGmailContext, 1500); }, 2500);
    } catch { els.btnRefreshGmail.textContent = '↺ Refresh Gmail tab'; els.btnRefreshGmail.disabled = false; }
  });

  async function boot() {
    const cached = await chrome.storage.sync.get([KEYS.USER, KEYS.API_BASE, KEYS.LAST_HEALTH_OK]);
    if (cached[KEYS.USER]) renderAuth({ ok: cached[KEYS.LAST_HEALTH_OK] !== false, authenticated: true, apiBase: cached[KEYS.API_BASE], profile: cached[KEYS.USER] });
    await loadApiBase();
    await runAuthCheck();
    refreshGmailContext();
    setTimeout(refreshGmailContext, 400);
  }

  async function runAuthCheck() {
    try { renderAuth(await chrome.runtime.sendMessage({ type: MSG.CHECK_AUTH })); }
    catch (err) { renderAuth({ ok: false, authenticated: false, error: err?.message || 'Background worker unavailable' }); }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type === MSG.AUTH_CHANGED) renderAuth(msg.payload);
    return false;
  });

  async function loadApiBase() {
    const got = await chrome.storage.sync.get(KEYS.API_BASE);
    els.apiBaseInput.value       = got[KEYS.API_BASE] || '';
    els.apiBaseInput.placeholder = got[KEYS.API_BASE] || CFG.DEFAULT_API_BASE;
  }

  async function saveApiBase() {
    const raw = (els.apiBaseInput.value || '').trim();
    if (!raw) {
      await chrome.storage.sync.remove(KEYS.API_BASE);
      els.saveHint.textContent = `Reset to default (${CFG.DEFAULT_API_BASE})`; els.saveHint.dataset.state = 'ok';
    } else {
      let url; try { url = new URL(raw); } catch { els.saveHint.textContent = 'Enter a valid URL (including https://)'; els.saveHint.dataset.state = 'error'; return; }
      await chrome.storage.sync.set({ [KEYS.API_BASE]: url.origin });
      els.saveHint.textContent = `Saved: ${url.origin}`; els.saveHint.dataset.state = 'ok';
    }
    await loadApiBase(); await runAuthCheck();
  }

  els.btnRecheck.addEventListener('click', () => { setStatus('idle', 'Re-checking…', ''); runAuthCheck(); });
  els.btnLogin.addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: MSG.OPEN_LOGIN }); window.close(); });
  els.btnOpenApp.addEventListener('click', async () => {
    const { [KEYS.API_BASE]: base } = await chrome.storage.sync.get(KEYS.API_BASE);
    chrome.tabs.create({ url: (base || CFG.DEFAULT_API_BASE).replace(/\/$/, '') + '/biotech/dashboard' });
    window.close();
  });
  els.btnSignOut.addEventListener('click', async () => {
    els.btnSignOut.disabled = true; setStatus('idle', 'Signing out…', '');
    try { const res = await chrome.runtime.sendMessage({ type: MSG.SIGN_OUT }); if (res?.state) renderAuth(res.state); else await runAuthCheck(); }
    finally { els.btnSignOut.disabled = false; }
  });
  els.btnSaveApiBase.addEventListener('click', saveApiBase);
  els.apiBaseInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveApiBase(); });

  async function checkFirstRun() {
    const { 'biotechos.biotech.onboarded': onboarded } = await chrome.storage.local.get('biotechos.biotech.onboarded');
    if (!onboarded) els.welcomeCard.hidden = false;
  }
  els.btnDismissWelcome.addEventListener('click', async () => {
    await chrome.storage.local.set({ 'biotechos.biotech.onboarded': true });
    els.welcomeCard.hidden = true;
  });

  checkFirstRun();
  boot();
})();
