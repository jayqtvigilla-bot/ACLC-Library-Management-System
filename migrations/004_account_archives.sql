CREATE TABLE IF NOT EXISTS account_archives (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  previous_status TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS account_archive_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK(action IN ('archived','restored','deleted')),
  previous_status TEXT,
  performed_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_account_archive_events_user
  ON account_archive_events(user_id, created_at DESC);
