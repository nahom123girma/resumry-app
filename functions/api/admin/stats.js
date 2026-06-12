// functions/api/admin/stats.js — GET platform stats (owner only)
import { json, error } from '../../lib/response.js';
import { isAdmin } from '../../lib/events.js';

export async function onRequestGet(context) {
  const { env, data } = context;
  if (!isAdmin(env, data.user)) return error('Forbidden', 403);

  const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  const subs = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE plan != 'free' AND plan_status = 'active'"
  ).first();
  const rev = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS s FROM events WHERE kind = 'payment_succeeded'"
  ).first();
  const fail = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM events WHERE kind = 'payment_failed'"
  ).first();

  return json({
    ok: true,
    users: users.n,
    active_subscriptions: subs.n,
    revenue: rev.s,
    failed_payments: fail.n,
  });
}
