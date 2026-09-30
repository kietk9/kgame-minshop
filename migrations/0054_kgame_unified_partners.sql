-- Migration 0054: Unified Partners Architecture (Khách Hàng & Nhà Cung Cấp)

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_code TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  tax_code TEXT,
  province TEXT,
  ward TEXT,
  address_detail TEXT,
  address TEXT,
  note TEXT,
  is_customer INTEGER NOT NULL DEFAULT 1,
  is_supplier INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_partners_phone ON partners(phone);
CREATE INDEX IF NOT EXISTS idx_partners_code ON partners(partner_code);
CREATE INDEX IF NOT EXISTS idx_partners_type ON partners(is_customer, is_supplier);

-- 1. Nạp toàn bộ Khách Hàng hiện tại vào bảng partners (giữ nguyên id 1..14)
INSERT OR IGNORE INTO partners (
  id, partner_code, name, phone, email, province, ward, address_detail, address, note, is_customer, is_supplier, created_at, updated_at
)
SELECT 
  id, customer_code, name, phone, email, province, ward, address_detail, address, note, 1, 0, created_at, updated_at
FROM customers;

-- 2. Đối tác id 3 (SĐT 0988776655) vừa là khách hàng vừa là nhà cung cấp
UPDATE partners 
SET is_supplier = 1, note = COALESCE(note, '') || ' [Là Khách hàng & NCC Phụ Kiện Sài Gòn]'
WHERE id = 3;

-- 3. Nạp các Nhà Cung Cấp còn lại vào bảng partners
-- NCC 1: Dũng (0988999444)
INSERT OR IGNORE INTO partners (
  id, partner_code, name, phone, email, province, ward, address_detail, address, note, is_customer, is_supplier, created_at
) VALUES (
  101, 'NCC4824', 'Dũng', '0988999444', NULL, NULL, NULL, NULL, NULL, 'Nhà cung cấp máy game', 0, 1, datetime('now')
);

-- NCC 2: Giáp (0909999888)
INSERT OR IGNORE INTO partners (
  id, partner_code, name, phone, email, province, ward, address_detail, address, note, is_customer, is_supplier, created_at
) VALUES (
  102, 'NCC7153', 'Giáp', '0909999888', NULL, NULL, NULL, NULL, NULL, 'Nhà cung cấp linh kiện', 0, 1, datetime('now')
);

-- NCC 4: Hùng Gò Vấp (0999333444)
INSERT OR IGNORE INTO partners (
  id, partner_code, name, phone, email, province, ward, address_detail, address, note, is_customer, is_supplier, created_at
) VALUES (
  104, 'NCC7155', 'Hùng Gò Vấp', '0999333444', NULL, NULL, NULL, NULL, 'Gò Vấp', 'Nhà cung cấp bo mạch', 0, 1, datetime('now')
);

-- 4. Cập nhật supplier_id trên bảng purchase_receipts sang id mới của partners
UPDATE purchase_receipts SET supplier_id = 101 WHERE supplier_id = 1;
UPDATE purchase_receipts SET supplier_id = 102 WHERE supplier_id = 2;
-- supplier_id = 3 giữ nguyên vì partner id 3 đã là supplier
UPDATE purchase_receipts SET supplier_id = 104 WHERE supplier_id = 4;
