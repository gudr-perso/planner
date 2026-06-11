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

function withClientsArray(rows) {
  return rows.map(r => ({ ...r, clients: r.clients ? String(r.clients).split(',') : [] }));
}

// GET /api/ged/search?q=…&projet_id=…&ext=…
export async function onRequestGet({ request, env, data }) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const projetId = url.searchParams.get('projet_id');
  const ext = url.searchParams.get('ext');

  const match = toFtsQuery(q);

  // Sans terme de recherche : on retombe sur une liste filtrée classique.
  if (!match) {
    const acc = accessClause(data.user);
    let sql = `SELECT id, nom, kind, ext, mime, taille, projet_id, projet_code, tags, description, visibility, created_at,
                      (SELECT group_concat(client_code) FROM ged_file_clients WHERE file_id = ged_files.id) AS clients
               FROM ged_files WHERE 1=1`;
    const binds = [];
    if (projetId) { sql += ' AND projet_id = ?'; binds.push(projetId); }
    if (ext) { sql += ' AND ext = ?'; binds.push(ext); }
    sql += acc.sql; binds.push(...acc.binds);
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return Response.json({ results: withClientsArray(results).map(r => ({ ...r, snippet: null })) });
  }

  const acc = accessClause(data.user, 'f.');
  let sql = `
    SELECT f.id, f.nom, f.kind, f.ext, f.mime, f.taille, f.projet_id, f.projet_code,
           f.tags, f.description, f.visibility, f.created_at,
           (SELECT group_concat(client_code) FROM ged_file_clients WHERE file_id = f.id) AS clients,
           snippet(ged_files_fts, 3, '<mark>', '</mark>', '…', 12) AS snippet
    FROM ged_files_fts
    JOIN ged_files f ON f.id = ged_files_fts.id
    WHERE ged_files_fts MATCH ?`;
  const binds = [match];
  if (projetId) { sql += ' AND f.projet_id = ?'; binds.push(projetId); }
  if (ext) { sql += ' AND f.ext = ?'; binds.push(ext); }
  sql += acc.sql; binds.push(...acc.binds);
  sql += ' ORDER BY bm25(ged_files_fts) LIMIT 100';

  try {
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return Response.json({ results: withClientsArray(results) });
  } catch (e) {
    return Response.json({ error: 'Recherche invalide', detail: e.message }, { status: 400 });
  }
}
