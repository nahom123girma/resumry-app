// functions/api/admin/events.js — GET recent platform events (owner only)
import { json, error } from '../../lib/response.js';
import { isAdmin } from '../../lib/events.js';

export async function onRequestGet(context) {
  const { env, data } = context;
  if (!isAdmin(env, data.user)) return error('Forbidden', 403);

  const r = await env.DB.prepare(
    'SELECT kind, user_id, email, name, detail, amount, created_at FROM events ORDER BY id DESC LIMIT 100'
  ).all();
  return json({ ok: true, events: r.results || [] });
}
