export const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY, username TEXT NOT NULL, normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_profile ON sessions(profile_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS records (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, chart_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 1000000),
  acc REAL NOT NULL CHECK(acc BETWEEN 0 AND 100),
  status TEXT NOT NULL CHECK(status IN ('NONE','FC','AP')), updated_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,chart_id)
);
CREATE TABLE IF NOT EXISTS challenges (
  profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  entries TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_charts (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chart_id TEXT NOT NULL, song_id TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL,
  difficulty TEXT NOT NULL, constant REAL NOT NULL, level INTEGER NOT NULL,
  PRIMARY KEY(profile_id,chart_id)
);
CREATE TABLE IF NOT EXISTS artworks (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL, object_key TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,song_id)
);
CREATE TABLE IF NOT EXISTS login_limits (
  key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL
);
`;
