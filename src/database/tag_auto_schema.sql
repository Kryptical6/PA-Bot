-- Auto-send tag to role system
CREATE TABLE IF NOT EXISTS tag_role_auto (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,         -- human-readable unique ID e.g. "TRA-001"
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,
  added_by TEXT NOT NULL,
  replace_existing BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  deactivated_by TEXT
);

-- Tracks who has already received a tag via a specific auto-send session
CREATE TABLE IF NOT EXISTS tag_role_sent (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES tag_role_auto(session_id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL,
  role_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, user_id)             -- one send per user per session
);
