ALTER TABLE customer_return_items ADD COLUMN restocked_quantity INTEGER NOT NULL DEFAULT 0 CHECK(restocked_quantity>=0);
ALTER TABLE customer_return_items ADD COLUMN rejected_quantity INTEGER NOT NULL DEFAULT 0 CHECK(rejected_quantity>=0);
ALTER TABLE customer_return_items ADD COLUMN restocked_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(restocked_cost_cents>=0);
CREATE TABLE customer_return_inspections (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 return_item_id INTEGER NOT NULL REFERENCES customer_return_items(id),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 decision TEXT NOT NULL CHECK(decision IN ('RESTOCK','REJECT')),
 restock_condition TEXT CHECK(restock_condition IN ('NEW','QSD')),
 restored_cost_cents INTEGER NOT NULL CHECK(restored_cost_cents>=0),
 note TEXT NOT NULL,
 inspected_by TEXT NOT NULL,
 resale_confirmed INTEGER NOT NULL DEFAULT 0,
 operation_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX customer_return_inspections_item ON customer_return_inspections(return_item_id);
