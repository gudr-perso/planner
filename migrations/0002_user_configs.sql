CREATE TABLE IF NOT EXISTS user_configs (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  config     TEXT NOT NULL,
  saved_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
