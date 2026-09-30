import type { D1Database } from '@cloudflare/workers-types';
import type { CashCategory } from './types.ts';
import { AtomicBatch, commitOperation, executeOperation, fingerprint, integer, object, requestKey, text } from './atomic.ts';

export interface RecordCashTransactionInput {
  request_id?: string;
  flow_type: 'IN' | 'OUT'; account_type: 'CASH' | 'BANK'; amount_cents: number; category: CashCategory;
  reference_type?: string | null; reference_id?: number | null;
  bank_name?: string | null; recipient_name?: string | null; note?: string | null; created_by?: string;
}
const categories = ['ORDER_PAYMENT','PURCHASE','BUYBACK','REPAIR_FEE','OTHER','DEPOSIT','EXPENSE','REFUND','COD_SETTLEMENT','SHIPPING_FEE'];

export function parseCashInput(raw: unknown): RecordCashTransactionInput {
  const value = object(raw);
  if (!['IN','OUT'].includes(String(value.flow_type)) || !['CASH','BANK'].includes(String(value.account_type)) || !categories.includes(String(value.category))) throw new Error('Loại thu/chi, tài khoản hoặc khoản mục không hợp lệ.');
  if (value.category === 'EXPENSE' && value.flow_type !== 'OUT') throw new Error('Chi phí vận hành phải là phiếu chi.');
  const referenceType = text(value.reference_type) || null;
  const referenceId = value.reference_id == null ? null : integer(value.reference_id, 'Chứng từ', 1);
  if ((referenceType === null) !== (referenceId === null)) throw new Error('Tham chiếu chứng từ chưa đầy đủ.');
  return { flow_type: value.flow_type as 'IN'|'OUT', account_type: value.account_type as 'CASH'|'BANK',
    category: value.category as CashCategory, amount_cents: integer(value.amount_cents, 'Số tiền', 1),
    reference_type: referenceType, reference_id: referenceId,
    bank_name: value.account_type === 'BANK' ? text(value.bank_name) || null : null,
    recipient_name: text(value.recipient_name) || null, note: text(value.note) || null, created_by: text(value.created_by, 'Thu ngân') };
}

export function writeCashEntry(batch: AtomicBatch, input: RecordCashTransactionInput, key: string) {
  const prefix = input.flow_type === 'IN' ? 'PT' : 'PC';
  // Generate the code inside the write, so concurrent cash entries cannot read
  // and reuse the same next code before either insert completes.
  batch.add(`INSERT INTO cash_transactions (transaction_code, flow_type, account_type, category, amount_cents,
    reference_type, reference_id, bank_name, recipient_name, note, created_by, operation_key)
    VALUES ((SELECT ? || printf('%04d', COALESCE(MAX(CAST(substr(transaction_code,3) AS INTEGER)),0)+1)
      FROM cash_transactions WHERE transaction_code LIKE ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    prefix, `${prefix}%`, input.flow_type, input.account_type, input.category, input.amount_cents,
    input.reference_type ?? null, input.reference_id ?? null, input.bank_name ?? null,
    input.recipient_name ?? null, input.note ?? null, input.created_by ?? 'Thu ngân', key);
}

export async function recordCashTransaction(db: D1Database, raw: RecordCashTransactionInput): Promise<{ id: number; transaction_code: string }> {
  const input = parseCashInput(raw), key = `cash:${requestKey(raw.request_id)}`, hash = await fingerprint(input);
  return executeOperation(db, key, hash, async () => {
    const batch = new AtomicBatch(db);
    writeCashEntry(batch, input, key);
    batch.add(`INSERT INTO kgame_operations(operation_key,kind,payload_hash,result_json)
      SELECT ?, 'CASH_ENTRY', ?, json_object('id',id,'transaction_code',transaction_code) FROM cash_transactions WHERE operation_key = ?`, key, hash, key);
    return commitOperation<{ id: number; transaction_code: string }>(batch, key, hash);
  });
}

export async function recordManualCashTransaction(db: D1Database, raw: RecordCashTransactionInput) {
  const input = parseCashInput(raw);
  if (!['OTHER','EXPENSE'].includes(input.category) || input.reference_type || input.reference_id) {
    throw new Error('Thu/chi gắn đơn hàng, nhập hàng, sửa chữa hoặc số dư phải ghi từ chứng từ tương ứng để cập nhật đúng công nợ.');
  }
  return recordCashTransaction(db, { ...input, request_id: raw.request_id });
}
