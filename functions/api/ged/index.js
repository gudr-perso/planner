import {
  MAX_UPLOAD_BYTES, extOf, isAllowedExt, mimeFor,
  accessClause, extractText, refreshFts,
} from './_helpers.js';

// GET /api/ged  — liste des documents (filtrable ?projet_id=, scopé par client_code)
export async function onRequestGet({ request, env, data }) {
  const url = new URL(request.url);
  const projetId = url.searchParams.get('projet_id');

  let sql = `SELECT id, r2_key, nom, kind, url, mime, ext, taille, projet_id, projet_code,
                    client_code, tags, description, uploaded_by, created_at, updated_at
             FROM ged_files WHERE 1=1`;
  const binds = [];

  if (projetId) { sql += ' AND projet_id = ?'; binds.push(projetId); }
  const acc = accessClause(data.user);
  sql += acc.sql; binds.push(...acc.binds);
  sql += ' ORDER BY created_at DESC';

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return Response.json({ files: results });
}

// POST /api/ged  — upload d'un fichier (multipart/form-data) ou création d'un lien web (JSON)
export async function onRequestPost({ request, env, data }) {
  const contentType = request.headers.get('content-type') || '';

  // — Lien web externe (pas de binaire) —
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    if (!body?.nom || !body?.url) {
      return Response.json({ error: 'Champs requis : nom, url' }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const clientCode = data.user.role === 'admin' ? (body.client_code?.trim() || null) : (data.user.client_code || null);
    const tags = (body.tags || '').trim();
    await env.DB.prepare(
      `INSERT INTO ged_files (id, r2_key, nom, kind, url, ext, projet_id, projet_code, client_code, tags, description, uploaded_by)
       VALUES (?, NULL, ?, 'link', ?, 'html', ?, ?, ?, ?, ?, ?)`
    ).bind(id, body.nom.trim(), body.url.trim(), body.projet_id || null, body.projet_code || null,
           clientCode, tags, body.description || null, data.user.id).run();
    await refreshFts(env.DB, { id, nom: body.nom, tags, contenu: '' });
    return Response.json({ file: { id, nom: body.nom.trim(), kind: 'link', url: body.url.trim() } }, { status: 201 });
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

  const clientCode = data.user.role === 'admin'
    ? (form.get('client_code')?.toString().trim() || null)
    : (data.user.client_code || null);
  const tags = (form.get('tags')?.toString() || '').trim();
  const description = form.get('description')?.toString() || null;
  const projetId = form.get('projet_id')?.toString() || null;
  const projetCode = form.get('projet_code')?.toString() || null;

  try {
    await env.DB.prepare(
      `INSERT INTO ged_files (id, r2_key, nom, kind, mime, ext, taille, projet_id, projet_code, client_code, tags, description, uploaded_by)
       VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, r2Key, filename, mime, ext, file.size, projetId, projetCode, clientCode, tags, description, data.user.id).run();
  } catch (e) {
    // rollback R2 si l'insert D1 échoue
    await env.GED.delete(r2Key).catch(() => {});
    throw e;
  }

  // Extraction de texte + indexation (best-effort, ne bloque pas l'upload)
  const contenu = await extractText(env, file.name, mime, bytes);
  await refreshFts(env.DB, { id, nom: filename, tags, contenu });

  return Response.json({
    file: { id, nom: filename, kind: 'file', ext, mime, taille: file.size, indexed: contenu.length > 0 },
  }, { status: 201 });
}

export const onRequestPut = () => Response.json({ error: 'Méthode non supportée' }, { status: 405 });
