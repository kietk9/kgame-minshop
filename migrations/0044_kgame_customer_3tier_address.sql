-- 0044_kgame_customer_3tier_address.sql
-- Thêm các trường địa chỉ 3 cấp chuẩn mới (Tỉnh/TP, Phường/Xã, Số nhà đường)

ALTER TABLE customers ADD COLUMN province TEXT;
ALTER TABLE customers ADD COLUMN ward TEXT;
ALTER TABLE customers ADD COLUMN address_detail TEXT;
