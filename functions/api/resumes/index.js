// functions/api/resumes/index.js  —  GET (list)  |  POST (create)
import { json, error } from '../../lib/response.js';
import { uuid } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const { env, data } = context;
  if (!data.user) return error('Unauthorized', 401);
  const { results } = await env.DB.prepare(
    'SELECT id, title, template, data, updated_at, created_at FROM resumes WHERE user_id = ? ORDER BY updated_at DESC'
  ).bind(data.user.id).all();
  return json({ ok: true, resumes: results || [] });
}

export async function onRequestPost(context) {
  const { request, env, data } = context;
  if (!data.user) return error('Unauthorized', 401);
  let body;
  try { body = await request.json(); } catch { return error('Invalid JSON'); }
  const id = body.id || uuid();
  const title = (body.title || 'Untitled').slice(0, 120);
  const template = (body.template || 'modern').slice(0, 40);
  const doc = JSON.stringify(body.data || {});
  if (doc.length > 200000) return error('Resume too large', 413);

  // Upsert so the client can sync the same id.
  await env.DB.prepare(
    `INSERT INTO resumes (id, user_id, title, template, data) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, template=excluded.template,
       data=excluded.data, updated_at=datetime('now')
     WHERE resumes.user_id = ?`
  ).bind(id, data.user.id, title, template, doc, data.user.id).run();

  return json({ ok: true, id });
}
