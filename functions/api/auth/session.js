// functions/api/auth/session.js  —  GET  (returns the current user or null)
import { json } from '../../lib/response.js';
import { publicUser } from '../../lib/auth.js';
import { getUsage, AI_MONTHLY_QUOTA } from '../../lib/ratelimit.js';

export async function onRequestGet(context) {
  const u = context.data.user;
  if (!u) return json({ ok: true, user: null });
  const used = await getUsage(context.env, u.id);
  const quota = AI_MONTHLY_QUOTA[u.plan] ?? AI_MONTHLY_QUOTA.free;
  return json({ ok: true, user: publicUser(u), ai: { used, quota, remaining: Math.max(0, quota - used) } });
}
