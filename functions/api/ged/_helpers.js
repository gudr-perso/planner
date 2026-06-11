// Helpers partagés pour la GED (Gestion Électronique des Documents).

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 Mo (limite v1)

const EXT_MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  html: 'text/html',
  htm: 'text/html',
};

const ALLOWED_EXT = new Set(Object.keys(EXT_MIME));

export function extOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

export function isAllowedExt(ext) {
  return ALLOWED_EXT.has(ext);
}

export function mimeFor(ext, fallback) {
  return EXT_MIME[ext] || fallback || 'application/octet-stream';
}

export const VISIBILITIES = ['internal', 'public', 'restricted'];

export function isInternalUser(user) {
  return !user?.client_code;
}

// RBAC visibilité-aware. Un interne (sans client_code) voit tout. Un client ne
// voit que les documents `public` ou `restricted` partagés avec son Code tiers
// (jamais les `internal`). `alias` préfixe les colonnes (ex. 'f.' pour un JOIN).
// Renvoie une clause SQL à concaténer (avec ses binds) ou une clause vide.
export function accessClause(user, alias = '') {
  if (isInternalUser(user)) return { sql: '', binds: [] };
  const a = alias;
  return {
    sql: ` AND (${a}visibility = 'public' OR (${a}visibility = 'restricted' AND ${a}id IN (SELECT file_id FROM ged_file_clients WHERE client_code = ?)))`,
    binds: [user.client_code],
  };
}

export function canModify(user, row) {
  if (user?.role === 'admin') return true;
  return row?.uploaded_by && row.uploaded_by === user?.id;
}

// Normalise une liste de Code tiers reçue (array JSON ou CSV) → array nettoyé/unique.
export function parseClients(input) {
  let arr = [];
  if (Array.isArray(input)) arr = input;
  else if (typeof input === 'string' && input.trim()) {
    const s = input.trim();
    if (s.startsWith('[')) { try { arr = JSON.parse(s); } catch { arr = []; } }
    else arr = s.split(',');
  }
  return [...new Set(arr.map(c => String(c).trim()).filter(Boolean))];
}

// Remplace la liste de clients partagés d'un document.
export async function setFileClients(db, fileId, codes) {
  await db.prepare('DELETE FROM ged_file_clients WHERE file_id = ?').bind(fileId).run();
  for (const code of codes) {
    await db.prepare(
      'INSERT OR IGNORE INTO ged_file_clients (file_id, client_code) VALUES (?, ?)'
    ).bind(fileId, code).run();
  }
}

export async function getFileClients(db, fileId) {
  const { results } = await db.prepare(
    'SELECT client_code FROM ged_file_clients WHERE file_id = ? ORDER BY client_code'
  ).bind(fileId).all();
  return results.map(r => r.client_code);
}

// Extraction de texte via Workers AI (toMarkdown). Best-effort : si l'IA n'est
// pas disponible ou échoue, on renvoie une chaîne vide (le doc reste indexé sur
// son nom et ses tags).
export async function extractText(env, filename, mime, bytes) {
  if (!env.AI || typeof env.AI.toMarkdown !== 'function') return '';
  try {
    const blob = new Blob([bytes], { type: mime });
    const res = await env.AI.toMarkdown([{ name: filename, blob }]);
    const items = Array.isArray(res) ? res : [res];
    return items.map(r => r?.data || '').join('\n').trim();
  } catch {
    return '';
  }
}

// Réindexe une ligne dans la table FTS5 (delete + insert).
export async function refreshFts(db, { id, nom, tags, contenu }) {
  await db.prepare('DELETE FROM ged_files_fts WHERE id = ?').bind(id).run();
  await db.prepare(
    'INSERT INTO ged_files_fts (id, nom, tags, contenu) VALUES (?, ?, ?, ?)'
  ).bind(id, nom || '', tags || '', contenu || '').run();
}

export async function deleteFts(db, id) {
  await db.prepare('DELETE FROM ged_files_fts WHERE id = ?').bind(id).run();
}

export function nowSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
