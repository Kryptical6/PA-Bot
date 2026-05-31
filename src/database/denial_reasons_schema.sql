-- Denial reasons table for /manage-denial-reasons command
-- Seeded from the default handbook reasons on first bot startup
-- Run once in your Neon database console

CREATE TABLE IF NOT EXISTS denial_reasons (
  id         SERIAL PRIMARY KEY,
  category   TEXT        NOT NULL,
  label      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  position   INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category, label)
);

CREATE INDEX IF NOT EXISTS idx_denial_reasons_category ON denial_reasons(category);
