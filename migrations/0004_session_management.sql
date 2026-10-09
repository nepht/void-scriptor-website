PRAGMA foreign_keys = ON;

-- Keep a non-secret reference for session management. The bearer/cookie value
-- remains hashed and is never returned to the UI.
ALTER TABLE sessions ADD COLUMN session_ref TEXT;
ALTER TABLE sessions ADD COLUMN client TEXT NOT NULL DEFAULT 'web';
ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;

UPDATE sessions
   SET session_ref = id_hash
 WHERE session_ref IS NULL OR session_ref = '';

UPDATE sessions
   SET last_seen_at = created_at
 WHERE last_seen_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_ref
  ON sessions(session_ref);

CREATE INDEX IF NOT EXISTS idx_sessions_client
  ON sessions(user_id, client, expires_at);
