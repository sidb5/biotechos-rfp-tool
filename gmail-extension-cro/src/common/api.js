// BiotechOS API client — shared between the service worker and the popup.
//
// Auth model: the BiotechOS backend uses Supabase SSR, which means auth is
// carried by HTTP-only cookies on the biotechos.com origin. Extensions don't
// mint or store tokens here — they ride the same cookies the user already
// has from signing in to the web app. `credentials: 'include'` plus
// host_permissions for the backend origin is all we need.
//
// This file is *not* loaded into content scripts. Content scripts proxy API
// calls through the service worker via chrome.runtime.sendMessage(API_CALL)
// so we don't trip over Gmail's page-level CORS policy.

(function initApi(root) {
  const CFG = root.BIOTECHOS_CONFIG;
  if (!CFG) {
    console.warn('[biotechos] api.js loaded before config.js');
    return;
  }
  const KEYS = CFG.STORAGE_KEYS;

  // ── Error types ──────────────────────────────────────────────────────────
  // We subclass Error so callers can `instanceof` check instead of matching
  // on strings. The service worker also forwards these to content scripts by
  // name + status so the Chrome message boundary doesn't lose the shape.
  class ApiError extends Error {
    constructor(message, { status, code, details } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status ?? null;
      this.code = code ?? null;
      this.details = details ?? null;
    }
  }
  class AuthError extends ApiError {
    constructor(message = 'Sign in to BiotechOS to continue') {
      super(message, { status: 401, code: 'unauthorized' });
      this.name = 'AuthError';
    }
  }
  class NetworkError extends ApiError {
    constructor(message = 'Cannot reach BiotechOS') {
      super(message, { status: null, code: 'network' });
      this.name = 'NetworkError';
    }
  }

  // ── Core ─────────────────────────────────────────────────────────────────
  async function getApiBase() {
    const got = await chrome.storage.sync.get(KEYS.API_BASE);
    return (got[KEYS.API_BASE] || CFG.DEFAULT_API_BASE).replace(/\/$/, '');
  }

  // One shared request primitive. Handles:
  //   * JSON body serialisation (unless FormData)
  //   * credentials: 'include' so Supabase cookies ride along
  //   * 401 -> AuthError so callers can redirect to login
  //   * 429 -> ApiError with retry-after in details
  //   * Network failure -> NetworkError (distinguishable from 5xx server errors)
  async function request(path, init = {}) {
    const base = await getApiBase();
    const url = base + path;

    const isForm = init.body instanceof FormData;
    const headers = {
      Accept: 'application/json',
      ...(init.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    };

    let res;
    try {
      res = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        ...init,
        headers
      });
    } catch (err) {
      throw new NetworkError(err && err.message ? err.message : 'Network error');
    }

    if (res.status === 401) throw new AuthError();

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      throw new ApiError('Too many requests — please wait a moment.', {
        status: 429,
        code: 'rate_limited',
        details: { retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : null }
      });
    }

    let body = null;
    const text = await res.text();
    if (text) {
      try { body = JSON.parse(text); }
      catch { body = { _raw: text }; }
    }

    if (!res.ok) {
      const msg =
        (body && (body.error || body.message)) ||
        `Request failed (HTTP ${res.status})`;
      throw new ApiError(msg, {
        status: res.status,
        code: body?.code ?? null,
        details: body
      });
    }

    return body;
  }

  // ── Endpoint wrappers ────────────────────────────────────────────────────
  // One function per backend route the extension needs. Everything beyond
  // getProfile is used from Task 3 onwards, but we define it here so the
  // wire format lives in exactly one place.
  const API = {
    ApiError,
    AuthError,
    NetworkError,
    getApiBase,

    async getProfile() {
      return request('/api/profile', { method: 'GET' });
    },

    async analyzeIntake({ text }) {
      return request('/api/intake/analyze', {
        method: 'POST',
        body: JSON.stringify({ text })
      });
    },

    async createIntake(payload) {
      return request('/api/intake/create', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async generateScope({ proposal_id }) {
      return request('/api/quote/generate-scope', {
        method: 'POST',
        body: JSON.stringify({ proposal_id })
      });
    },

    async saveQuote({ proposal_id, quote_data }) {
      // Backend uses PATCH, not POST.
      return request('/api/quote/save', {
        method: 'PATCH',
        body: JSON.stringify({ proposal_id, quote_data })
      });
    },

    async shareQuote({ proposal_id, action = 'enable' }) {
      return request('/api/quote/share', {
        method: 'POST',
        body: JSON.stringify({ proposal_id, action })
      });
    },

    async sendQuote(payload) {
      return request('/api/quote/send', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
  };

  root.BIOTECHOS_API = API;
})(typeof self !== 'undefined' ? self : globalThis);
