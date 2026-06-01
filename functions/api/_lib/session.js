const COOKIE_NAME = 'planner_session';
const SESSION_HOURS = 8;

export function getSessionId(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export async function createSession(db, userId) {
  const id = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_HOURS * 3600 * 1000);
  await db.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, userId, now.toISOString(), expires.toISOString(), now.toISOString()).run();
  return { id, expires };
}

export function sessionCookie(id, expires) {
  const maxAge = Math.floor((expires.getTime() - Date.now()) / 1000);
  return `${COOKIE_NAME}=${id}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export async function validateSession(db, sessionId) {
  if (!sessionId) return null;
  const row = await db.prepare(`
    SELECT s.id, s.user_id, s.expires_at, s.is_revoked,
           u.id as uid, u.email, u.name, u.role, u.is_active
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).bind(sessionId).first();
  if (!row) return null;
  if (row.is_revoked) return null;
  if (new Date(row.expires_at) < new Date()) return null;
  if (!row.is_active) return null;
  // Update last_seen non-blocking
  db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?')
    .bind(new Date().toISOString(), sessionId).run().catch(() => {});
  return { id: row.uid, email: row.email, name: row.name, role: row.role };
}
