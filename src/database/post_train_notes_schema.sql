-- AI rule notes table for /train-ai note-add command
-- Stores custom notes/overrides injected directly into the AI system prompt
-- Scoped to a specific category, or global (category IS NULL)
-- Run once in your Neon database console

CREATE TABLE IF NOT EXISTS post_train_notes (
  id           SERIAL PRIMARY KEY,
  category     TEXT,            -- NULL means applies to all categories
  note         TEXT NOT NULL,
  added_by     TEXT NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_train_notes_category ON post_train_notes(category) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_post_train_notes_global   ON post_train_notes((category IS NULL)) WHERE active = true;
