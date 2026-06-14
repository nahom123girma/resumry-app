// functions/api/admin/users.js — GET all users (owner only). Never returns hashes.
import { json, error } from '../../lib/response.js';
import { isAdmin } from '../../lib/events.js';

export async function onRequestGet(context) {
  const { env, data } = context;
  if (!isAdmin(env, data.user)) return error('Forbidden', 403);

  const r = await env.DB.prepare(
    'SELECT id, email, name, plan, plan_status, provider, created_at FROM users ORDER BY created_at DESC LIMIT 500'
  ).all();
  return json({ ok: true, users: r.results || [] });
}
