-- 1. Bổ sung địa chỉ 3 cấp chuẩn mới cho bảng suppliers
ALTER TABLE suppliers ADD COLUMN province TEXT;
ALTER TABLE suppliers ADD COLUMN ward TEXT;
ALTER TABLE suppliers ADD COLUMN address_detail TEXT;

-- 2. Tạo bảng danh mục chi phí nhập hàng (chi phí NCC hoặc chi phí khác)
CREATE TABLE IF NOT EXISTS purchase_expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category_type TEXT NOT NULL DEFAULT 'OTHER', -- 'NCC' hoặc 'OTHER'
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed sẵn các loại chi phí nhập hàng thông dụng
INSERT OR IGNORE INTO purchase_expense_categories (name, category_type, is_default) VALUES 
('Phí đóng kiện gỗ (NCC)', 'NCC', 1),
('Phí bốc dỡ của NCC', 'NCC', 1),
('Phụ thu xuất hóa đơn (NCC)', 'NCC', 1),
('Cước vận chuyển / Chành xe', 'OTHER', 1),
('Phí giao hàng công nghệ (Ahamove/Grab)', 'OTHER', 1),
('Phí bốc xếp tại bến / kho', 'OTHER', 1);

-- 3. Bổ sung chi phí phân bổ và giá vốn thực tế cho từng dòng purchase_items
ALTER TABLE purchase_items ADD COLUMN allocated_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN final_cost_cents INTEGER NOT NULL DEFAULT 0;

-- 4. Bổ sung cột lưu danh mục chi phí được chọn trên phiếu nhập
ALTER TABLE purchase_receipts ADD COLUMN extra_fee_category TEXT;
ALTER TABLE purchase_receipts ADD COLUMN other_fee_category TEXT;
