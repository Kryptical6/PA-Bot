-- Post Training Sessions table
-- Run this once in your Neon database console

CREATE TABLE IF NOT EXISTS post_train_sessions (
  id              SERIAL PRIMARY KEY,
  user_id         TEXT        NOT NULL,
  category        TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'ended'
  score           INT         NOT NULL DEFAULT 0,
  total           INT         NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  last_post_data  JSONB
);

-- Only one active session per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_train_active
  ON post_train_sessions(user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_post_train_user
  ON post_train_sessions(user_id);
