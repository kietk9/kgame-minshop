-- Migration 0055: Add status column to cash_transactions
ALTER TABLE cash_transactions ADD COLUMN status TEXT DEFAULT 'ACTIVE';
