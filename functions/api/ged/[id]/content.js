import { accessClause } from '../_helpers.js';

// GET /api/ged/:id/content — stream du binaire depuis R2 (après contrôle d'accès)
export async function onRequestGet({ request, env, data, params }) {
  const acc = accessClause(data.user);
  const row = await env.DB.prepare(
    `SELECT r2_key, nom, mime, kind, url FROM ged_files WHERE id = ?${acc.sql}`
  ).bind(params.id, ...acc.binds).first();

  if (!row) return Response.json({ error: 'Introuvable' }, { status: 404 });

  // Lien web externe : on renvoie une redirection
  if (row.kind === 'link' && row.url) {
    return Response.redirect(row.url, 302);
  }
  if (!row.r2_key || !env.GED) {
    return Response.json({ error: 'Aucun binaire associé' }, { status: 404 });
  }

  const obj = await env.GED.get(row.r2_key);
  if (!obj) return Response.json({ error: 'Fichier absent du stockage' }, { status: 404 });

  const disposition = new URL(request.url).searchParams.get('dl') === '1' ? 'attachment' : 'inline';
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Content-Type', row.mime || obj.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Disposition', `${disposition}; filename="${encodeURIComponent(row.nom)}"`);
  headers.set('Cache-Control', 'private, max-age=300');

  return new Response(obj.body, { headers });
}
