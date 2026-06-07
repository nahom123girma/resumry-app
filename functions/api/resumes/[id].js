// functions/api/resumes/[id].js  —  GET | PUT | DELETE  for a single resume
import { json, error } from '../../lib/response.js';

export async function onRequestGet(context) {
  const { env, data, params } = context;
  if (!data.user) return error('Unauthorized', 401);
  const row = await env.DB.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?')
    .bind(params.id, data.user.id).first();
  if (!row) return error('Not found', 404);
  return json({ ok: true, resume: row });
}

export async function onRequestPut(context) {
  const { request, env, data, params } = context;
  if (!data.user) return error('Unauthorized', 401);
  let body; try { body = await request.json(); } catch { return error('Invalid JSON'); }
  const doc = JSON.stringify(body.data || {});
  if (doc.length > 200000) return error('Resume too large', 413);
  const r = await env.DB.prepare(
    `UPDATE resumes SET title=?, template=?, data=?, updated_at=datetime('now')
     WHERE id=? AND user_id=?`
  ).bind((body.title || 'Untitled').slice(0, 120), (body.template || 'modern').slice(0, 40),
         doc, params.id, data.user.id).run();
  if (!r.meta.changes) return error('Not found', 404);
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const { env, data, params } = context;
  if (!data.user) return error('Unauthorized', 401);
  await env.DB.prepare('DELETE FROM resumes WHERE id=? AND user_id=?').bind(params.id, data.user.id).run();
  return json({ ok: true });
}
