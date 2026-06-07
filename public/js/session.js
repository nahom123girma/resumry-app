// public/js/session.js — auth state + login/signup/logout, backed by the server.
window.Resumry = window.Resumry || {};

Resumry.session = (function () {
  let current = null;        // { user, ai } or null
  const listeners = [];
  function emit() { listeners.forEach((fn) => { try { fn(current); } catch (_) {} }); }

  async function refresh() {
    try { current = await Resumry.api.get('/auth/session'); }
    catch (_) { current = { user: null }; }
    emit();
    return current;
  }
  async function signup(email, password, name) {
    const r = await Resumry.api.post('/auth/signup', { email, password, name });
    current = { user: r.user }; emit(); return r.user;
  }
  async function login(email, password) {
    const r = await Resumry.api.post('/auth/login', { email, password });
    current = { user: r.user }; emit(); return r.user;
  }
  async function google(credential) {
    const r = await Resumry.api.post('/auth/google', { credential });
    current = { user: r.user }; emit(); return r.user;
  }
  async function logout() {
    try { await Resumry.api.post('/auth/logout'); } catch (_) {}
    current = { user: null }; emit();
  }
  return {
    user: () => (current ? current.user : null),
    ai: () => (current ? current.ai : null),
    isPro: () => { const u = current && current.user; return !!u && (u.plan === 'pro' || u.plan === 'lifetime'); },
    onChange: (fn) => { listeners.push(fn); if (current) fn(current); },
    refresh, signup, login, google, logout,
  };
})();
