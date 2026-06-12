// functions/api/auth/signup.js  —  POST { email, password, name }
import { ok, error, sessionCookie } from '../../lib/response.js';
import { uuid, hashPassword, createSession, SESSION_TTL_SEC, publicUser } from '../../lib/auth.js';
import { recordEvent } from '../../lib/events.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const name = (body.name || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Invalid email');
  if (password.length < 8) return error('Password must be at least 8 characters');

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return error('An account with that email already exists', 409);

  const { hash, salt } = await hashPassword(password);
  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, password_hash, password_salt, provider, plan)
     VALUES (?, ?, ?, ?, ?, 'password', 'free')`
  ).bind(id, email, name, hash, salt).run();

  const { token } = await createSession(env, id, request.headers.get('User-Agent'));
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  await recordEvent(env, { kind: 'signup', user });
  const res = ok({ user: publicUser(user) });
  res.headers.append('Set-Cookie', sessionCookie(token, SESSION_TTL_SEC));
  return res;
}
