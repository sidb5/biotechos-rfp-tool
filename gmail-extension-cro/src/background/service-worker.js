// BiotechOS Quote Assistant — MV3 background service worker.
//
// Task 2 responsibilities:
//   * Own the authenticated session state and broadcast AUTH_CHANGED to the
//     popup and every Gmail tab.
//   * Watch Supabase cookies on the configured backend origin so logging in
//     or out of BiotechOS in any browser tab reflects in the extension
//     within a second — no manual "re-check" needed.
//   * Proxy API_CALL messages on behalf of content scripts so Gmail's
//     page-level CORS policy doesn't block us.
//   * Handle sign-out by clearing the Supabase auth cookies locally (same
//     effect as signing out via the web app).
//
// Service workers in MV3 die on idle. Everything durable is persisted via
// chrome.storage.sync; everything in-memory (like `lastGmailState`) is
// treated as a best-effort cache that callers must be able to rebuild.

importScripts('../common/config.js', '../common/api.js');

const CFG = self.BIOTECHOS_CONFIG;
const API = self.BIOTECHOS_API;
const KEYS = CFG.STORAGE_KEYS;
const MSG = CFG.MESSAGES;

let lastGmailState = null;
let lastAuthState = null;        // shape: { ok, authenticated, profile?, error?, status? }
let cookieDebounceTimer = null;   // Supabase fires 2-3 cookie writes per login

// ── Storage helpers ────────────────────────────────────────────────────────
async function getApiBase() {
  return API.getApiBase();
}

async function setHealth(ok) {
  await chrome.storage.sync.set({
    [KEYS.LAST_HEALTH_OK]: !!ok,
    [KEYS.LAST_HEALTH_AT]: Date.now()
  });
}

// The only fields we ever cache from the profile payload. Keeps us from
// accidentally persisting anything sensitive into chrome.storage.sync, which
// is mirrored across the user's Chrome profiles.
function summarizeProfile(raw) {
  const p = raw && raw.profile ? raw.profile : raw;
  if (!p || typeof p !== 'object') return null;
  return {
    id: p.id || null,
    companyName: p.company_name || p.companyName || null,
    logoUrl: p.logo_url || p.logoUrl || null,
    userEmail: p.user_email || p.email || null
  };
}

// ── Auth state ─────────────────────────────────────────────────────────────
// Runs the canonical health/auth check. Updates in-memory state, persists to
// storage, and broadcasts AUTH_CHANGED. All auth mutations flow through here.
async function runAuthCheck({ silent = false } = {}) {
  const apiBase = await getApiBase();

  let next;
  try {
    const data = await API.getProfile();
    const profile = summarizeProfile(data);
    await setHealth(true);
    await chrome.storage.sync.set({
      [KEYS.USER]: profile || null,
      [KEYS.LAST_AUTH_AT]: Date.now()
    });
    next = { ok: true, authenticated: true, apiBase, profile };
  } catch (err) {
    if (err && err.name === 'AuthError') {
      await setHealth(true);
      await chrome.storage.sync.remove(KEYS.USER);
      next = { ok: true, authenticated: false, apiBase };
    } else if (err && err.name === 'NetworkError') {
      await setHealth(false);
      next = {
        ok: false,
        authenticated: false,
        apiBase,
        error: err.message || 'Network error',
        code: 'network'
      };
    } else {
      await setHealth(false);
      next = {
        ok: false,
        authenticated: false,
        apiBase,
        error: (err && err.message) || 'Unknown error',
        status: err && err.status,
        code: err && err.code
      };
    }
  }

  lastAuthState = next;
  if (!silent) await broadcastAuth(next);
  return next;
}

// Notify the popup (if open) and every Gmail tab.
async function broadcastAuth(state) {
  // Popup / other extension views.
  try { await chrome.runtime.sendMessage({ type: MSG.AUTH_CHANGED, payload: state }); }
  catch { /* nothing listening — expected when the popup is closed */ }

  // Gmail tabs. We intentionally don't `await` each send so one dead tab
  // can't hold up the rest.
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' }); }
  catch { /* ignore */ }
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: MSG.AUTH_CHANGED, payload: state })
      .catch(() => { /* content script not loaded yet — that's fine */ });
  }
}

// ── Cookie watcher ─────────────────────────────────────────────────────────
// Supabase SSR sets cookies named `sb-<projectRef>-auth-token` (sometimes
// chunked into `.0` / `.1`). Any change on those, for the configured backend
// host, means auth state probably shifted — re-check.
chrome.cookies.onChanged.addListener(async (change) => {
  if (!change || !change.cookie) return;
  if (!change.cookie.name.startsWith(CFG.SUPABASE_COOKIE_PREFIX)) return;

  let host;
  try { host = new URL(await getApiBase()).hostname; }
  catch { return; }

  const cookieDomain = (change.cookie.domain || '').replace(/^\./, '');
  if (cookieDomain !== host && !host.endsWith(cookieDomain)) return;

  // Debounce — a single login writes the session + refresh cookies back to
  // back; one re-check is enough.
  if (cookieDebounceTimer) clearTimeout(cookieDebounceTimer);
  cookieDebounceTimer = setTimeout(() => {
    cookieDebounceTimer = null;
    runAuthCheck().catch(err => console.warn('[biotechos] auth recheck failed', err));
  }, 400);
});

// ── Sign out ───────────────────────────────────────────────────────────────
// Remove Supabase auth cookies for the configured backend origin. This is
// equivalent to clicking "sign out" in the web app — Supabase SSR clears the
// same cookies. After removal, runAuthCheck broadcasts the unauthenticated
// state to every listener.
async function signOut() {
  const apiBase = await getApiBase();
  let origin;
  try { origin = new URL(apiBase).origin; }
  catch { return { ok: false, error: 'invalid API base' }; }

  let cookies = [];
  try { cookies = await chrome.cookies.getAll({ url: origin }); }
  catch (err) { return { ok: false, error: err?.message || 'cookies.getAll failed' }; }

  const removed = [];
  for (const c of cookies) {
    if (!c.name.startsWith(CFG.SUPABASE_COOKIE_PREFIX)) continue;
    // chrome.cookies.remove wants a URL the cookie would be sent on, not a
    // domain. Reconstruct it from the cookie's own properties.
    const scheme = c.secure ? 'https' : 'http';
    const domain = c.domain.replace(/^\./, '');
    const removeUrl = `${scheme}://${domain}${c.path || '/'}`;
    try {
      await chrome.cookies.remove({ url: removeUrl, name: c.name });
      removed.push(c.name);
    } catch (err) {
      console.warn('[biotechos] failed to remove cookie', c.name, err);
    }
  }

  // The cookie watcher will also fire and trigger a recheck; running it
  // explicitly here makes the round-trip deterministic for the caller.
  const state = await runAuthCheck();
  return { ok: true, removed, state };
}

// ── API proxy (for content scripts) ────────────────────────────────────────
// Content scripts call us with { method: 'generateScope', args: {...} }.
// We execute in the privileged extension context where host_permissions
// apply, then forward the result or a serialisable error shape.
async function handleApiCall(payload) {
  const method = payload && payload.method;
  const args = (payload && payload.args) || {};

  if (!method || typeof API[method] !== 'function') {
    return { ok: false, error: `Unknown API method: ${method}`, code: 'bad_method' };
  }

  try {
    const data = await API[method](args);
    return { ok: true, data };
  } catch (err) {
    // If we 401'd, trigger an auth re-check so the popup and badge catch up.
    if (err && err.name === 'AuthError') {
      runAuthCheck().catch(() => {});
    }
    return {
      ok: false,
      error: (err && err.message) || 'Request failed',
      status: err && err.status,
      code: err && err.code,
      authError: !!(err && err.name === 'AuthError'),
      networkError: !!(err && err.name === 'NetworkError')
    };
  }
}

// ── Message router ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  switch (msg.type) {
    case MSG.PING: {
      sendResponse({ ok: true, ts: Date.now(), lastGmailState, lastAuthState });
      return false;
    }

    case MSG.GMAIL_STATE_CHANGED: {
      lastGmailState = {
        ...msg.payload,
        receivedAt: Date.now(),
        tabId: sender.tab && sender.tab.id
      };
      sendResponse({ ok: true });
      return false;
    }

    case MSG.CHECK_AUTH: {
      runAuthCheck().then(sendResponse);
      return true;
    }

    case MSG.SIGN_OUT: {
      signOut().then(sendResponse);
      return true;
    }

    case MSG.API_CALL: {
      handleApiCall(msg.payload).then(sendResponse);
      return true;
    }

    case MSG.OPEN_LOGIN: {
      getApiBase().then((apiBase) => {
        const loginUrl = apiBase.replace(/\/$/, '') + '/login';
        chrome.tabs.create({ url: loginUrl }).then((tab) => {
          sendResponse({ ok: true, tabId: tab.id });
        }).catch((err) => {
          sendResponse({ ok: false, error: err && err.message });
        });
      });
      return true;
    }

    default:
      return false;
  }
});

// ── Lifecycle ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  const existing = await chrome.storage.sync.get(KEYS.API_BASE);
  if (!existing[KEYS.API_BASE]) {
    await chrome.storage.sync.set({ [KEYS.API_BASE]: CFG.DEFAULT_API_BASE });
  }
  // Fire-and-forget: populate lastAuthState on install/update.
  runAuthCheck().catch(() => {});
  console.info('[biotechos] installed', details.reason);
});

// Wake-up: MV3 workers restart on-demand. Prime lastAuthState so the first
// popup open after a wake-up doesn't flash "unknown".
chrome.runtime.onStartup.addListener(() => {
  runAuthCheck().catch(() => {});
});

// Kick an initial check immediately too — covers the first load after
// `Load unpacked` where onStartup doesn't fire.
runAuthCheck().catch(() => {});

console.info('[biotechos] service worker loaded');
