// functions/api/auth/google.js  —  POST { credential }  (Google ID token / JWT)
// Verifies the token with Google, then creates/loads the user and a session.
import { ok, error, sessionCookie } from '../../lib/response.js';
import { uuid, createSession, SESSION_TTL_SEC, publicUser } from '../../lib/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }
  const credential = body.credential;
  if (!credential) return error('Missing Google credential');

  // Verify with Google's tokeninfo endpoint (simple + no key needed).
  const resp = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!resp.ok) return error('Google token verification failed', 401);
  const claims = await resp.json();

  // Audience must match your OAuth client id.
  if (env.GOOGLE_CLIENT_ID && claims.aud !== env.GOOGLE_CLIENT_ID) {
    return error('Token audience mismatch', 401);
  }
  if (claims.email_verified !== 'true' && claims.email_verified !== true) {
    return error('Email not verified by Google', 401);
  }
  const email = (claims.email || '').toLowerCase();
  if (!email) return error('No email in token', 401);

  let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) {
    const id = uuid();
    await env.DB.prepare(
      `INSERT INTO users (id, email, name, provider, plan) VALUES (?, ?, ?, 'google', 'free')`
    ).bind(id, email, claims.name || '').run();
    user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  }

  const { token } = await createSession(env, user.id, request.headers.get('User-Agent'));
  const res = ok({ user: publicUser(user) });
  res.headers.append('Set-Cookie', sessionCookie(token, SESSION_TTL_SEC));
  return res;
}
