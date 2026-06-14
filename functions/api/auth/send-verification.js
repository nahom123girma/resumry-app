// functions/api/auth/send-verification.js  —  POST (requires session)
// Issues a fresh email-verification token for the signed-in user and emails it.
import { ok, error } from '../../lib/response.js';
import { sendEmail, randomToken, hashToken, verifyEmailHtml } from '../../lib/email.js';

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const user = data && data.user;
  if (!user) return error('Please sign in.', 401);

  // Already verified? Nothing to do.
  const row = await env.DB.prepare('SELECT email, name, email_verified FROM users WHERE id = ?').bind(user.id).first();
  if (!row) return error('Account not found.', 404);
  if (row.email_verified) return ok({ ok: true, alreadyVerified: true });

  // Replace any outstanding verify tokens with a fresh one.
  await env.DB.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND kind = 'email_verify'").bind(user.id).run();
  const token = randomToken();
  await env.DB
    .prepare("INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, 'email_verify', datetime('now','+2 days'))")
    .bind(await hashToken(token), user.id)
    .run();

  const link = new URL(request.url).origin + '/api/auth/verify?token=' + token;
  const sent = await sendEmail(env, {
    to: row.email,
    subject: 'Verify your Resumry email',
    html: verifyEmailHtml(row.name, link),
    text: 'Verify your email: ' + link,
  });

  return ok({ ok: true, sent: sent.ok === true });
}
