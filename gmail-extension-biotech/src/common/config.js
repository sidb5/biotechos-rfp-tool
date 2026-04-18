// BiotechOS Outreach Assistant — shared configuration.

(function initConfig(root) {
  const DEFAULT_API_BASE = 'http://localhost:3000';

  const CONFIG = {
    DEFAULT_API_BASE,

    STORAGE_KEYS: Object.freeze({
      API_BASE:        'biotechos.apiBase',
      USER:            'biotechos.user',
      LAST_HEALTH_AT:  'biotechos.lastHealthAt',
      LAST_HEALTH_OK:  'biotechos.lastHealthOk',
      LAST_AUTH_AT:    'biotechos.lastAuthAt'
    }),

    MESSAGES: Object.freeze({
      PING:                 'biotechos:ping',
      CHECK_AUTH:           'biotechos:checkAuth',
      AUTH_CHANGED:         'biotechos:authChanged',
      SIGN_OUT:             'biotechos:signOut',
      API_CALL:             'biotechos:apiCall',
      GMAIL_STATE_CHANGED:  'biotechos:gmailStateChanged',
      OPEN_LOGIN:           'biotechos:openLogin'
    }),

    SUPABASE_COOKIE_PREFIX: 'sb-',

    // Namespace for every DOM node we inject — keeps us out of Gmail's class space.
    CSS_PREFIX: 'bio-oe-',

    SPA_POLL_MS: 500
  };

  root.BIOTECHOS_CONFIG = CONFIG;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
  }
})(typeof self !== 'undefined' ? self : globalThis);
