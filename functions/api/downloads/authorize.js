// functions/api/downloads/authorize.js  —  POST  (requires session)
// Decides whether THIS export may be clean (watermark-free) and accounts for it
// server-side so the limit can't be bypassed from the browser.
//   pro / lifetime → unlimited clean exports
//   free           → spends one download_passes credit per clean export;
//                    with no credits the export must be watermarked.
import { json, error } from '../../lib/response.js';
import { isPaid } from '../../lib/entitlements.js';

export async function onRequestPost(context) {
  const { env, data } = context;
  const user = data && data.user;
  if (!user) return error('Please sign in.', 401);

  if (isPaid(user)) {
    return json({ ok: true, clean: true, unlimited: true });
  }

  // Free plan → consume a Download Pass credit if one is available.
  const row = await env.DB.prepare('SELECT download_passes FROM users WHERE id = ?')
    .bind(user.id).first();
  const credits = (row && row.download_passes) || 0;

  if (credits > 0) {
    // Atomic decrement (guards against double-spend on concurrent clicks).
    const res = await env.DB.prepare(
      "UPDATE users SET download_passes = download_passes - 1, updated_at = datetime('now') WHERE id = ? AND download_passes > 0"
    ).bind(user.id).run();
    const spent = res.meta && res.meta.changes ? res.meta.changes > 0 : true;
    if (spent) return json({ ok: true, clean: true, remaining: credits - 1 });
  }

  return json({ ok: true, clean: false, remaining: 0 });
}
