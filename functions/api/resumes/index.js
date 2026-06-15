// functions/api/resumes/index.js  —  GET (list)  |  POST (create/upsert)
import { json, error } from '../../lib/response.js';
import { uuid } from '../../lib/auth.js';
import { entitlementsFor, MAX_IDENTITIES } from '../../lib/entitlements.js';

export async function onRequestGet(context) {
  const { env, data } = context;
  if (!data.user) return error('Unauthorized', 401);
  const { results } = await env.DB.prepare(
    'SELECT id, title, template, data, updated_at, created_at FROM resumes WHERE user_id = ? ORDER BY updated_at DESC'
  ).bind(data.user.id).all();
  return json({ ok: true, resumes: results || [] });
}

// Pull the candidate name out of a stored resume blob (client saves it at data.name).
function candidateName(d) {
  try {
    const o = typeof d === 'string' ? JSON.parse(d) : d;
    return ((o && o.name) || '').trim().toLowerCase();
  } catch { return ''; }
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

  const ent = entitlementsFor(data.user);

  // Existing resumes for this account (used for both caps).
  const existing = await env.DB.prepare('SELECT id, data FROM resumes WHERE user_id = ?')
    .bind(data.user.id).all();
  const rows = existing.results || [];
  const isUpdate = rows.some((r) => r.id === id);

  // 1) Resume-count cap — only blocks creating a brand-new resume past the limit.
  if (!isUpdate && ent.maxResumes !== Infinity && rows.length >= ent.maxResumes) {
    return error(
      `Your plan includes ${ent.maxResumes} resume${ent.maxResumes === 1 ? '' : 's'}. Upgrade to Pro for unlimited resumes.`,
      403, { code: 'resume_limit' }
    );
  }

  // 2) Unique-identity cap — distinct candidate names across the account <= MAX_IDENTITIES.
  const newName = candidateName(body.data);
  if (newName) {
    const names = new Set(
      rows.filter((r) => r.id !== id).map((r) => candidateName(r.data)).filter(Boolean)
    );
    names.add(newName);
    if (names.size > MAX_IDENTITIES) {
      return error(
        `This account has reached its limit of ${MAX_IDENTITIES} unique candidate names. Remove a resume or use a separate account.`,
        403, { code: 'identity_limit' }
      );
    }
  }

  // Upsert so the client can sync the same id.
  await env.DB.prepare(
    `INSERT INTO resumes (id, user_id, title, template, data) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, template=excluded.template,
       data=excluded.data, updated_at=datetime('now')
     WHERE resumes.user_id = ?`
  ).bind(id, data.user.id, title, template, doc, data.user.id).run();

  return json({ ok: true, id });
}
