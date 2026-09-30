ALTER TABLE customer_return_items ADD COLUMN disposed_quantity INTEGER NOT NULL DEFAULT 0 CHECK(disposed_quantity>=0);
CREATE TABLE customer_return_disposals (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 disposal_code TEXT NOT NULL UNIQUE,
 return_item_id INTEGER NOT NULL REFERENCES customer_return_items(id),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 product_unit_id INTEGER REFERENCES product_units(id),
 original_cost_cents INTEGER NOT NULL CHECK(original_cost_cents>=0),
 reason TEXT NOT NULL,
 created_by TEXT NOT NULL,
 operation_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX customer_return_disposals_item ON customer_return_disposals(return_item_id);
