import { accessClause } from './_helpers.js';

// Transforme une requête libre en expression FTS5 sûre (préfixe par token, AND implicite).
function toFtsQuery(q) {
  const tokens = (q || '')
    .replace(/["*()^:~-]/g, ' ')       // retire les opérateurs FTS5
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12);
  if (!tokens.length) return '';
  return tokens.map(t => `${t}*`).join(' ');
}

// GET /api/ged/search?q=…&projet_id=…&ext=…
export async function onRequestGet({ request, env, data }) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const projetId = url.searchParams.get('projet_id');
  const ext = url.searchParams.get('ext');

  const match = toFtsQuery(q);
  const acc = accessClause(data.user);

  // Sans terme de recherche : on retombe sur une liste filtrée classique.
  if (!match) {
    let sql = `SELECT id, nom, kind, ext, mime, taille, projet_id, projet_code, tags, description, created_at
               FROM ged_files WHERE 1=1`;
    const binds = [];
    if (projetId) { sql += ' AND projet_id = ?'; binds.push(projetId); }
    if (ext) { sql += ' AND ext = ?'; binds.push(ext); }
    sql += acc.sql; binds.push(...acc.binds);
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return Response.json({ results: results.map(r => ({ ...r, snippet: null })) });
  }

  let sql = `
    SELECT f.id, f.nom, f.kind, f.ext, f.mime, f.taille, f.projet_id, f.projet_code,
           f.tags, f.description, f.created_at,
           snippet(ged_files_fts, 3, '<mark>', '</mark>', '…', 12) AS snippet
    FROM ged_files_fts
    JOIN ged_files f ON f.id = ged_files_fts.id
    WHERE ged_files_fts MATCH ?`;
  const binds = [match];
  if (projetId) { sql += ' AND f.projet_id = ?'; binds.push(projetId); }
  if (ext) { sql += ' AND f.ext = ?'; binds.push(ext); }
  // accessClause cible une colonne "client_code" non préfixée → on réécrit pour l'alias f.
  if (acc.sql) { sql += ' AND f.client_code = ?'; binds.push(...acc.binds); }
  sql += ' ORDER BY bm25(ged_files_fts) LIMIT 100';

  try {
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: 'Recherche invalide', detail: e.message }, { status: 400 });
  }
}
