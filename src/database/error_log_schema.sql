-- Error log table
CREATE TABLE IF NOT EXISTS error_log (
  id         SERIAL PRIMARY KEY,
  code       TEXT NOT NULL,
  command    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  guild_id   TEXT,
  message    TEXT NOT NULL,
  stack      TEXT,
  reported   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS error_log_code ON error_log (code);
CREATE INDEX IF NOT EXISTS error_log_created ON error_log (created_at DESC);
