// BiotechOS Outreach Assistant — API client.
// Content scripts proxy all calls through the service worker via API_CALL messages.

(function initApi(root) {
  const CFG = root.BIOTECHOS_CONFIG;
  if (!CFG) { console.warn('[biotechos] api.js loaded before config.js'); return; }
  const KEYS = CFG.STORAGE_KEYS;

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

  async function getApiBase() {
    const got = await chrome.storage.sync.get(KEYS.API_BASE);
    return (got[KEYS.API_BASE] || CFG.DEFAULT_API_BASE).replace(/\/$/, '');
  }

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
      res = await fetch(url, { credentials: 'include', cache: 'no-store', ...init, headers });
    } catch (err) {
      throw new NetworkError(err?.message || 'Network error');
    }
    if (res.status === 401) throw new AuthError();
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      throw new ApiError('Too many requests — please wait.', {
        status: 429, code: 'rate_limited',
        details: { retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : null }
      });
    }
    let body = null;
    const text = await res.text();
    if (text) { try { body = JSON.parse(text); } catch { body = { _raw: text }; } }
    if (!res.ok) {
      const msg = (body && (body.error || body.message)) || `Request failed (HTTP ${res.status})`;
      throw new ApiError(msg, { status: res.status, code: body?.code ?? null, details: body });
    }
    return body;
  }

  const API = {
    ApiError, AuthError, NetworkError, getApiBase,

    async getProfile() {
      return request('/api/profile', { method: 'GET' });
    },

    // ── Biotech extension endpoints ──────────────────────────────────────────
    async getBriefs() {
      return request('/api/biotech/extension/briefs', { method: 'GET' });
    },

    async getBriefCros({ briefId }) {
      return request(`/api/biotech/extension/briefs/${briefId}/cros`, { method: 'GET' });
    },

    async searchCros({ q }) {
      return request(`/api/biotech/extension/cros/search?q=${encodeURIComponent(q ?? '')}`, { method: 'GET' });
    },

    async generateOutreach({ briefId, croNames }) {
      return request('/api/biotech/extension/outreach/generate', {
        method: 'POST',
        body: JSON.stringify({ brief_id: briefId, cro_names: croNames })
      });
    },

    async logOutreach({ briefId, cros, subject, body }) {
      return request('/api/biotech/extension/outreach/log', {
        method: 'POST',
        body: JSON.stringify({ brief_id: briefId, cros, subject, body })
      });
    },

    async analyzeReply({ emailBody, senderEmail }) {
      return request('/api/biotech/extension/reply/analyze', {
        method: 'POST',
        body: JSON.stringify({ email_body: emailBody, sender_email: senderEmail })
      });
    },

    async generateReply({ croName, selectedItems, originalSubject }) {
      return request('/api/biotech/extension/reply/generate', {
        method: 'POST',
        body: JSON.stringify({ cro_name: croName, selected_items: selectedItems, original_subject: originalSubject })
      });
    },

    async logReply({ engagementId, subject, replyBody, gapAnalysis }) {
      return request('/api/biotech/extension/reply/log', {
        method: 'POST',
        body: JSON.stringify({ engagement_id: engagementId, subject, reply_body: replyBody, gap_analysis: gapAnalysis })
      });
    },

    async lookupEngagement({ email }) {
      return request(`/api/biotech/extension/engagements/lookup?email=${encodeURIComponent(email)}`, { method: 'GET' });
    },

    async generateContinuation({ engagementId, croName, currentSubject, includeSubject }) {
      return request('/api/biotech/extension/continuation/generate', {
        method: 'POST',
        body: JSON.stringify({
          engagement_id:   engagementId,
          cro_name:        croName,
          current_subject: currentSubject,
          include_subject: includeSubject ?? false,
        })
      });
    }
  };

  root.BIOTECHOS_API = API;
})(typeof self !== 'undefined' ? self : globalThis);
