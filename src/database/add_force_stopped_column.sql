-- Add force_stopped column to assessment_results
-- Run once in your Neon database console

ALTER TABLE assessment_results
  ADD COLUMN IF NOT EXISTS force_stopped BOOLEAN NOT NULL DEFAULT false;
