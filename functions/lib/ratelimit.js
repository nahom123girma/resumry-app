// functions/lib/ratelimit.js — short-window abuse limiting + monthly plan quotas (D1).

// Fixed-window limiter. Returns { allowed, remaining, resetIn }.
export async function rateLimit(env, key, limit, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT window_start, count FROM rate_limits WHERE rl_key = ?')
    .bind(key).first();

  if (!row || now - row.window_start >= windowSec) {
    await env.DB.prepare(
      `INSERT INTO rate_limits (rl_key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(rl_key) DO UPDATE SET window_start = excluded.window_start, count = 1`
    ).bind(key, now).run();
    return { allowed: true, remaining: limit - 1, resetIn: windowSec };
  }
  if (row.count >= limit) {
    return { allowed: false, remaining: 0, resetIn: windowSec - (now - row.window_start) };
  }
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE rl_key = ?').bind(key).run();
  return { allowed: true, remaining: limit - row.count - 1, resetIn: windowSec - (now - row.window_start) };
}

// Monthly AI quota by plan. free & download-pass buyers get NO AI (per spec).
export const AI_MONTHLY_QUOTA = { free: 0, download_pass: 0, pro: 1000, lifetime: 1000 };

export function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getUsage(env, userId) {
  const row = await env.DB.prepare('SELECT calls FROM ai_usage WHERE user_id = ? AND period = ?')
    .bind(userId, currentPeriod()).first();
  return row ? row.calls : 0;
}

export async function incrementUsage(env, userId) {
  await env.DB.prepare(
    `INSERT INTO ai_usage (user_id, period, calls) VALUES (?, ?, 1)
     ON CONFLICT(user_id, period) DO UPDATE SET calls = calls + 1, updated_at = datetime('now')`
  ).bind(userId, currentPeriod()).run();
}
