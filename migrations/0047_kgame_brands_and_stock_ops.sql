-- 0047_kgame_brands_and_stock_ops.sql
-- Thêm bảng brands và mở rộng quản lý xuất dùng nội bộ, xuất hủy

CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO brands (name, description) VALUES
  ('Kgame (Tự sản xuất)', 'Sản phẩm do Kgame tự nghiên cứu và sản xuất'),
  ('Trung Quốc', 'Hàng nhập khẩu Trung Quốc'),
  ('Đài Loan', 'Hàng nhập khẩu Đài Loan'),
  ('Chợ Trời / Thu mua ngoài', 'Thu mua linh kiện ngoài thị trường tự do'),
  ('Sanwa', 'Hãng phụ tùng nút/cần Nhật Bản'),
  ('SEGA', 'Hãng game arcade Nhật Bản'),
  ('IGS', 'Hãng phần mềm bo mạch máy game');

-- Bổ sung brand_id vào products
ALTER TABLE products ADD COLUMN brand_id INTEGER REFERENCES brands(id);
