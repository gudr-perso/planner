import { hashPassword } from './_lib/crypto.js';
import { createSession, sessionCookie } from './_lib/session.js';

// GET /api/setup/status — public, returns whether setup is needed
export async function onRequestGet({ env }) {
  const row = await env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first();
  return Response.json({ hasUsers: row.cnt > 0 });
}

// POST /api/setup — create first admin (only works when no users exist)
export async function onRequestPost({ request, env }) {
  const row = await env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first();
  if (row.cnt > 0) {
    return Response.json({ error: 'Configuration déjà effectuée' }, { status: 403 });
  }

  const { name, email, password } = await request.json().catch(() => ({}));
  if (!name || !email || !password) {
    return Response.json({ error: 'Tous les champs sont requis' }, { status: 400 });
  }
  if (password.length < 10) {
    return Response.json({ error: 'Le mot de passe doit contenir au moins 10 caractères' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  await env.DB.prepare(
    'INSERT INTO users (id, email, name, role, password_hash) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, email.trim().toLowerCase(), name.trim(), 'admin', hash).run();

  const { id: sessionId, expires } = await createSession(env.DB, id);
  return Response.json(
    { user: { id, email: email.trim().toLowerCase(), name: name.trim(), role: 'admin' } },
    { status: 201, headers: { 'Set-Cookie': sessionCookie(sessionId, expires) } }
  );
}
