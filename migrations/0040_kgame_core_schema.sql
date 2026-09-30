-- 0040_kgame_core_schema.sql
-- Master Format V1.1: Schema lõi Trung Kiên Game (4 tầng hàng hóa, sổ kho Append-only, Sản xuất, Sửa chữa, Thu mua, Bán hàng)

-- 1. Bổ sung các cột cho bảng products hiện tại
ALTER TABLE products ADD COLUMN product_code TEXT;
ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id);
ALTER TABLE products ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'QUANTITY'; -- 'QUANTITY' | 'CODE'
ALTER TABLE products ADD COLUMN production_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN expiry_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN note TEXT;

-- 2. Bảng product_types (Phân loại / Version: 620, 617, 615...)
CREATE TABLE IF NOT EXISTS product_types (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id          INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  name                TEXT    NOT NULL,                                         -- '620', '617', '615', 'Không PIN'
  code                TEXT,                                                     -- 'TLK-620'
  tracking_mode       TEXT    NOT NULL DEFAULT 'CODE',                         -- 'QUANTITY' | 'CODE'
  sale_price_cents    INTEGER NOT NULL DEFAULT 0,                               -- Giá bán niêm yết
  cost_price_cents    INTEGER DEFAULT 0,                                        -- Giá vốn ước tính
  market_price_cents  INTEGER DEFAULT 0,                                        -- Giá thị trường tham khảo
  floor_price_cents   INTEGER DEFAULT 0,                                        -- Giá sàn tối thiểu
  cached_stock_new    INTEGER NOT NULL DEFAULT 0,                               -- Cache tồn kho hàng mới (đọc siêu tốc)
  cached_stock_used   INTEGER NOT NULL DEFAULT 0,                               -- Cache tồn kho hàng QSD
  is_active           INTEGER NOT NULL DEFAULT 1,
  sort_order          INTEGER DEFAULT 0,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 3. Bảng product_units (Mã bộ Program Code: 777-62020834)
CREATE TABLE IF NOT EXISTS product_units (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  product_type_id         INTEGER NOT NULL REFERENCES product_types(id) ON DELETE RESTRICT,
  program_code            TEXT    NOT NULL UNIQUE,                               -- Khóa chống trùng mã bộ
  condition               TEXT    NOT NULL DEFAULT 'NEW',                       -- 'NEW' | 'QSD'
  availability            TEXT    NOT NULL DEFAULT 'IN_STOCK',                  -- 'IN_STOCK' | 'RESERVED' | 'SOLD' | 'REPAIRING_INTERNAL' | 'REPAIR_CUSTOMER' | 'BUYBACK_PENDING_INSPECT'
  owner_type              TEXT    NOT NULL DEFAULT 'KGAME',                     -- 'KGAME' | 'CUSTOMER'
  owner_id                INTEGER,                                              -- customer_id nếu khách đang sở hữu
  expiry_days             INTEGER,                                              -- Số ngày hạn lúc sản xuất (400, 200, 100...)
  expiry_date             TEXT,                                                 -- Hạn ẩn (YYYY-MM-DD)
  production_date         TEXT,
  cost_price_cents        INTEGER DEFAULT 0,
  target_sale_price_cents INTEGER DEFAULT 0,                                    -- Giá đề xuất bán lại nếu là hàng cũ
  location_id             TEXT    DEFAULT 'KHO_CHINH',                          -- Vị trí kệ/kho
  note                    TEXT,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_units_type ON product_units(product_type_id);
CREATE INDEX IF NOT EXISTS idx_units_availability ON product_units(availability);
CREATE INDEX IF NOT EXISTS idx_units_owner ON product_units(owner_type, owner_id);

-- 4. Bảng inventory_transactions (Sổ kho Append-Only - Nguồn sự thật duy nhất)
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  product_type_id   INTEGER REFERENCES product_types(id),
  product_unit_id   INTEGER REFERENCES product_units(id),
  condition         TEXT    NOT NULL DEFAULT 'NEW',                             -- 'NEW' | 'QSD'
  quantity          INTEGER NOT NULL,                                           -- Dương là tăng, âm là giảm
  transaction_type  TEXT    NOT NULL,                                           -- 'PURCHASE', 'BUYBACK', 'PRODUCTION_USE', 'PRODUCTION_OUT', 'SALE', 'SALE_REVERSE', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'REPAIR_USE', 'ADJUSTMENT'
  reference_type    TEXT,                                                       -- 'order', 'production_order', 'repair_ticket', 'buyback', 'stocktake', 'manual'
  reference_id      INTEGER,
  unit_cost_cents   INTEGER DEFAULT 0,
  location_id       TEXT    DEFAULT 'KHO_CHINH',
  note              TEXT,
  created_by        TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_product ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_unit ON inventory_transactions(product_unit_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ref ON inventory_transactions(reference_type, reference_id);

-- 5. Bảng reservations (Giữ hàng độc lập với payment)
CREATE TABLE IF NOT EXISTS reservations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_type_id   INTEGER NOT NULL REFERENCES product_types(id),
  product_unit_id   INTEGER REFERENCES product_units(id),
  quantity          INTEGER NOT NULL DEFAULT 1,
  status            TEXT    NOT NULL DEFAULT 'ACTIVE',                          -- 'ACTIVE', 'RELEASED', 'FULFILLED'
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  released_at       TEXT
);

-- 6. Mở rộng bảng orders cho luồng ORDER -> SALE
ALTER TABLE orders ADD COLUMN order_code TEXT;
ALTER TABLE orders ADD COLUMN customer_id INTEGER;
ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'ORDER';         -- 'ORDER' | 'SALE'
ALTER TABLE orders ADD COLUMN order_status TEXT NOT NULL DEFAULT 'PENDING';     -- 'PENDING', 'PROCESSING', 'DELIVERING', 'COMPLETED', 'CANCELLED'
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID';    -- 'UNPAID', 'PARTIALLY_PAID', 'PAID'
ALTER TABLE orders ADD COLUMN paid_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN cod_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN note TEXT;
ALTER TABLE orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

-- 7. Bảng order_lines (Snapshot tên sản phẩm & phân loại bất biến)
CREATE TABLE IF NOT EXISTS order_lines (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id                INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id              INTEGER NOT NULL REFERENCES products(id),
  product_type_id         INTEGER NOT NULL REFERENCES product_types(id),
  product_name_snapshot   TEXT    NOT NULL,
  type_name_snapshot      TEXT    NOT NULL,
  condition               TEXT    NOT NULL DEFAULT 'NEW',                       -- 'NEW' | 'QSD'
  quantity                INTEGER NOT NULL DEFAULT 1,
  unit_price_cents        INTEGER NOT NULL DEFAULT 0,
  discount_cents          INTEGER NOT NULL DEFAULT 0,
  line_total_cents        INTEGER NOT NULL DEFAULT 0
);

-- 8. Bảng order_units (Gắn mã bộ cho dòng đơn)
CREATE TABLE IF NOT EXISTS order_units (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_line_id   INTEGER NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
  product_unit_id INTEGER NOT NULL REFERENCES product_units(id)
);

-- 9. Bảng payments & refunds
CREATE TABLE IF NOT EXISTS payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_cents    INTEGER NOT NULL,
  payment_method  TEXT    NOT NULL,                                             -- 'VIETQR', 'CASH', 'COD', 'TRANSFER'
  payment_type    TEXT    NOT NULL DEFAULT 'FULL',                             -- 'DEPOSIT' | 'REMAINDER' | 'FULL'
  reference_code  TEXT,                                                         -- Mã chuyển khoản / bill
  status          TEXT    NOT NULL DEFAULT 'CONFIRMED',                        -- 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'REJECTED'
  note            TEXT,
  created_by      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 10. Bảng shipments (Vận chuyển: GHN / Nhà xe / Khách tự lấy)
CREATE TABLE IF NOT EXISTS shipments (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier             TEXT    NOT NULL,                                         -- 'GHN', 'BUS', 'PICKUP'
  tracking_code       TEXT,
  cod_amount_cents    INTEGER NOT NULL DEFAULT 0,
  bus_station         TEXT,                                                     -- Bến xe / Nhà xe
  bus_plate           TEXT,                                                     -- Biển số xe / số tài xế
  sender_name         TEXT,
  sender_phone        TEXT,
  sender_address      TEXT,
  receiver_name       TEXT,
  receiver_phone      TEXT,
  receiver_address    TEXT,
  shipping_fee_cents  INTEGER NOT NULL DEFAULT 0,
  status              TEXT    NOT NULL DEFAULT 'PENDING',                       -- 'PENDING', 'SHIPPED', 'DELIVERED', 'FAILED', 'RETURNED'
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 11. Bảng sản xuất (BOM template & Lệnh sản xuất thực tế)
CREATE TABLE IF NOT EXISTS production_configs (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  name                    TEXT    NOT NULL,                                     -- 'Cấu hình chuẩn Cá Dĩa'
  output_product_id       INTEGER NOT NULL REFERENCES products(id),
  output_product_type_id  INTEGER NOT NULL REFERENCES product_types(id),
  is_active               INTEGER NOT NULL DEFAULT 1,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS production_config_items (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id               INTEGER NOT NULL REFERENCES production_configs(id) ON DELETE CASCADE,
  input_product_id        INTEGER NOT NULL REFERENCES products(id),
  input_product_type_id   INTEGER REFERENCES product_types(id),
  quantity                INTEGER NOT NULL DEFAULT 1,
  is_default              INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS production_orders (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  production_code         TEXT    NOT NULL UNIQUE,                              -- 'SX0001'
  output_product_id       INTEGER NOT NULL REFERENCES products(id),
  output_product_type_id  INTEGER NOT NULL REFERENCES product_types(id),
  quantity                INTEGER NOT NULL DEFAULT 1,
  status                  TEXT    NOT NULL DEFAULT 'COMPLETED',                 -- 'DRAFT', 'COMPLETED', 'CANCELLED'
  created_by              TEXT,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at            TEXT
);

CREATE TABLE IF NOT EXISTS production_inputs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  production_order_id INTEGER NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  product_id          INTEGER NOT NULL REFERENCES products(id),
  product_type_id     INTEGER REFERENCES product_types(id),
  product_unit_id     INTEGER REFERENCES product_units(id),
  quantity            INTEGER NOT NULL DEFAULT 1,
  unit_cost_cents     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS production_outputs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  production_order_id INTEGER NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  product_unit_id     INTEGER REFERENCES product_units(id),
  quantity            INTEGER NOT NULL DEFAULT 1,
  unit_cost_cents     INTEGER DEFAULT 0,
  expiry_days         INTEGER,                                                  -- 400, 200, 100
  expiry_date         TEXT                                                      -- Hạn ẩn
);

-- 12. Bảng Sửa chữa (Repair Core V1)
CREATE TABLE IF NOT EXISTS repair_tickets (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_code                 TEXT    NOT NULL UNIQUE,                          -- 'SC0001'
  owner_type                  TEXT    NOT NULL DEFAULT 'CUSTOMER',              -- 'CUSTOMER' | 'KGAME'
  customer_id                 INTEGER,
  product_id                  INTEGER REFERENCES products(id),                  -- Có thể NULL nếu chưa xác định
  product_type_id             INTEGER REFERENCES product_types(id),
  product_unit_id             INTEGER REFERENCES product_units(id),
  unidentified_product_name   TEXT,                                             -- Tên khách báo khi chưa tìm thấy Product
  problem_reported            TEXT    NOT NULL,                                 -- Lỗi khách báo ("Không lên hình")
  accessories_received        TEXT,                                             -- Phụ kiện nhận kèm ("Chỉ nhận CPU, không adaptor")
  diagnosis                   TEXT,                                             -- Chẩn đoán của kỹ thuật
  repair_location             TEXT    NOT NULL DEFAULT 'INTERNAL',              -- 'INTERNAL' | 'EXTERNAL'
  external_partner            TEXT,                                             -- Nơi gửi sửa ngoài nếu có
  status                      TEXT    NOT NULL DEFAULT 'RECEIVED',              -- 'RECEIVED', 'DIAGNOSING', 'QUOTED', 'APPROVED', 'REPAIRING', 'TESTING', 'READY_FOR_RETURN', 'COMPLETED'
  repair_cost_cents           INTEGER NOT NULL DEFAULT 0,                       -- Giá vốn chi phí sửa
  repair_price_cents          INTEGER NOT NULL DEFAULT 0,                       -- Giá báo thu khách
  received_at                 TEXT    NOT NULL DEFAULT (datetime('now')),
  expected_return_at          TEXT,
  returned_at                 TEXT,
  assigned_to                 TEXT,
  note                        TEXT,
  created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repair_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  repair_ticket_id  INTEGER NOT NULL REFERENCES repair_tickets(id) ON DELETE CASCADE,
  event_type        TEXT    NOT NULL,                                           -- 'RECEIVED', 'DIAGNOSED', 'QUOTED', 'APPROVED', 'REPAIRED', 'TESTED_PASS', 'SENT_OUT', 'RETURNED_CLIENT'
  note              TEXT,
  created_by        TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repair_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  repair_ticket_id  INTEGER NOT NULL REFERENCES repair_tickets(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  product_type_id   INTEGER REFERENCES product_types(id),
  quantity          INTEGER NOT NULL DEFAULT 1,
  unit_cost_cents   INTEGER DEFAULT 0
);

-- 13. Bảng Thu mua (Buybacks)
CREATE TABLE IF NOT EXISTS buybacks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  buyback_code    TEXT    NOT NULL UNIQUE,                                      -- 'TM0001'
  customer_id     INTEGER NOT NULL,
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'COMPLETED',
  note            TEXT,
  created_by      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS buyback_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  buyback_id          INTEGER NOT NULL REFERENCES buybacks(id) ON DELETE CASCADE,
  product_id          INTEGER NOT NULL REFERENCES products(id),
  product_type_id     INTEGER REFERENCES product_types(id),
  product_unit_id     INTEGER REFERENCES product_units(id),
  quantity            INTEGER NOT NULL DEFAULT 1,
  condition           TEXT    NOT NULL DEFAULT 'QSD',
  condition_note      TEXT,
  purchase_price_cents INTEGER NOT NULL DEFAULT 0
);

-- 14. Bảng Nhập mua NCC (Purchase Receipts)
CREATE TABLE IF NOT EXISTS purchase_receipts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_code        TEXT    NOT NULL UNIQUE,                                  -- 'PN0001'
  supplier_id         INTEGER,
  total_amount_cents  INTEGER NOT NULL DEFAULT 0,
  note                TEXT,
  created_by          TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_code_id     INTEGER NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  product_id          INTEGER NOT NULL REFERENCES products(id),
  product_type_id     INTEGER REFERENCES product_types(id),
  product_unit_id     INTEGER REFERENCES product_units(id),
  condition           TEXT    NOT NULL DEFAULT 'NEW',
  quantity            INTEGER NOT NULL DEFAULT 1,
  unit_cost_cents     INTEGER NOT NULL DEFAULT 0
);

-- 15. Bảng Khách hàng, Địa chỉ & NCC
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_code TEXT    UNIQUE,                                                 -- 'KH0001'
  name          TEXT    NOT NULL,
  phone         TEXT    NOT NULL,
  email         TEXT,
  note          TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label         TEXT    DEFAULT 'Mặc định',                                     -- 'Nhà', 'Kho', 'Tiệm game'
  address       TEXT    NOT NULL,
  is_default    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS suppliers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_code TEXT    UNIQUE,                                                 -- 'NCC0001'
  name          TEXT    NOT NULL,
  phone         TEXT,
  address       TEXT,
  note          TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 16. Bảng Thu chi (Cash Transactions)
CREATE TABLE IF NOT EXISTS cash_transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_code TEXT   NOT NULL UNIQUE,                                      -- 'TC0001'
  flow_type       TEXT    NOT NULL,                                             -- 'IN' (Thu) | 'OUT' (Chi)
  category        TEXT    NOT NULL,                                             -- 'ORDER_PAYMENT', 'PURCHASE', 'BUYBACK', 'REPAIR_FEE', 'OTHER'
  amount_cents    INTEGER NOT NULL,
  reference_type  TEXT,                                                         -- 'order', 'buyback', 'purchase_receipt', 'repair_ticket'
  reference_id    INTEGER,
  note            TEXT,
  created_by      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 17. Bảng Kiểm kho (Stocktakes & Adjustments)
CREATE TABLE IF NOT EXISTS stocktakes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  stocktake_code  TEXT    NOT NULL UNIQUE,                                      -- 'KK0001'
  location_id     TEXT    DEFAULT 'KHO_CHINH',
  status          TEXT    NOT NULL DEFAULT 'COMPLETED',                         -- 'DRAFT', 'COMPLETED'
  note            TEXT,
  created_by      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS stocktake_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  stocktake_id        INTEGER NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  product_id          INTEGER NOT NULL REFERENCES products(id),
  product_type_id     INTEGER REFERENCES product_types(id),
  product_unit_id     INTEGER REFERENCES product_units(id),
  condition           TEXT    NOT NULL DEFAULT 'NEW',
  book_quantity       INTEGER NOT NULL,                                         -- Số lượng trên sổ
  actual_quantity     INTEGER NOT NULL,                                         -- Số lượng thực tế kiểm được
  difference          INTEGER NOT NULL                                          -- Chênh lệch
);

-- 18. Bảng Đính kèm Media (R2) & Nhật ký Audit
CREATE TABLE IF NOT EXISTS attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT    NOT NULL,                                               -- 'product_unit', 'repair_ticket', 'buyback', 'production_order'
  entity_id     INTEGER NOT NULL,
  event_type    TEXT,                                                           -- 'RECEIPT_PHOTO', 'DEFECT_PHOTO', 'POST_REPAIR_PHOTO'
  r2_key        TEXT    NOT NULL,
  is_internal   INTEGER NOT NULL DEFAULT 1,                                     -- 1 = Ảnh kỹ thuật nội bộ, 0 = Công khai web
  uploaded_by   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT,
  action      TEXT    NOT NULL,                                                 -- 'CREATE_PRODUCT', 'SALE_COMPLETED', 'REVERSE_SALE', 'PRODUCE_UNIT'...
  entity_type TEXT    NOT NULL,
  entity_id   INTEGER,
  reason      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
