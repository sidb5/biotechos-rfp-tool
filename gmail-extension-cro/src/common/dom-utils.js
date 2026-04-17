// Small DOM helpers shared across the extension.
// No framework — keep content scripts tiny and Gmail-safe.

(function initDomUtils(root) {
  const PREFIX = (root.BIOTECHOS_CONFIG && root.BIOTECHOS_CONFIG.CSS_PREFIX) || 'cro-qg-';

  function el(tag, { cls, text, attrs } = {}, children = []) {
    const node = document.createElement(tag);
    if (cls) node.className = Array.isArray(cls) ? cls.join(' ') : cls;
    if (text != null) node.textContent = text;
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        node.setAttribute(k, String(v));
      }
    }
    for (const child of children) {
      if (child == null) continue;
      node.appendChild(child);
    }
    return node;
  }

  // Namespaced class helper so every injected node is easy to spot and clean up.
  function klass(...parts) {
    return parts.filter(Boolean).map(p => PREFIX + p).join(' ');
  }

  // Remove everything the extension has injected.
  // Used on SPA transitions so we never leak listeners or duplicate buttons.
  function purgeInjected(root) {
    const scope = root || document;
    scope.querySelectorAll(`[data-${PREFIX}mark]`).forEach(n => n.remove());
  }

  // Wait for a selector to appear. Resolves with the node, or null on timeout.
  function waitFor(selector, { timeoutMs = 5000, root = document } = {}) {
    return new Promise(resolve => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);

      const mo = new MutationObserver(() => {
        const found = root.querySelector(selector);
        if (found) {
          mo.disconnect();
          resolve(found);
        }
      });
      mo.observe(root.body || root, { childList: true, subtree: true });

      setTimeout(() => {
        mo.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  // Debounce with a leading-edge skip — plays well with Gmail's bursty mutations.
  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; fn(...args); }, wait);
    };
  }

  root.BIOTECHOS_DOM = { el, klass, purgeInjected, waitFor, debounce, PREFIX };
})(typeof self !== 'undefined' ? self : globalThis);
