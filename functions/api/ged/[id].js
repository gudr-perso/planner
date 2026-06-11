import {
  accessClause, canModify, refreshFts, deleteFts, nowSql,
  VISIBILITIES, isInternalUser, parseClients, setFileClients, getFileClients,
} from './_helpers.js';

async function loadVisible(env, user, id) {
  const acc = accessClause(user);
  const row = await env.DB.prepare(
    `SELECT * FROM ged_files WHERE id = ?${acc.sql}`
  ).bind(id, ...acc.binds).first();
  return row;
}

// GET /api/ged/:id — métadonnées (+ liste des clients partagés)
export async function onRequestGet({ env, data, params }) {
  const row = await loadVisible(env, data.user, params.id);
  if (!row) return Response.json({ error: 'Introuvable' }, { status: 404 });
  const clients = await getFileClients(env.DB, row.id);
  return Response.json({ file: { ...row, clients } });
}

// PUT /api/ged/:id — nom / description / tags / visibilité / partage clients / rattachement projet
export async function onRequestPut({ request, env, data, params }) {
  if (!isInternalUser(data.user)) {
    return Response.json({ error: 'Lecture seule' }, { status: 403 });
  }
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
  const visibility = body.visibility !== undefined && VISIBILITIES.includes(body.visibility)
    ? body.visibility : row.visibility;

  await env.DB.prepare(
    `UPDATE ged_files SET nom = ?, tags = ?, description = ?, projet_id = ?, projet_code = ?, visibility = ?, updated_at = ?
     WHERE id = ?`
  ).bind(nom, tags, description, projetId, projetCode, visibility, nowSql(), row.id).run();

  // Synchronise la liste de partage : remplacée si fournie, vidée si la visibilité n'est plus "restricted".
  if (visibility !== 'restricted') {
    await setFileClients(env.DB, row.id, []);
  } else if (body.clients !== undefined) {
    await setFileClients(env.DB, row.id, parseClients(body.clients));
  }

  // Réindexe nom + tags en conservant le contenu déjà extrait
  const fts = await env.DB.prepare('SELECT contenu FROM ged_files_fts WHERE id = ?').bind(row.id).first();
  await refreshFts(env.DB, { id: row.id, nom, tags, contenu: fts?.contenu || '' });

  const clients = await getFileClients(env.DB, row.id);
  return Response.json({ ok: true, visibility, clients });
}

// DELETE /api/ged/:id — supprime binaire R2 + métadonnées + index (+ partages via cascade)
export async function onRequestDelete({ env, data, params }) {
  if (!isInternalUser(data.user)) {
    return Response.json({ error: 'Lecture seule' }, { status: 403 });
  }
  const row = await loadVisible(env, data.user, params.id);
  if (!row) return Response.json({ error: 'Introuvable' }, { status: 404 });
  if (!canModify(data.user, row)) {
    return Response.json({ error: 'Accès refusé' }, { status: 403 });
  }
  if (row.r2_key && env.GED) {
    await env.GED.delete(row.r2_key).catch(() => {});
  }
  await env.DB.prepare('DELETE FROM ged_files WHERE id = ?').bind(row.id).run();
  await env.DB.prepare('DELETE FROM ged_file_clients WHERE file_id = ?').bind(row.id).run();
  await deleteFts(env.DB, row.id);
  return Response.json({ ok: true });
}
