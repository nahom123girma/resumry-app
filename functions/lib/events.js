// functions/lib/events.js — platform event log + admin gate.
// The admin/owner is whoever signs in with ADMIN_EMAIL (set as a plaintext var
// in the Pages dashboard). Falls back to the account owner's email.

export function adminEmail(env) {
  return ((env && env.ADMIN_EMAIL) || '5127tr@gmail.com').trim().toLowerCase();
}

export function isAdmin(env, user) {
  return !!(user && user.email && user.email.toLowerCase() === adminEmail(env));
}

// Record an event for the admin dashboard. NEVER throws — logging must not
// break the request it is attached to.
export async function recordEvent(env, { kind, user, email, name, detail, amount } = {}) {
  try {
    await env.DB.prepare(
      'INSERT INTO events (kind, user_id, email, name, detail, amount) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      kind,
      (user && user.id) || null,
      email || (user && user.email) || null,
      name || (user && user.name) || null,
      detail || null,
      amount != null ? amount : null
    ).run();
  } catch (_) { /* swallow — never block the main flow */ }
}
