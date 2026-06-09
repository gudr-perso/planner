import { encrypt, decrypt } from '../_lib/encryption.js';

// GET /api/secrets/:key — retourne { exists, updated_at } — jamais la valeur en clair
export async function onRequestGet(ctx) {
  const key = ctx.params.key;
  const row = await ctx.env.DB.prepare(
    'SELECT updated_at FROM shared_secrets WHERE key = ?'
  ).bind(key).first();

  return Response.json({ exists: !!row, updated_at: row?.updated_at ?? null });
}

// PUT /api/secrets/:key — chiffre et stocke le secret (admin uniquement)
export async function onRequestPut(ctx) {
  if (ctx.data.user.role !== 'admin') {
    return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
  }

  const key = ctx.params.key;
  const encKey = ctx.env.SECRETS_ENCRYPTION_KEY;
  if (!encKey) {
    return Response.json({ error: 'Clé de chiffrement non configurée (SECRETS_ENCRYPTION_KEY)' }, { status: 500 });
  }

  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: 'JSON invalide' }, { status: 400 });
  }
  if (!body?.value || typeof body.value !== 'string') {
    return Response.json({ error: 'Champ "value" requis' }, { status: 400 });
  }

  const encrypted = await encrypt(body.value, encKey);
  const updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

  await ctx.env.DB.prepare(
    `INSERT INTO shared_secrets (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, encrypted, updatedAt).run();

  return Response.json({ ok: true, updated_at: updatedAt });
}

// DELETE /api/secrets/:key (admin uniquement)
export async function onRequestDelete(ctx) {
  if (ctx.data.user.role !== 'admin') {
    return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
  }

  const key = ctx.params.key;
  await ctx.env.DB.prepare(
    'DELETE FROM shared_secrets WHERE key = ?'
  ).bind(key).run();
  return Response.json({ ok: true });
}

// Helper interne — utilisé par le proxy Notion pour lire le token déchiffré
export async function getDecryptedSecret(db, encKey, key) {
  const row = await db.prepare(
    'SELECT value FROM shared_secrets WHERE key = ?'
  ).bind(key).first();
  if (!row) return null;
  return decrypt(row.value, encKey);
}
