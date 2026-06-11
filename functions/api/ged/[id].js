import { accessClause, canModify, refreshFts, deleteFts, nowSql } from './_helpers.js';

async function loadVisible(env, user, id) {
  const acc = accessClause(user);
  const row = await env.DB.prepare(
    `SELECT * FROM ged_files WHERE id = ?${acc.sql}`
  ).bind(id, ...acc.binds).first();
  return row;
}

// GET /api/ged/:id — métadonnées
export async function onRequestGet({ env, data, params }) {
  const row = await loadVisible(env, data.user, params.id);
  if (!row) return Response.json({ error: 'Introuvable' }, { status: 404 });
  return Response.json({ file: row });
}

// PUT /api/ged/:id — renommer / tags / description / rattachement projet
export async function onRequestPut({ request, env, data, params }) {
  const row = await loadVisible(env, data.user, params.id);
  if (!row) return Response.json({ error: 'Introuvable' }, { status: 404 });
  if (!canModify(data.user, row)) {
    return Response.json({ error: 'Accès refusé' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const nom = body.nom !== undefined ? String(body.nom).trim() : row.nom;
  const tags = body.tags !== undefined ? String(body.tags).trim() : row.tags;
  const description = body.description !== undefined ? body.description : row.description;
  const projetId = body.projet_id !== undefined ? body.projet_id : row.projet_id;
  const projetCode = body.projet_code !== undefined ? body.projet_code : row.projet_code;

  await env.DB.prepare(
    `UPDATE ged_files SET nom = ?, tags = ?, description = ?, projet_id = ?, projet_code = ?, updated_at = ?
     WHERE id = ?`
  ).bind(nom, tags, description, projetId, projetCode, nowSql(), row.id).run();

  // Réindexe nom + tags en conservant le contenu déjà extrait
  const fts = await env.DB.prepare('SELECT contenu FROM ged_files_fts WHERE id = ?').bind(row.id).first();
  await refreshFts(env.DB, { id: row.id, nom, tags, contenu: fts?.contenu || '' });

  return Response.json({ ok: true });
}

// DELETE /api/ged/:id — supprime binaire R2 + métadonnées + index
export async function onRequestDelete({ env, data, params }) {
  const row = await loadVisible(env, data.user, params.id);
  if (!row) return Response.json({ error: 'Introuvable' }, { status: 404 });
  if (!canModify(data.user, row)) {
    return Response.json({ error: 'Accès refusé' }, { status: 403 });
  }
  if (row.r2_key && env.GED) {
    await env.GED.delete(row.r2_key).catch(() => {});
  }
  await env.DB.prepare('DELETE FROM ged_files WHERE id = ?').bind(row.id).run();
  await deleteFts(env.DB, row.id);
  return Response.json({ ok: true });
}
