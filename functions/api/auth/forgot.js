// functions/api/auth/forgot.js  —  POST { email }
// Emails a password-reset link IF the address belongs to a password account.
// Always responds identically so it never reveals whether an account exists.
import { ok, error } from '../../lib/response.js';
import { sendEmail, randomToken, hashToken, resetPasswordHtml } from '../../lib/email.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }
  const email = (body.email || '').trim().toLowerCase();
  if (!email) return error('Email required');

  const user = await env.DB
    .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
    .bind(email).first();

  // Only password accounts can reset (Google/OAuth users have no password).
  if (user && user.password_hash) {
    try {
      await env.DB.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND kind = 'password_reset'")
        .bind(user.id).run();
      const token = randomToken();
      await env.DB.prepare(
        "INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, 'password_reset', datetime('now','+1 hour'))"
      ).bind(await hashToken(token), user.id).run();

      const link = new URL(request.url).origin + '/?reset=' + token + '#reset-password';
      await sendEmail(env, {
        to: user.email,
        subject: 'Reset your Resumry password',
        html: resetPasswordHtml(user.name || 'there', link),
        text: 'Reset your password: ' + link,
      });
    } catch (_) { /* never surface internal errors to the caller */ }
  }

  // Generic response — same whether or not the account exists.
  return ok({ ok: true });
}
