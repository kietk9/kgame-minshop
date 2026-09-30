-- 0050_kgame_product_warranty_and_notes.sql
-- Bổ sung barcode, trường ghi chú mẫu (hóa đơn / đặt hàng) và cấu hình mốc bảo hành, bảo trì cho sản phẩm

ALTER TABLE products ADD COLUMN barcode TEXT;
ALTER TABLE products ADD COLUMN invoice_note TEXT;
ALTER TABLE products ADD COLUMN warranty_info TEXT;
ALTER TABLE products ADD COLUMN warranty_period_months INTEGER DEFAULT 0;
