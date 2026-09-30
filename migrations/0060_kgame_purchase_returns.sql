ALTER TABLE purchase_receipts ADD COLUMN returned_amount_cents INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_code TEXT NOT NULL UNIQUE,
  receipt_id INTEGER NOT NULL REFERENCES purchase_receipts(id),
  supplier_id INTEGER NOT NULL REFERENCES partners(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  reason TEXT NOT NULL,
  operation_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS purchase_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES purchase_returns(id),
  purchase_item_id INTEGER NOT NULL REFERENCES purchase_items(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  stock_cost_cents INTEGER NOT NULL CHECK(stock_cost_cents >= 0),
  UNIQUE(return_id,purchase_item_id)
);
CREATE INDEX IF NOT EXISTS purchase_return_items_source ON purchase_return_items(purchase_item_id);
