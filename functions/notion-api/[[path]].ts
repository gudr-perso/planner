// @ts-ignore
import { getSessionId, validateSession } from '../api/_lib/session.js';
// @ts-ignore
import { decrypt } from '../api/_lib/encryption.js';

interface Env {
  DB: D1Database;
  SECRETS_ENCRYPTION_KEY: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Notion-Version',
};

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Validate session — token is server-side only
  const sessionId = getSessionId(request);
  const user = await validateSession(env.DB, sessionId);
  if (!user) {
    const h = new Headers(CORS);
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: h });
  }

  // Fetch and decrypt the shared Notion token (configured by admin, used by all)
  const row = await env.DB.prepare(
    'SELECT value FROM shared_secrets WHERE key = ?'
  ).bind('notion_token').first<{ value: string }>();

  if (!row) {
    const h = new Headers(CORS);
    return new Response(JSON.stringify({ error: 'Token Notion non configuré (demandez à l\'administrateur)' }), { status: 403, headers: h });
  }

  // Déchiffrement du token — ne doit jamais faire planter l'app (500 brut).
  // En cas d'échec (clé manquante/incorrecte), on renvoie une erreur propre :
  // le reste du site reste utilisable et l'admin peut re-saisir le token.
  let token: string;
  try {
    token = await decrypt(row.value, env.SECRETS_ENCRYPTION_KEY);
  } catch {
    const h = new Headers(CORS);
    return new Response(
      JSON.stringify({ error: 'Token Notion illisible (clé de chiffrement indisponible). Reconfigurez le token dans les Paramètres.' }),
      { status: 502, headers: h },
    );
  }

  const url = new URL(request.url);
  const notionPath = url.pathname.replace(/^\/notion-api/, '');
  const notionUrl = `https://api.notion.com/v1${notionPath}${url.search}`;

  const upstream = new Headers();
  upstream.set('Authorization', `Bearer ${token}`);
  const ct = request.headers.get('Content-Type');
  if (ct) upstream.set('Content-Type', ct);
  const nv = request.headers.get('Notion-Version');
  upstream.set('Notion-Version', nv ?? '2022-06-28');

  let res: Response;
  try {
    res = await fetch(notionUrl, {
      method: request.method,
      headers: upstream,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
  } catch {
    const h = new Headers(CORS);
    return new Response(
      JSON.stringify({ error: 'Service Notion injoignable. Réessayez plus tard.' }),
      { status: 502, headers: h },
    );
  }

  const responseHeaders = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) responseHeaders.set(k, v);

  return new Response(res.body, { status: res.status, headers: responseHeaders });
};
