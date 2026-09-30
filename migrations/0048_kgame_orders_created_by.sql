-- 0048_kgame_orders_created_by.sql
-- Thêm cột người tạo đơn / nhân viên bán hàng cho orders
ALTER TABLE orders ADD COLUMN created_by TEXT DEFAULT 'Admin Kgame';
