-- Training examples table for /train-ai command
-- Stores real post examples submitted by senior staff to improve AI generation accuracy
-- Run once in your Neon database console

CREATE TABLE IF NOT EXISTS post_train_examples (
  id             SERIAL PRIMARY KEY,
  category       TEXT        NOT NULL,
  correct_action TEXT        NOT NULL,
  post_body      TEXT        NOT NULL,
  reasoning      TEXT        NOT NULL,
  submitted_by   TEXT        NOT NULL,
  active         BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_train_examples_category
  ON post_train_examples(category)
  WHERE active = true;
