import { getSessionId, validateSession } from './_lib/session.js';

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/setup',
  '/api/setup/status',
];

export async function onRequest(ctx) {
  const { request, next, env } = ctx;
  const url = new URL(request.url);

  if (PUBLIC_PATHS.some(p => url.pathname === p || url.pathname.startsWith(p + '/'))) {
    return next();
  }

  const sessionId = getSessionId(request);
  const user = await validateSession(env.DB, sessionId);
  if (!user) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 });
  }

  ctx.data.user = user;
  ctx.data.sessionId = sessionId;
  return next();
}
