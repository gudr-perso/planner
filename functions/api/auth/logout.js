import { getSessionId, clearCookie } from '../_lib/session.js';

export async function onRequestPost({ request, env }) {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await env.DB.prepare('UPDATE sessions SET is_revoked = 1 WHERE id = ?').bind(sessionId).run();
  }
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearCookie() } });
}
