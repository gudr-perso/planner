import { verifyPassword } from '../_lib/crypto.js';
import { createSession, sessionCookie } from '../_lib/session.js';

export async function onRequestPost({ request, env }) {
  const { email, password } = await request.json().catch(() => ({}));
  if (!email || !password) {
    return Response.json({ error: 'Email et mot de passe requis' }, { status: 400 });
  }

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE lower(email) = lower(?)'
  ).bind(email.trim()).first();

  // Always run a dummy verify to prevent timing attacks
  const dummyHash = 'pbkdf2:sha256:100000:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  const valid = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, dummyHash).then(() => false);

  if (!user || !valid) {
    if (user) {
      await env.DB.prepare(
        'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?'
      ).bind(user.id).run();
    }
    return Response.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 });
  }

  if (!user.is_active) {
    return Response.json({ error: 'Compte désactivé' }, { status: 403 });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return Response.json({ error: 'Compte temporairement verrouillé' }, { status: 403 });
  }

  const { id: sessionId, expires } = await createSession(env.DB, user.id);
  await env.DB.prepare(
    'UPDATE users SET last_login = ?, failed_login_attempts = 0 WHERE id = ?'
  ).bind(new Date().toISOString(), user.id).run();

  return Response.json(
    { user: { id: user.id, email: user.email, name: user.name, role: user.role, client_code: user.client_code ?? null } },
    { headers: { 'Set-Cookie': sessionCookie(sessionId, expires) } }
  );
}
