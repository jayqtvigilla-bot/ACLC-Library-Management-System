PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','teacher','librarian','administrator')),
  status TEXT NOT NULL DEFAULT 'pending_email' CHECK(status IN ('pending_email','pending_approval','approved','rejected','suspended')),
  name TEXT NOT NULL,
  school_number TEXT,
  digital_id TEXT UNIQUE,
  standing TEXT NOT NULL DEFAULT 'GOOD_STANDING' CHECK(standing IN ('GOOD_STANDING','WARNING','TEMPORARY_RESTRICTION','UNDER_REVIEW')),
  replacement_count INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS student_profiles (user_id INTEGER PRIMARY KEY REFERENCES users(id), program TEXT, year_level TEXT);
CREATE TABLE IF NOT EXISTS staff_profiles (user_id INTEGER PRIMARY KEY REFERENCES users(id), employee_number TEXT, department TEXT);
CREATE TABLE IF NOT EXISTS user_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  credential TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'personal',
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS credential_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  credential_id INTEGER REFERENCES user_credentials(id),
  event_type TEXT NOT NULL,
  performed_by INTEGER REFERENCES users(id),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  isbn TEXT UNIQUE,
  category TEXT,
  total_copies INTEGER NOT NULL DEFAULT 0,
  available_copies INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS book_copies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id),
  copy_code TEXT UNIQUE NOT NULL,
  condition TEXT NOT NULL DEFAULT 'good',
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','reserved','borrowed','maintenance','lost'))
);
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  book_id INTEGER NOT NULL REFERENCES books(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','approved','cancelled','expired')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id,book_id,status)
);
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','returned','overdue','lost')),
  checkout_staff_id INTEGER REFERENCES users(id),
  due_at TEXT NOT NULL,
  returned_at TEXT,
  renewals INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS loan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL REFERENCES loans(id),
  copy_id INTEGER NOT NULL REFERENCES book_copies(id),
  status TEXT NOT NULL DEFAULT 'borrowed' CHECK(status IN ('borrowed','returned','lost','damaged')),
  returned_at TEXT
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  gate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  credential TEXT,
  authorized INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS passage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  gate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  sensor_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS gates (
  gate_id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK(direction IN ('entry','exit')),
  status TEXT NOT NULL DEFAULT 'offline',
  maintenance INTEGER NOT NULL DEFAULT 0,
  last_event_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO gates(gate_id,direction) VALUES ('GATE-ENTRY','entry'),('GATE-EXIT','exit');

CREATE TABLE IF NOT EXISTS condition_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_item_id INTEGER REFERENCES loan_items(id),
  copy_id INTEGER NOT NULL REFERENCES book_copies(id),
  staff_id INTEGER NOT NULL REFERENCES users(id),
  condition TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS damage_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  copy_id INTEGER NOT NULL REFERENCES book_copies(id),
  reported_by INTEGER NOT NULL REFERENCES users(id),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'under_review' CHECK(status IN ('under_review','confirmed','disputed','resolved')),
  evidence TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS penalties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','approved','paid','waived','disputed')),
  source_type TEXT,
  source_id INTEGER,
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  penalty_id INTEGER NOT NULL REFERENCES penalties(id),
  verified_by INTEGER REFERENCES users(id),
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS user_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  record_type TEXT NOT NULL,
  description TEXT NOT NULL,
  related_transaction TEXT,
  evidence TEXT,
  responsible_staff_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'under_review',
  resolution TEXT,
  review_at TEXT,
  expiration_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS standing_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  old_standing TEXT NOT NULL,
  new_standing TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  event_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS notification_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS hardware_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO system_settings(key,value) VALUES
 ('id_prefix','ACLC-{{year}}-'),
 ('teacher_borrow_limit','5'),
 ('student_borrow_limit','3'),
 ('eligible_standing_recovery_days','30');
