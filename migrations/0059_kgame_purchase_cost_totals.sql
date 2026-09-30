-- NULL marks legacy rows whose allocation has not been recalculated.
ALTER TABLE purchase_items ADD COLUMN total_cost_cents INTEGER;
ALTER TABLE purchase_items ADD COLUMN allocated_discount_cents INTEGER;
-- Preserve gross historical payment; refunds are tracked separately.
ALTER TABLE purchase_receipts ADD COLUMN refunded_amount_cents INTEGER NOT NULL DEFAULT 0;
UPDATE purchase_receipts SET refunded_amount_cents=COALESCE((SELECT settled_cents FROM kgame_refund_obligations WHERE source_type='PURCHASE' AND source_id=purchase_receipts.id),0);
ALTER TABLE product_types ADD COLUMN cost_price_used_cents INTEGER;
