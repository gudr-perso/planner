export async function onRequestDelete({ params, env, data }) {
  if (data.user.role !== 'admin') return Response.json({ error: 'Accès refusé' }, { status: 403 });
  await env.DB.prepare('UPDATE sessions SET is_revoked = 1 WHERE user_id = ?').bind(params.id).run();
  return Response.json({ ok: true });
}
