-- Migration 0049: Delivery Partners & Shipping Logistics for Kgame Minshop
CREATE TABLE IF NOT EXISTS delivery_partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  partner_type TEXT NOT NULL DEFAULT 'BUS', -- 'INTEGRATED' (GHN, J&T, ViettelPost), 'BUS' (Chành xe, Xe khách), 'LOCAL' (Shipper riêng)
  phone TEXT,
  address TEXT,
  contact_person TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS delivery_reconciliations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reconciliation_code TEXT UNIQUE NOT NULL,
  partner_id INTEGER NOT NULL REFERENCES delivery_partners(id),
  period_start TEXT,
  period_end TEXT,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_cod_cents INTEGER NOT NULL DEFAULT 0,
  total_fee_cents INTEGER NOT NULL DEFAULT 0,
  net_amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'VERIFIED', 'SETTLED', 'CANCELLED'
  cash_transaction_id INTEGER REFERENCES cash_transactions(id),
  verified_at TEXT,
  verified_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Thêm các cột giao vận mở rộng cho shipments
ALTER TABLE shipments ADD COLUMN delivery_partner_id INTEGER REFERENCES delivery_partners(id);
ALTER TABLE shipments ADD COLUMN shipping_payer TEXT DEFAULT 'BUYER_PAYS'; -- 'BUYER_PAYS', 'SHOP_PAYS'
ALTER TABLE shipments ADD COLUMN weight_grams INTEGER DEFAULT 0;
ALTER TABLE shipments ADD COLUMN dimensions TEXT;
ALTER TABLE shipments ADD COLUMN reconciliation_id INTEGER REFERENCES delivery_reconciliations(id);
ALTER TABLE shipments ADD COLUMN reconciliation_status TEXT DEFAULT 'UNRECONCILED'; -- 'UNRECONCILED', 'PENDING_VERIFY', 'RECONCILED'
ALTER TABLE shipments ADD COLUMN settled_at TEXT;
ALTER TABLE shipments ADD COLUMN settled_by TEXT;

-- Dữ liệu mẫu các đơn vị giao hàng quen thuộc của xưởng Kgame
INSERT OR IGNORE INTO delivery_partners (partner_code, name, partner_type, phone, address, contact_person, note, status)
VALUES
  ('DTGH001', 'Chành xe Tô Châu', 'BUS', '0899123456', 'Trạm bến xe Miền Tây, Bình Tân, TP.HCM', 'Anh Ba Tô Châu', 'Chuyên tuyến miền Tây: Cần Thơ, Bến Tre, Tiền Giang, An Giang, Cà Mau', 'ACTIVE'),
  ('DTGH002', 'FUTA Express (Phương Trang)', 'BUS', '19006067', '395 Kinh Dương Vương, An Lạc, Bình Tân, TP.HCM', 'Bưu cục Kinh Dương Vương', 'Gửi máy game và linh kiện đi các tỉnh', 'ACTIVE'),
  ('DTGH003', 'Giao Hàng Nhanh (GHN)', 'INTEGRATED', '19001206', 'Bưu cục Bình Hưng Hòa', 'Bưu tá khu vực Kho số 5', 'Chuyển phát bưu điện toàn quốc linh kiện nhỏ', 'ACTIVE'),
  ('DTGH004', 'J&T Express', 'INTEGRATED', '19001088', 'Bưu cục Tân Phú - Bình Tân', 'Bưu cục J&T', 'Chuyển phát linh kiện game', 'ACTIVE'),
  ('DTGH005', 'Shipper Xưởng Kgame', 'LOCAL', '0903000111', 'Kho số 5, Bình Hưng Hòa, Bình Tân', 'Tài xế xưởng', 'Giao hỏa tốc máy game nội thành TP.HCM và vùng lân cận', 'ACTIVE');
