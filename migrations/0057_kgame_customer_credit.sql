CREATE TABLE IF NOT EXISTS customer_credit_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_code TEXT NOT NULL UNIQUE,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents) = 'integer' AND amount_cents != 0),
  reference_type TEXT NOT NULL,
  reference_id INTEGER NOT NULL,
  operation_key TEXT UNIQUE,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_order_cancel ON customer_credit_entries(reference_id) WHERE reference_type = 'ORDER_CANCEL';
CREATE INDEX IF NOT EXISTS idx_credit_partner ON customer_credit_entries(partner_id, id);
ALTER TABLE orders ADD COLUMN cancelled_at TEXT;
ALTER TABLE orders ADD COLUMN cancel_reason TEXT;
