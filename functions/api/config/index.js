// Config globale partagée — lecture pour tous, écriture admin uniquement
export async function onRequestGet(ctx) {
  const row = await ctx.env.DB.prepare(
    'SELECT config, saved_at FROM shared_config WHERE id = 1'
  ).first();

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
  if (ctx.data.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Réservé aux administrateurs' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
    `INSERT INTO shared_config (id, config, saved_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET config = excluded.config, saved_at = excluded.saved_at`
  ).bind(configJson, savedAt).run();

  return new Response(JSON.stringify({ ok: true, saved_at: savedAt }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
