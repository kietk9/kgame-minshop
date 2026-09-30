import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, integer, text } from './atomic.ts';

// Received goods must use a purchase return, never cancellation of history.
export async function cancelPurchaseReceipt(db: D1Database, receiptId: number, rawReason?: string) {
  integer(receiptId, 'Phiếu nhập', 1);
  const reason = text(rawReason, 'Hủy đặt nhập') || 'Hủy đặt nhập';
  const receipt = await db.prepare('SELECT * FROM purchase_receipts WHERE id = ?').bind(receiptId).first<any>();
  if (!receipt) throw new Error('Không tìm thấy phiếu nhập.');
  if (receipt.receipt_status === 'CANCELLED') return { success: true, receipt_code: receipt.receipt_code };
  if (receipt.receipt_status !== 'DRAFT') throw new Error('Phiếu đã nhận hàng cần lập trả hàng nhập, không hủy phiếu gốc.');
  const paid = integer(receipt.paid_amount_cents, 'Tiền đã trả'), total = integer(receipt.total_amount_cents, 'Tổng phiếu');
  const refunded=integer(receipt.refunded_amount_cents??0,'Tiền đã nhận hoàn');
  if (refunded>paid || receipt.debt_amount_cents !== Math.max(0,total-paid+refunded)) throw new Error('Tiền/nợ phiếu đang lệch; cần đối chiếu trước khi hủy.');
  const batch = new AtomicBatch(db);
  await batch.assert(`EXISTS(SELECT 1 FROM purchase_receipts WHERE id = ? AND receipt_status = 'DRAFT'
    AND supplier_id IS ? AND paid_amount_cents = ? AND total_amount_cents = ? AND debt_amount_cents = ? AND refunded_amount_cents = ?)`,
    [receiptId, receipt.supplier_id, paid, total, Math.max(0,total-paid+refunded),refunded], 'Phiếu vừa thay đổi.');
  await batch.assert(`NOT EXISTS(SELECT 1 FROM inventory_transactions WHERE LOWER(reference_type) = 'purchase_receipt' AND reference_id = ? AND quantity != 0)`,
    [receiptId], 'Phiếu đã có biến động kho; cần đối chiếu hoặc lập trả hàng.');
  const cashPredicate = `(SELECT COALESCE(SUM(CASE WHEN flow_type = 'OUT' THEN amount_cents ELSE -amount_cents END),0)
    FROM cash_transactions WHERE LOWER(reference_type) = 'purchase_receipt' AND reference_id = ?
    AND category IN ('PURCHASE','DEPOSIT','REFUND') AND COALESCE(status,'ACTIVE') != 'CANCELLED') = ?`;
  await batch.assert(cashPredicate, [receiptId,paid-refunded], 'Lịch sử tiền đã trả không khớp phiếu.');
  if (paid) {
    integer(receipt.supplier_id, 'Nhà cung cấp', 1);
    await batch.assert('EXISTS(SELECT 1 FROM partners WHERE id = ? AND is_supplier = 1)', [receipt.supplier_id], 'Nhà cung cấp không hợp lệ.');
    batch.add(`INSERT INTO kgame_refund_obligations(source_type,source_id,partner_id,flow_type,amount_cents,reason)
      VALUES('PURCHASE',?,?,'IN',?,?) ON CONFLICT(source_type,source_id) DO UPDATE SET amount_cents=excluded.amount_cents,reason=excluded.reason`, receiptId,receipt.supplier_id,paid,reason);
  }
  batch.add(`UPDATE purchase_receipts SET receipt_status = 'CANCELLED', debt_amount_cents = 0,
    note = COALESCE(note,'') || ? WHERE id = ?`, ` [ĐÃ HỦY: ${reason}]`,receiptId);
  try { await batch.commit(); }
  catch (error) {
    const current = await db.prepare('SELECT receipt_status FROM purchase_receipts WHERE id = ?').bind(receiptId).first<{receipt_status:string}>();
    if (current?.receipt_status !== 'CANCELLED') throw error;
  }
  return { success:true,receipt_code:receipt.receipt_code };
}
