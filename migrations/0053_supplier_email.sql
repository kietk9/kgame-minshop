-- Migration 0053: Add email and updated_at to suppliers table for 100% parity with customers
ALTER TABLE suppliers ADD COLUMN email TEXT;
ALTER TABLE suppliers ADD COLUMN updated_at TEXT;
