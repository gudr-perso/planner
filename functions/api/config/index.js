export async function onRequestGet(ctx) {
  const userId = ctx.data.user.id;
  const row = await ctx.env.DB.prepare(
    'SELECT config, saved_at FROM user_configs WHERE user_id = ?'
  ).bind(userId).first();

  if (!row) {
    return new Response(JSON.stringify({ error: 'Aucune config sauvegardée' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ config: JSON.parse(row.config), saved_at: row.saved_at }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPut(ctx) {
  const userId = ctx.data.user.id;
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const configJson = JSON.stringify(body);
  const savedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

  await ctx.env.DB.prepare(
    `INSERT INTO user_configs (user_id, config, saved_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET config = excluded.config, saved_at = excluded.saved_at`
  ).bind(userId, configJson, savedAt).run();

  return new Response(JSON.stringify({ ok: true, saved_at: savedAt }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
