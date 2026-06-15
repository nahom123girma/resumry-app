// functions/api/auth/reset.js  —  POST { token, password }
// Consumes a valid password-reset token, sets the new password, and signs the
// user in (sets the session cookie).
import { ok, error, sessionCookie } from '../../lib/response.js';
import { hashPassword, createSession, SESSION_TTL_SEC, publicUser } from '../../lib/auth.js';
import { hashToken } from '../../lib/email.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }
  const token = body.token || '';
  const password = body.password || '';
  if (!token) return error('Missing reset token');
  if (password.length < 8) return error('Password must be at least 8 characters');

  const th = await hashToken(token);
  const row = await env.DB.prepare(
    "SELECT user_id FROM auth_tokens WHERE token_hash = ? AND kind = 'password_reset' AND expires_at > datetime('now')"
  ).bind(th).first();
  if (!row) return error('This reset link is invalid or has expired — request a new one.', 400);

  const { hash, salt } = await hashPassword(password);
  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(hash, salt, row.user_id).run();

  // Burn every reset token for this user so the link can't be reused.
  await env.DB.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND kind = 'password_reset'")
    .bind(row.user_id).run();

  // Sign them in.
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.user_id).first();
  const { token: sid } = await createSession(env, user.id, request.headers.get('User-Agent'));
  const res = ok({ user: publicUser(user) });
  res.headers.append('Set-Cookie', sessionCookie(sid, SESSION_TTL_SEC));
  return res;
}
