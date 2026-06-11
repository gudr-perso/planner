-- GED (Gestion Électronique des Documents) — banque de documents CAP Consulting
-- Binaires stockés dans R2 (bucket cap-ged), métadonnées + index plein texte ici.

CREATE TABLE IF NOT EXISTS ged_files (
  id           TEXT PRIMARY KEY,           -- uuid
  r2_key       TEXT,                        -- clé objet R2 (NULL pour un lien web externe)
  nom          TEXT NOT NULL,               -- nom affiché du document
  kind         TEXT NOT NULL DEFAULT 'file',-- 'file' | 'link'
  url          TEXT,                        -- pour kind='link' : URL externe
  mime         TEXT,
  ext          TEXT,                        -- pdf, docx, pptx, xlsx, html…
  taille       INTEGER NOT NULL DEFAULT 0,  -- octets
  projet_id    TEXT,                        -- id projet Notion (optionnel)
  projet_code  TEXT,                        -- code projet (optionnel)
  client_code  TEXT,                        -- pour RBAC (NULL = visible par tous les internes)
  tags         TEXT,                        -- libellés séparés par des virgules
  description  TEXT,
  uploaded_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ged_files_projet ON ged_files(projet_id);
CREATE INDEX IF NOT EXISTS idx_ged_files_client ON ged_files(client_code);
CREATE INDEX IF NOT EXISTS idx_ged_files_created ON ged_files(created_at);

-- Index plein texte (recherche v1) : nom + tags + texte extrait des fichiers.
-- 'id' non indexé, sert uniquement de clé de jointure vers ged_files.
CREATE VIRTUAL TABLE IF NOT EXISTS ged_files_fts USING fts5(
  id UNINDEXED,
  nom,
  tags,
  contenu,
  tokenize = 'unicode61 remove_diacritics 2'
);
