import { verifyPassword, hashPassword } from '../_lib/crypto.js';

export async function onRequestPost({ request, env, data }) {
  const { current_password, new_password } = await request.json().catch(() => ({}));
  if (!current_password || !new_password) {
    return Response.json({ error: 'Champs requis' }, { status: 400 });
  }
  if (new_password.length < 10) {
    return Response.json({ error: 'Le mot de passe doit contenir au moins 10 caractères' }, { status: 400 });
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(data.user.id).first();
  const valid = await verifyPassword(current_password, user.password_hash);
  if (!valid) {
    return Response.json({ error: 'Mot de passe actuel incorrect' }, { status: 401 });
  }

  const newHash = await hashPassword(new_password);
  await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(newHash, new Date().toISOString(), data.user.id).run();

  // Revoke all other sessions
  await env.DB.prepare('UPDATE sessions SET is_revoked = 1 WHERE user_id = ? AND id != ?')
    .bind(data.user.id, data.sessionId).run();

  return Response.json({ ok: true });
}
