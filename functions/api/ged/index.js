import {
  MAX_UPLOAD_BYTES, extOf, isAllowedExt, mimeFor,
  accessClause, extractText, refreshFts,
  VISIBILITIES, isInternalUser, parseClients, setFileClients,
} from './_helpers.js';

function normVisibility(v) {
  return VISIBILITIES.includes(v) ? v : 'internal';
}

// GET /api/ged  — liste des documents (filtrable ?projet_id=, scopé selon la visibilité)
export async function onRequestGet({ request, env, data }) {
  const url = new URL(request.url);
  const projetId = url.searchParams.get('projet_id');

  let sql = `SELECT id, r2_key, nom, kind, url, mime, ext, taille, projet_id, projet_code,
                    client_code, visibility, tags, description, uploaded_by, created_at, updated_at,
                    (SELECT group_concat(client_code) FROM ged_file_clients WHERE file_id = ged_files.id) AS clients
             FROM ged_files WHERE 1=1`;
  const binds = [];

  if (projetId) { sql += ' AND projet_id = ?'; binds.push(projetId); }
  const acc = accessClause(data.user);
  sql += acc.sql; binds.push(...acc.binds);
  sql += ' ORDER BY created_at DESC';

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const files = results.map(r => ({ ...r, clients: r.clients ? String(r.clients).split(',') : [] }));
  return Response.json({ files });
}

// POST /api/ged  — upload d'un fichier (multipart/form-data) ou création d'un lien web (JSON)
// Réservé aux internes : les clients sont en lecture seule.
export async function onRequestPost({ request, env, data }) {
  if (!isInternalUser(data.user)) {
    return Response.json({ error: 'Lecture seule : ajout réservé aux administrateurs' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';

  // — Lien web externe (pas de binaire) —
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    if (!body?.nom || !body?.url) {
      return Response.json({ error: 'Champs requis : nom, url' }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const tags = (body.tags || '').trim();
    const visibility = normVisibility(body.visibility);
    const clients = visibility === 'restricted' ? parseClients(body.clients) : [];
    await env.DB.prepare(
      `INSERT INTO ged_files (id, r2_key, nom, kind, url, ext, projet_id, projet_code, client_code, visibility, tags, description, uploaded_by)
       VALUES (?, NULL, ?, 'link', ?, 'html', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, body.nom.trim(), body.url.trim(), body.projet_id || null, body.projet_code || null,
           body.client_code?.trim() || null, visibility, tags, body.description || null, data.user.id).run();
    if (clients.length) await setFileClients(env.DB, id, clients);
    await refreshFts(env.DB, { id, nom: body.nom, tags, contenu: '' });
    return Response.json({ file: { id, nom: body.nom.trim(), kind: 'link', url: body.url.trim(), visibility, clients } }, { status: 201 });
  }

  // — Fichier binaire —
  if (!env.GED) {
    return Response.json({ error: 'Stockage R2 (GED) non configuré' }, { status: 500 });
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Formulaire multipart invalide' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return Response.json({ error: 'Champ "file" requis' }, { status: 400 });
  }
  const filename = (form.get('nom') || file.name || 'document').toString().trim();
  const ext = extOf(file.name) || extOf(filename);
  if (!isAllowedExt(ext)) {
    return Response.json({ error: `Type non autorisé (.${ext}). Acceptés : pdf, docx, pptx, xlsx, html` }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: `Fichier trop volumineux (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} Mo)` }, { status: 413 });
  }

  const id = crypto.randomUUID();
  const r2Key = `ged_${id}/${file.name}`;
  const mime = mimeFor(ext, file.type);
  const bytes = await file.arrayBuffer();

  await env.GED.put(r2Key, bytes, { httpMetadata: { contentType: mime } });

  const tags = (form.get('tags')?.toString() || '').trim();
  const description = form.get('description')?.toString() || null;
  const projetId = form.get('projet_id')?.toString() || null;
  const projetCode = form.get('projet_code')?.toString() || null;
  const clientCode = form.get('client_code')?.toString().trim() || null;
  const visibility = normVisibility(form.get('visibility')?.toString());
  const clients = visibility === 'restricted' ? parseClients(form.get('clients')?.toString()) : [];

  try {
    await env.DB.prepare(
      `INSERT INTO ged_files (id, r2_key, nom, kind, mime, ext, taille, projet_id, projet_code, client_code, visibility, tags, description, uploaded_by)
       VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, r2Key, filename, mime, ext, file.size, projetId, projetCode, clientCode, visibility, tags, description, data.user.id).run();
  } catch (e) {
    // rollback R2 si l'insert D1 échoue
    await env.GED.delete(r2Key).catch(() => {});
    throw e;
  }
  if (clients.length) await setFileClients(env.DB, id, clients);

  // Extraction de texte + indexation (best-effort, ne bloque pas l'upload)
  const contenu = await extractText(env, file.name, mime, bytes);
  await refreshFts(env.DB, { id, nom: filename, tags, contenu });

  return Response.json({
    file: { id, nom: filename, kind: 'file', ext, mime, taille: file.size, visibility, clients, indexed: contenu.length > 0 },
  }, { status: 201 });
}

export const onRequestPut = () => Response.json({ error: 'Méthode non supportée' }, { status: 405 });
