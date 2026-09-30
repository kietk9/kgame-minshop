-- A pending refund is an obligation, not a cash movement.
CREATE TABLE IF NOT EXISTS kgame_refund_obligations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (source_type IN ('PURCHASE','ORDER','RETURN')),
  source_id INTEGER NOT NULL,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  flow_type TEXT NOT NULL CHECK (flow_type IN ('IN','OUT')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  settled_cents INTEGER NOT NULL DEFAULT 0 CHECK (settled_cents >= 0 AND settled_cents <= amount_cents),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_type, source_id)
);
CREATE TABLE IF NOT EXISTS kgame_refund_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  obligation_id INTEGER NOT NULL REFERENCES kgame_refund_obligations(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  cash_id INTEGER NOT NULL UNIQUE REFERENCES cash_transactions(id),
  operation_key TEXT NOT NULL UNIQUE REFERENCES kgame_operations(operation_key),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
