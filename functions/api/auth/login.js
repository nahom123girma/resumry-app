// functions/api/auth/login.js  —  POST { email, password }
import { ok, error, sessionCookie } from '../../lib/response.js';
import { verifyPassword, createSession, SESSION_TTL_SEC, publicUser } from '../../lib/auth.js';
import { recordEvent } from '../../lib/events.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  // Same generic message whether the email exists or not.
  if (!user || !user.password_hash) return error('Invalid email or password', 401);

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) return error('Invalid email or password', 401);

  const { token } = await createSession(env, user.id, request.headers.get('User-Agent'));
  await recordEvent(env, { kind: 'login', user });
  const res = ok({ user: publicUser(user) });
  res.headers.append('Set-Cookie', sessionCookie(token, SESSION_TTL_SEC));
  return res;
}
