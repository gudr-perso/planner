export async function onRequestGet({ params, env, data }) {
  if (data.user.role !== 'admin') return Response.json({ error: 'Accès refusé' }, { status: 403 });
  const user = await env.DB.prepare(
    'SELECT id, email, name, role, is_active, client_code, created_at, last_login, failed_login_attempts FROM users WHERE id = ?'
  ).bind(params.id).first();
  if (!user) return Response.json({ error: 'Utilisateur introuvable' }, { status: 404 });
  const { results: sessions } = await env.DB.prepare(
    'SELECT id, created_at, last_seen, expires_at, is_revoked FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
  ).bind(params.id).all();
  return Response.json({ user, sessions });
}

export async function onRequestPut({ params, request, env, data }) {
  if (data.user.role !== 'admin') return Response.json({ error: 'Accès refusé' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(params.id).first();
  if (!user) return Response.json({ error: 'Utilisateur introuvable' }, { status: 404 });

  if (params.id === data.user.id) {
    if (body.role === 'user') return Response.json({ error: 'Impossible de se rétrograder soi-même' }, { status: 400 });
    if (body.is_active === 0) return Response.json({ error: 'Impossible de se désactiver soi-même' }, { status: 400 });
  }

  const name = body.name ?? user.name;
  const role = body.role ?? user.role;
  const is_active = body.is_active ?? user.is_active;
  const client_code = Object.prototype.hasOwnProperty.call(body, 'client_code')
    ? (body.client_code?.trim() || null)
    : user.client_code;

  await env.DB.prepare(
    'UPDATE users SET name = ?, role = ?, is_active = ?, client_code = ?, updated_at = ? WHERE id = ?'
  ).bind(name, role, is_active, client_code, new Date().toISOString(), params.id).run();

  if (is_active === 0 && user.is_active !== 0) {
    await env.DB.prepare('UPDATE sessions SET is_revoked = 1 WHERE user_id = ?').bind(params.id).run();
  }

  return Response.json({ ok: true });
}

export async function onRequestDelete({ params, env, data }) {
  if (data.user.role !== 'admin') return Response.json({ error: 'Accès refusé' }, { status: 403 });
  if (params.id === data.user.id) return Response.json({ error: 'Impossible de supprimer son propre compte' }, { status: 400 });
  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(params.id).first();
  if (!user) return Response.json({ error: 'Utilisateur introuvable' }, { status: 404 });
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(params.id).run();
  return Response.json({ ok: true });
}
