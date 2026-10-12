PRAGMA foreign_keys = ON;

-- The refresh token is encrypted before it reaches this table. Access tokens
-- are short-lived and are never persisted. The Drive file id is only a
-- reference to the app-created backup file; disconnecting leaves the remote
-- file untouched so the user can manage it from Drive.
CREATE TABLE IF NOT EXISTS google_drive_connections (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_ciphertext TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  drive_file_id TEXT,
  connected_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_backup_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_google_drive_connections_backup
  ON google_drive_connections(last_backup_at);
