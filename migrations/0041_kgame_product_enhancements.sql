-- 0041_kgame_product_enhancements.sql
-- Bổ sung trường nhà sản xuất, nguồn hàng, theo dõi gửi đối tác sửa chữa và xử lý key

ALTER TABLE products ADD COLUMN default_manufacturer TEXT DEFAULT 'Tôi sản xuất';

ALTER TABLE product_units ADD COLUMN is_self_produced INTEGER DEFAULT 1;
ALTER TABLE product_units ADD COLUMN manufacturer_name TEXT DEFAULT 'Tôi sản xuất';
ALTER TABLE product_units ADD COLUMN supplier_name TEXT;

ALTER TABLE repair_tickets ADD COLUMN sent_partner_at TEXT;
ALTER TABLE repair_tickets ADD COLUMN expected_receive_at TEXT;
ALTER TABLE repair_tickets ADD COLUMN actual_received_at TEXT;
ALTER TABLE repair_tickets ADD COLUMN partner_cost_cents INTEGER DEFAULT 0;
ALTER TABLE repair_tickets ADD COLUMN is_key_serviced INTEGER DEFAULT 0;
ALTER TABLE repair_tickets ADD COLUMN new_expiry_date TEXT;
