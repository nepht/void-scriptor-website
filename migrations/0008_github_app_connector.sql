-- GitHub App installation material is encrypted with the Worker session secret.
-- The private key itself remains a Cloudflare Pages secret and never enters D1.
CREATE TABLE IF NOT EXISTS github_app_connections (
  user_id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  account_login TEXT,
  repository_selection TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_github_app_connections_installation
  ON github_app_connections(installation_id);

CREATE TABLE IF NOT EXISTS github_app_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_app_audit_user_created
  ON github_app_audit_events(user_id, created_at DESC);
