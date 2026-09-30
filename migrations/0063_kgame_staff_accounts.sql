CREATE TABLE staff_accounts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('VIEWER','CASHIER')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 session_version INTEGER NOT NULL DEFAULT 1,
 failed_attempts INTEGER NOT NULL DEFAULT 0,
 locked_until INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT(datetime('now')),
 updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE staff_sessions (
 token_hash TEXT PRIMARY KEY,
 staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
 session_version INTEGER NOT NULL,
 owner_credential_tag TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX staff_sessions_expiry ON staff_sessions(expires_at);
CREATE TABLE staff_account_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
 action TEXT NOT NULL,
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
