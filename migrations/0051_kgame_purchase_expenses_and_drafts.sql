-- Migration: 0051_kgame_purchase_expenses_and_drafts.sql
-- Thêm các trường hỗ trợ chi phí nhập khác (vận chuyển/chành xe), số hóa đơn đầu vào, và đặt hàng nhập

ALTER TABLE purchase_receipts ADD COLUMN other_fee_cents INTEGER DEFAULT 0;
ALTER TABLE purchase_receipts ADD COLUMN other_fee_note TEXT;
ALTER TABLE purchase_receipts ADD COLUMN other_fee_cash_id INTEGER;
ALTER TABLE purchase_receipts ADD COLUMN invoice_number TEXT;
ALTER TABLE purchase_receipts ADD COLUMN order_receipt_code TEXT;
ALTER TABLE purchase_receipts ADD COLUMN completed_at TEXT;
