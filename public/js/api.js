// public/js/api.js — thin client for the Cloudflare Functions API.
// Cookies (HttpOnly session) are sent automatically with credentials:'include'.
window.Resumry = window.Resumry || {};

Resumry.api = (function () {
  async function call(method, path, body) {
    const res = await fetch('/api' + path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || ('Request failed: ' + res.status));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    put: (p, b) => call('PUT', p, b),
    del: (p) => call('DELETE', p),
  };
})();
