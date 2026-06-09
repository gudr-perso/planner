import { encrypt, decrypt } from '../_lib/encryption.js';

// GET /api/secrets/:key — returns { exists, updated_at } — never the plaintext value
export async function onRequestGet(ctx) {
  const userId = ctx.data.user.id;
  const key = ctx.params.key;
  const row = await ctx.env.DB.prepare(
    'SELECT updated_at FROM user_secrets WHERE user_id = ? AND key = ?'
  ).bind(userId, key).first();

  return Response.json({ exists: !!row, updated_at: row?.updated_at ?? null });
}

// PUT /api/secrets/:key — encrypts and stores the secret
export async function onRequestPut(ctx) {
  const userId = ctx.data.user.id;
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
    `INSERT INTO user_secrets (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(userId, key, encrypted, updatedAt).run();

  return Response.json({ ok: true, updated_at: updatedAt });
}

// DELETE /api/secrets/:key
export async function onRequestDelete(ctx) {
  const userId = ctx.data.user.id;
  const key = ctx.params.key;
  await ctx.env.DB.prepare(
    'DELETE FROM user_secrets WHERE user_id = ? AND key = ?'
  ).bind(userId, key).run();
  return Response.json({ ok: true });
}

// Internal helper — used by the Notion proxy to read the decrypted token
export async function getDecryptedSecret(db, encKey, userId, key) {
  const row = await db.prepare(
    'SELECT value FROM user_secrets WHERE user_id = ? AND key = ?'
  ).bind(userId, key).first();
  if (!row) return null;
  return decrypt(row.value, encKey);
}
