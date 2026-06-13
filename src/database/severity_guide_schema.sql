-- Severity guide table (editable at runtime via /severity-guide update)
CREATE TABLE IF NOT EXISTS severity_guide (
  id INTEGER PRIMARY KEY DEFAULT 1,
  minor TEXT NOT NULL DEFAULT 'Minor - Small formatting issues, missing non-critical information, minor rule violations with low impact.',
  moderate TEXT NOT NULL DEFAULT 'Moderate - Clear rule violations, missing required proof, incorrect category, invalid payment range.',
  severe TEXT NOT NULL DEFAULT 'Severe - Stolen/AI-generated assets, prohibited services, scripting violations, repeat offences, significant fraud indicators.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO severity_guide (id) VALUES (1) ON CONFLICT DO NOTHING;
