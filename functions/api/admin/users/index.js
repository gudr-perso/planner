import { hashPassword } from '../../_lib/crypto.js';

export async function onRequestGet({ env, data }) {
  if (data.user.role !== 'admin') {
    return Response.json({ error: 'Accès refusé' }, { status: 403 });
  }
  const { results } = await env.DB.prepare(
    'SELECT id, email, name, role, is_active, created_at, last_login FROM users ORDER BY created_at ASC'
  ).all();
  return Response.json({ users: results });
}

export async function onRequestPost({ request, env, data }) {
  if (data.user.role !== 'admin') {
    return Response.json({ error: 'Accès refusé' }, { status: 403 });
  }
  const { email, name, password, role } = await request.json().catch(() => ({}));
  if (!email || !name || !password) {
    return Response.json({ error: 'Champs requis : email, name, password' }, { status: 400 });
  }
  if (password.length < 10) {
    return Response.json({ error: 'Le mot de passe doit contenir au moins 10 caractères' }, { status: 400 });
  }
  const validRole = role === 'admin' ? 'admin' : 'user';
  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  try {
    await env.DB.prepare(
      'INSERT INTO users (id, email, name, role, password_hash) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, email.trim().toLowerCase(), name.trim(), validRole, hash).run();
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return Response.json({ error: 'Cet email est déjà utilisé' }, { status: 409 });
    }
    throw e;
  }
  return Response.json(
    { user: { id, email: email.trim().toLowerCase(), name: name.trim(), role: validRole, is_active: 1 } },
    { status: 201 }
  );
}
