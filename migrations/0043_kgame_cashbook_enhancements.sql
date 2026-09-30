-- 0043_kgame_cashbook_enhancements.sql
-- Bổ sung loại quỹ (Tiền mặt / Ngân hàng), tên ngân hàng và người nộp/nhận tiền vào Sổ Quỹ

ALTER TABLE cash_transactions ADD COLUMN account_type TEXT DEFAULT 'CASH'; -- 'CASH' | 'BANK'
ALTER TABLE cash_transactions ADD COLUMN bank_name TEXT;
ALTER TABLE cash_transactions ADD COLUMN recipient_name TEXT;
