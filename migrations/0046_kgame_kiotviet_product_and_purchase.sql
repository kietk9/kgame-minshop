-- 0046_kgame_kiotviet_product_and_purchase.sql
-- Chuẩn hóa mô hình Hàng Hóa (Tồn kho & Giá Mới/Cũ, cờ Serial/IMEI) và Phân hệ Nhập Hàng chuẩn KiotViet

-- 1. Bổ sung giá và tồn kho Mới/Cũ, cờ serial cho bảng products
ALTER TABLE products ADD COLUMN price_used_cents INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN cost_price_cents INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN cost_price_used_cents INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN stock_new INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN stock_used INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN has_serial INTEGER DEFAULT 0;           -- 0: Không, 1: Có quản lý serial/IMEI
ALTER TABLE products ADD COLUMN brand TEXT;                             -- Thương hiệu / Nguồn gốc
ALTER TABLE products ADD COLUMN unit_name TEXT DEFAULT 'Cái';           -- Đơn vị tính

-- 2. Bổ sung các trường thanh toán & công nợ cho purchase_receipts
ALTER TABLE purchase_receipts ADD COLUMN receipt_status TEXT DEFAULT 'COMPLETED'; -- 'DRAFT' | 'COMPLETED'
ALTER TABLE purchase_receipts ADD COLUMN paid_amount_cents INTEGER DEFAULT 0;
ALTER TABLE purchase_receipts ADD COLUMN debt_amount_cents INTEGER DEFAULT 0;
ALTER TABLE purchase_receipts ADD COLUMN discount_cents INTEGER DEFAULT 0;
ALTER TABLE purchase_receipts ADD COLUMN extra_fee_cents INTEGER DEFAULT 0;
ALTER TABLE purchase_receipts ADD COLUMN payment_method TEXT DEFAULT 'CASH';     -- 'CASH' | 'BANK' | 'DEBT'
ALTER TABLE purchase_receipts ADD COLUMN bank_name TEXT;
ALTER TABLE purchase_receipts ADD COLUMN cash_transaction_id INTEGER REFERENCES cash_transactions(id);

-- 3. Bổ sung các trường serial và ghi chú cho purchase_items
ALTER TABLE purchase_items ADD COLUMN program_code TEXT;
ALTER TABLE purchase_items ADD COLUMN discount_cents INTEGER DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN item_note TEXT;
