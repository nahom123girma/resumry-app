// functions/api/covers/index.js  —  GET (list) | POST (create/upsert)
import { json, error } from '../../lib/response.js';
import { uuid } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const { env, data } = context;
  if (!data.user) return error('Unauthorized', 401);
  const { results } = await env.DB.prepare(
    'SELECT id, title, data, updated_at, created_at FROM cover_letters WHERE user_id = ? ORDER BY updated_at DESC'
  ).bind(data.user.id).all();
  return json({ ok: true, covers: results || [] });
}

export async function onRequestPost(context) {
  const { request, env, data } = context;
  if (!data.user) return error('Unauthorized', 401);
  let body; try { body = await request.json(); } catch { return error('Invalid JSON'); }
  const id = body.id || uuid();
  const doc = JSON.stringify(body.data || {});
  if (doc.length > 200000) return error('Cover letter too large', 413);
  await env.DB.prepare(
    `INSERT INTO cover_letters (id, user_id, title, data) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, data=excluded.data, updated_at=datetime('now')
     WHERE cover_letters.user_id = ?`
  ).bind(id, data.user.id, (body.title || 'Untitled').slice(0, 120), doc, data.user.id).run();
  return json({ ok: true, id });
}
