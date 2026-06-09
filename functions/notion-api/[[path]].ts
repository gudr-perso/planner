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

  // Fetch and decrypt the Notion token for this user
  const row = await env.DB.prepare(
    'SELECT value FROM user_secrets WHERE user_id = ? AND key = ?'
  ).bind(user.id, 'notion_token').first<{ value: string }>();

  if (!row) {
    const h = new Headers(CORS);
    return new Response(JSON.stringify({ error: 'Token Notion non configuré' }), { status: 403, headers: h });
  }

  const token = await decrypt(row.value, env.SECRETS_ENCRYPTION_KEY);

  const url = new URL(request.url);
  const notionPath = url.pathname.replace(/^\/notion-api/, '');
  const notionUrl = `https://api.notion.com/v1${notionPath}${url.search}`;

  const upstream = new Headers();
  upstream.set('Authorization', `Bearer ${token}`);
  const ct = request.headers.get('Content-Type');
  if (ct) upstream.set('Content-Type', ct);
  const nv = request.headers.get('Notion-Version');
  upstream.set('Notion-Version', nv ?? '2022-06-28');

  const res = await fetch(notionUrl, {
    method: request.method,
    headers: upstream,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  });

  const responseHeaders = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) responseHeaders.set(k, v);

  return new Response(res.body, { status: res.status, headers: responseHeaders });
};
