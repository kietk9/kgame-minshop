-- Passwords assigned before this migration also require a personal replacement.
ALTER TABLE staff_accounts ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0,1));
