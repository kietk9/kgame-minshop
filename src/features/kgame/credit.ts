import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, integer } from './atomic.ts';

export async function getCustomerCredit(db: D1Database, partnerId: number) {
  const row = await db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS balance FROM customer_credit_entries WHERE partner_id = ?')
    .bind(partnerId).first<{ balance: number }>();
  return row?.balance ?? 0;
}

export async function writeCustomerCredit(batch: AtomicBatch, partnerId: number, amount: number, referenceType: string,
  ref: string, values: unknown[], key: string, note: string, actor: string) {
  integer(partnerId, 'Khách hàng', 1);
  if (!Number.isSafeInteger(amount) || amount === 0) throw new Error('Khoản số dư không hợp lệ.');
  await batch.assert('EXISTS(SELECT 1 FROM partners WHERE id = ? AND is_customer = 1)', [partnerId], 'Khách nhận số dư không hợp lệ.');
  if (amount < 0) {
    await batch.assert('(SELECT COALESCE(SUM(amount_cents),0) FROM customer_credit_entries WHERE partner_id = ?) >= ?',
      [partnerId, -amount], 'Số dư khách không đủ để thanh toán.');
  }
  batch.add(`INSERT INTO customer_credit_entries (entry_code, partner_id, amount_cents, reference_type, reference_id, operation_key, note, created_by)
    VALUES ((SELECT 'SD' || printf('%04d', COALESCE(MAX(id),0) + 1) FROM customer_credit_entries), ?, ?, ?, ${ref}, ?, ?, ?)`,
  partnerId, amount, referenceType, ...values, key, note, actor);
}
