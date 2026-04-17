// BiotechOS Quote Assistant — shared configuration.
// Loaded as a content script and imported by the service worker.
// Keeps one source of truth for the backend origin and storage keys.

(function initConfig(root) {
  const DEFAULT_API_BASE = 'http://localhost:3000';

  const CONFIG = {
    // Fallback when chrome.storage hasn't been populated yet.
    // Override at runtime from the popup (Task 2) or via storage.
    DEFAULT_API_BASE,

    // chrome.storage.sync keys
    STORAGE_KEYS: Object.freeze({
      API_BASE: 'biotechos.apiBase',
      USER: 'biotechos.user',
      LAST_HEALTH_AT: 'biotechos.lastHealthAt',
      LAST_HEALTH_OK: 'biotechos.lastHealthOk',
      LAST_AUTH_AT: 'biotechos.lastAuthAt'
    }),

    // Messages passed between content script, popup, and background worker.
    // The naming convention is `biotechos:<verb>` — short, unique, and never
    // collides with Gmail's own event bus.
    MESSAGES: Object.freeze({
      PING: 'biotechos:ping',
      CHECK_AUTH: 'biotechos:checkAuth',
      AUTH_CHANGED: 'biotechos:authChanged',
      SIGN_OUT: 'biotechos:signOut',
      API_CALL: 'biotechos:apiCall',
      GMAIL_STATE_CHANGED: 'biotechos:gmailStateChanged',
      OPEN_LOGIN: 'biotechos:openLogin'
    }),

    // Supabase SSR cookies start with `sb-<projectRef>-…`. The cookie watcher
    // uses this prefix to decide when auth state has probably changed so it
    // can trigger a re-check without false positives on analytics cookies.
    SUPABASE_COOKIE_PREFIX: 'sb-',

    // CSS namespace for every DOM node we inject into Gmail.
    // Prefix keeps us out of Gmail's own class space and makes cleanup trivial.
    CSS_PREFIX: 'cro-qg-',

    // Gmail runs as a single-page app. We only want to re-scan when the
    // hash (thread id) changes — polling every 500 ms catches edge cases
    // where Gmail swallows the hashchange event.
    SPA_POLL_MS: 500
  };

  root.BIOTECHOS_CONFIG = CONFIG;

  // Expose as a module when imported by the service worker.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
  }
})(typeof self !== 'undefined' ? self : globalThis);
