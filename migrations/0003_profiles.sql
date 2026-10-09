PRAGMA foreign_keys = ON;

-- User-controlled profile data is kept separate from provider identities. This
-- lets a person change their public name without changing the GitHub/Google
-- identity used to sign in, and gives QOWNER an explicit privacy boundary.
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  public_handle TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT 'id' CHECK (locale IN ('id', 'en')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  profile_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (profile_visibility IN ('private', 'public')),
  qowner_alias TEXT NOT NULL DEFAULT '',
  qowner_leaderboard_opt_in INTEGER NOT NULL DEFAULT 0
    CHECK (qowner_leaderboard_opt_in IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_public_handle
  ON profiles(public_handle COLLATE NOCASE)
  WHERE public_handle <> '';

CREATE INDEX IF NOT EXISTS idx_profiles_visibility
  ON profiles(profile_visibility, updated_at);
