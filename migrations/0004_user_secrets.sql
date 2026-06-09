-- Stockage chiffré des secrets utilisateur (ex: token Notion)
CREATE TABLE user_secrets (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,  -- chiffré AES-256-GCM, base64url, format: iv.ciphertext
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);
