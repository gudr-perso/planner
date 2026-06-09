-- Config globale partagée (une seule ligne, pas de user_id)
CREATE TABLE IF NOT EXISTS shared_config (
  id       INTEGER PRIMARY KEY CHECK (id = 1),  -- sentinel: toujours 1
  config   TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Secrets globaux partagés (ex: token Notion, configurés par l'admin)
CREATE TABLE IF NOT EXISTS shared_secrets (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,  -- chiffré AES-256-GCM, base64url, format: iv.ciphertext
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
