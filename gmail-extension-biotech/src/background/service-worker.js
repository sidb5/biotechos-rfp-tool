// BiotechOS Outreach Assistant — MV3 background service worker.
// Identical architecture to the CRO extension: auth via Supabase cookies,
// API proxy for content scripts, broadcast AUTH_CHANGED on session changes.

importScripts('../common/config.js', '../common/api.js');

const CFG  = self.BIOTECHOS_CONFIG;
const API  = self.BIOTECHOS_API;
const KEYS = CFG.STORAGE_KEYS;
const MSG  = CFG.MESSAGES;

let lastGmailState    = null;
let lastAuthState     = null;
let cookieDebounceTimer = null;

async function getApiBase() { return API.getApiBase(); }

async function setHealth(ok) {
  await chrome.storage.sync.set({
    [KEYS.LAST_HEALTH_OK]: !!ok,
    [KEYS.LAST_HEALTH_AT]: Date.now()
  });
}

function summarizeProfile(raw) {
  const p = raw && raw.profile ? raw.profile : raw;
  if (!p || typeof p !== 'object') return null;
  return {
    id:          p.id || null,
    companyName: p.company_name || p.companyName || null,
    logoUrl:     p.logo_url     || p.logoUrl     || null,
    userEmail:   p.user_email   || p.email        || null
  };
}

async function runAuthCheck({ silent = false } = {}) {
  const apiBase = await getApiBase();
  let next;
  try {
    const data    = await API.getProfile();
    const profile = summarizeProfile(data);
    await setHealth(true);
    await chrome.storage.sync.set({ [KEYS.USER]: profile || null, [KEYS.LAST_AUTH_AT]: Date.now() });
    next = { ok: true, authenticated: true, apiBase, profile };
  } catch (err) {
    if (err?.name === 'AuthError') {
      await setHealth(true);
      await chrome.storage.sync.remove(KEYS.USER);
      next = { ok: true, authenticated: false, apiBase };
    } else if (err?.name === 'NetworkError') {
      await setHealth(false);
      next = { ok: false, authenticated: false, apiBase, error: err.message || 'Network error', code: 'network' };
    } else {
      await setHealth(false);
      next = { ok: false, authenticated: false, apiBase, error: err?.message || 'Unknown error', status: err?.status, code: err?.code };
    }
  }
  lastAuthState = next;
  if (!silent) await broadcastAuth(next);
  return next;
}

async function broadcastAuth(state) {
  try { await chrome.runtime.sendMessage({ type: MSG.AUTH_CHANGED, payload: state }); } catch { /* popup closed */ }
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' }); } catch { /* ignore */ }
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: MSG.AUTH_CHANGED, payload: state }).catch(() => {});
  }
}

chrome.cookies.onChanged.addListener(async (change) => {
  if (!change?.cookie) return;
  if (!change.cookie.name.startsWith(CFG.SUPABASE_COOKIE_PREFIX)) return;
  let host;
  try { host = new URL(await getApiBase()).hostname; } catch { return; }
  const cookieDomain = (change.cookie.domain || '').replace(/^\./, '');
  if (cookieDomain !== host && !host.endsWith(cookieDomain)) return;
  if (cookieDebounceTimer) clearTimeout(cookieDebounceTimer);
  cookieDebounceTimer = setTimeout(() => {
    cookieDebounceTimer = null;
    runAuthCheck().catch(err => console.warn('[biotechos] auth recheck failed', err));
  }, 400);
});

async function signOut() {
  const apiBase = await getApiBase();
  let origin;
  try { origin = new URL(apiBase).origin; } catch { return { ok: false, error: 'invalid API base' }; }
  let cookies = [];
  try { cookies = await chrome.cookies.getAll({ url: origin }); } catch (err) { return { ok: false, error: err?.message }; }
  const removed = [];
  for (const c of cookies) {
    if (!c.name.startsWith(CFG.SUPABASE_COOKIE_PREFIX)) continue;
    const scheme    = c.secure ? 'https' : 'http';
    const domain    = c.domain.replace(/^\./, '');
    const removeUrl = `${scheme}://${domain}${c.path || '/'}`;
    try { await chrome.cookies.remove({ url: removeUrl, name: c.name }); removed.push(c.name); }
    catch (err) { console.warn('[biotechos] failed to remove cookie', c.name, err); }
  }
  const state = await runAuthCheck();
  return { ok: true, removed, state };
}

async function handleApiCall(payload) {
  const method = payload?.method;
  const args   = payload?.args || {};
  if (!method || typeof API[method] !== 'function') {
    return { ok: false, error: `Unknown API method: ${method}`, code: 'bad_method' };
  }
  try {
    const data = await API[method](args);
    return { ok: true, data };
  } catch (err) {
    if (err?.name === 'AuthError') runAuthCheck().catch(() => {});
    return {
      ok: false,
      error:        err?.message || 'Request failed',
      status:       err?.status,
      code:         err?.code,
      authError:    !!(err?.name === 'AuthError'),
      networkError: !!(err?.name === 'NetworkError')
    };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;
  switch (msg.type) {
    case MSG.PING:
      sendResponse({ ok: true, ts: Date.now(), lastGmailState, lastAuthState });
      return false;
    case MSG.GMAIL_STATE_CHANGED:
      lastGmailState = { ...msg.payload, receivedAt: Date.now(), tabId: sender.tab?.id };
      sendResponse({ ok: true });
      return false;
    case MSG.CHECK_AUTH:
      runAuthCheck().then(sendResponse);
      return true;
    case MSG.SIGN_OUT:
      signOut().then(sendResponse);
      return true;
    case MSG.API_CALL:
      handleApiCall(msg.payload).then(sendResponse);
      return true;
    case MSG.OPEN_LOGIN:
      getApiBase().then((apiBase) => {
        const loginUrl = apiBase.replace(/\/$/, '') + '/login';
        chrome.tabs.create({ url: loginUrl }).then((tab) => {
          sendResponse({ ok: true, tabId: tab.id });
        }).catch((err) => sendResponse({ ok: false, error: err?.message }));
      });
      return true;
    default:
      return false;
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  const existing = await chrome.storage.sync.get(KEYS.API_BASE);
  if (!existing[KEYS.API_BASE]) {
    await chrome.storage.sync.set({ [KEYS.API_BASE]: CFG.DEFAULT_API_BASE });
  }
  runAuthCheck().catch(() => {});
  console.info('[biotechos] installed', details.reason);
});

chrome.runtime.onStartup.addListener(() => { runAuthCheck().catch(() => {}); });
runAuthCheck().catch(() => {});
console.info('[biotechos] outreach service worker loaded');
