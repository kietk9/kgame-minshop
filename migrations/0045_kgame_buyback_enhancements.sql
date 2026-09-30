-- 0045_kgame_buyback_enhancements.sql
-- Bổ sung các trường thanh toán và liên kết Sổ Quỹ cho Phiếu Thu Mua (Buyback)

ALTER TABLE buybacks ADD COLUMN payment_method TEXT DEFAULT 'CASH';
ALTER TABLE buybacks ADD COLUMN bank_account TEXT;
ALTER TABLE buybacks ADD COLUMN paid_amount_cents INTEGER DEFAULT 0;
ALTER TABLE buybacks ADD COLUMN cash_transaction_id INTEGER REFERENCES cash_transactions(id);
