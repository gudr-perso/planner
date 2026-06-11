-- GED itération 2 — niveaux de visibilité + partage par client (Code tiers)
-- ⚠️ ALTER TABLE ADD COLUMN n'est PAS idempotent : appliquer ce fichier UNE SEULE FOIS
-- (wrangler d1 execute ... --file, ou Console D1). Ne pas utiliser `migrations apply`.

-- internal = admins/internes uniquement ; public = tous les clients ; restricted = clients désignés
ALTER TABLE ged_files ADD COLUMN visibility TEXT NOT NULL DEFAULT 'internal';

-- Partage N–N : un document restreint est visible par les Code tiers listés ici.
CREATE TABLE IF NOT EXISTS ged_file_clients (
  file_id     TEXT NOT NULL REFERENCES ged_files(id) ON DELETE CASCADE,
  client_code TEXT NOT NULL,
  PRIMARY KEY (file_id, client_code)
);

CREATE INDEX IF NOT EXISTS idx_ged_file_clients_code ON ged_file_clients(client_code);
