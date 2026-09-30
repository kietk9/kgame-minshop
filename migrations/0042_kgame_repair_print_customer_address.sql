-- 0042_kgame_repair_print_customer_address.sql
-- Bổ sung địa chỉ khách hàng trực tiếp và các trường hỗ trợ in phiếu tiếp nhận

ALTER TABLE customers ADD COLUMN address TEXT;
