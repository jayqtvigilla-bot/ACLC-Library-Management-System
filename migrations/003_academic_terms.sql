CREATE TABLE IF NOT EXISTS academic_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year TEXT NOT NULL,
  term TEXT NOT NULL CHECK(term IN ('first','second','summer')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(academic_year,term)
);
CREATE INDEX IF NOT EXISTS idx_academic_terms_active ON academic_terms(active, starts_at, ends_at);
