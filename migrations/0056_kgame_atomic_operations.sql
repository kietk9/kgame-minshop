-- Receipts serialize retries of a business operation; no historical rows change.
CREATE TABLE IF NOT EXISTS kgame_operations (
  operation_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  order_id INTEGER,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE payments ADD COLUMN operation_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_operation ON payments(operation_key) WHERE operation_key IS NOT NULL;
ALTER TABLE cash_transactions ADD COLUMN operation_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_operation ON cash_transactions(operation_key) WHERE operation_key IS NOT NULL;
ALTER TABLE order_lines ADD COLUMN unit_cost_cents INTEGER NOT NULL DEFAULT 0;
