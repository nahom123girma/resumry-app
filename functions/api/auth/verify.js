// functions/api/auth/verify.js  —  GET /api/auth/verify?token=...
// Consumes an email-verification token and flips users.email_verified = 1,
// then redirects back into the app with a status flag.
import { hashToken } from '../../lib/email.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = url.origin;
  const token = url.searchParams.get('token') || '';
  const back = (status) => Response.redirect(`${origin}/?verified=${status}#dashboard`, 302);

  if (!token) return back('invalid');

  try {
    const th = await hashToken(token);
    const row = await env.DB
      .prepare("SELECT user_id FROM auth_tokens WHERE token_hash = ? AND kind = 'email_verify' AND expires_at > datetime('now')")
      .bind(th)
      .first();
    if (!row) return back('invalid');

    await env.DB.prepare("UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?").bind(row.user_id).run();
    // Single-use: clean up this token (and any other pending verify tokens for the user).
    await env.DB.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND kind = 'email_verify'").bind(row.user_id).run();
    return back('success');
  } catch (e) {
    return back('error');
  }
}
