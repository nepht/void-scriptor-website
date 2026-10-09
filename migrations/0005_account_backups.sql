PRAGMA foreign_keys = ON;

-- An opt-in, compact account snapshot. It intentionally stores only the
-- dashboard's local preferences and metadata summary; file contents, session
-- material, provider tokens, and API keys never belong in this table.
CREATE TABLE IF NOT EXISTS account_backups (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format_version INTEGER NOT NULL DEFAULT 1 CHECK (format_version = 1),
  payload_json TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_backups_updated
  ON account_backups(updated_at);
