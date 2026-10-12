PRAGMA foreign_keys = ON;

-- A public, opt-in release-interest list for QOWNER. Email is normalized by
-- the Worker before insertion, and no account/provider identity is attached.
-- The list is intentionally separate from website accounts so joining it does
-- not create an account or reveal whether an address is already present.
CREATE TABLE IF NOT EXISTS qowner_waitlist (
  email TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
  source TEXT NOT NULL DEFAULT 'quiz'
    CHECK (source IN ('quiz', 'homepage')),
  consented_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qowner_waitlist_updated
  ON qowner_waitlist(updated_at);
