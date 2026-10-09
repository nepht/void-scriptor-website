PRAGMA foreign_keys = ON;

-- Short-lived, one-time authorization codes used by native clients. The raw
-- code is never stored; only its SHA-256 digest is persisted.
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expiry
  ON oauth_codes(expires_at);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_user
  ON oauth_codes(user_id);
