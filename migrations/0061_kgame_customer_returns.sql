ALTER TABLE orders ADD COLUMN returned_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN returned_credit_cents INTEGER NOT NULL DEFAULT 0;
CREATE TABLE customer_returns (
 id INTEGER PRIMARY KEY AUTOINCREMENT, return_code TEXT NOT NULL UNIQUE,
 order_id INTEGER NOT NULL REFERENCES orders(id), customer_id INTEGER NOT NULL REFERENCES partners(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0), reason TEXT NOT NULL, operation_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE customer_return_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT, return_id INTEGER NOT NULL REFERENCES customer_returns(id),
 order_line_id INTEGER NOT NULL REFERENCES order_lines(id), quantity INTEGER NOT NULL CHECK(quantity>0),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
 inspection_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(inspection_status IN ('PENDING','RESTOCKED','REJECTED')),
 UNIQUE(return_id,order_line_id)
);
CREATE INDEX customer_return_items_source ON customer_return_items(order_line_id);
