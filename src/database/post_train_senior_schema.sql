-- Senior post training corrections table
-- Stores corrections submitted by seniors during /senior-post-train sessions
-- These are injected into the AI system prompt as authoritative reference examples

CREATE TABLE IF NOT EXISTS post_train_senior_sessions (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  category    TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'active',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  last_post_data JSONB
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_senior_train_active
  ON post_train_senior_sessions(user_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS post_train_corrections (
  id                SERIAL PRIMARY KEY,
  session_id        INTEGER     NOT NULL REFERENCES post_train_senior_sessions(id) ON DELETE CASCADE,
  submitted_by      TEXT        NOT NULL,
  category          TEXT        NOT NULL,
  post_body         TEXT        NOT NULL,
  ai_action         TEXT        NOT NULL,
  correct_action    TEXT        NOT NULL,
  denial_reason     TEXT,
  thought_process   TEXT        NOT NULL,
  active            BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_train_corrections_category
  ON post_train_corrections(category) WHERE active = true;
