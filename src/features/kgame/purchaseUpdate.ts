import { purchaseCosts } from './purchaseCost.ts';
import type { D1Database } from '@cloudflare/workers-types';
import type { CreatePurchaseReceiptInput } from './db';
import { AtomicBatch, integer } from './atomic.ts';
import { validatePurchaseInput } from './purchaseValidation.ts';

/** Editing a draft must never rewrite a real cash movement or received stock. */
export async function updatePurchaseReceipt(db: D1Database, receiptId: number, input: CreatePurchaseReceiptInput) {
  integer(receiptId, 'Phiếu nhập', 1);
  const receipt = await db.prepare('SELECT * FROM purchase_receipts WHERE id=?').bind(receiptId).first<Record<string, any>>();
  if (!receipt) throw new Error('Không tìm thấy phiếu nhập.');
  if (receipt.receipt_status !== 'DRAFT') throw new Error('Chỉ sửa phiếu đặt nhập chưa nhận hàng. Phiếu đã nhận cần lập trả hàng nhập.');
  if (input.receipt_status && input.receipt_status !== 'DRAFT') throw new Error('Lưu phiếu nháp trước, sau đó dùng Hoàn thành nhập hàng.');
  const supplierId = input.supplier_id ?? receipt.supplier_id;
  const paid = integer(receipt.paid_amount_cents, 'Tiền đã trả');
  if (input.paid_amount_cents !== paid) throw new Error('Sửa phiếu không thay đổi tiền đã thực trả. Dùng thanh toán hoặc hoàn tiền tại chứng từ.');
  if (paid && supplierId !== receipt.supplier_id) throw new Error('Không đổi nhà cung cấp trên phiếu đã trả tiền.');
  const normalized = { ...input, supplier_id: supplierId, receipt_status: 'DRAFT' as const };
  await validatePurchaseInput(db, normalized, true);
  const refunded=integer(receipt.refunded_amount_cents??0,'Tiền đã nhận hoàn');
  if(refunded>paid)throw new Error('Tiền hoàn vượt tiền đã trả.');
  if(input.other_fee_cents!==undefined && input.other_fee_cents!==receipt.other_fee_cents && receipt.other_fee_cash_id)throw new Error('Chi phí khác đã có phiếu chi; cần điều chỉnh phiếu tiền trước khi đổi chi phí.');
  const batch = new AtomicBatch(db);
  const columns = Object.keys(receipt);
  await batch.assert(`EXISTS(SELECT 1 FROM purchase_receipts WHERE ${columns.map(c => `"${c}" IS ?`).join(' AND ')})`, columns.map(c => receipt[c]), 'Phiếu vừa thay đổi.');
  await batch.assert("NOT EXISTS(SELECT 1 FROM inventory_transactions WHERE LOWER(reference_type)='purchase_receipt' AND reference_id=? AND quantity!=0)", [receiptId], 'Phiếu đã có biến động kho; cần đối chiếu.');
  await batch.assert(`(SELECT COALESCE(SUM(CASE WHEN flow_type='OUT' THEN amount_cents ELSE -amount_cents END),0) FROM cash_transactions
    WHERE LOWER(reference_type)='purchase_receipt' AND reference_id=? AND category IN ('PURCHASE','DEPOSIT','REFUND') AND COALESCE(status,'ACTIVE')!='CANCELLED')=?`, [receiptId,paid-refunded], 'Tiền đã trả không khớp sổ quỹ.');
  if (supplierId != null) await batch.assert('EXISTS(SELECT 1 FROM partners WHERE id=? AND is_supplier=1)', [supplierId], 'Nhà cung cấp không hợp lệ.');
  const subtotal = input.items.reduce((sum,item) => sum+item.quantity*item.unit_cost_cents-(item.discount_cents??0),0);
  const total = subtotal-(input.discount_cents??0)+(input.extra_fee_cents??0);
  if(total>paid-refunded && supplierId==null)throw new Error('Phiếu còn nợ phải chọn nhà cung cấp.');
  const obligation=await db.prepare("SELECT * FROM kgame_refund_obligations WHERE source_type='PURCHASE' AND source_id=?").bind(receiptId).first<any>();
  if(obligation){
    await batch.assert('EXISTS(SELECT 1 FROM kgame_refund_obligations WHERE id=? AND amount_cents=? AND settled_cents=?)',[obligation.id,obligation.amount_cents,refunded],'Khoản hoàn vừa thay đổi.');
  }else {
    if(refunded)throw new Error('Thiếu lịch sử hoàn tiền.');
    await batch.assert("NOT EXISTS(SELECT 1 FROM kgame_refund_obligations WHERE source_type='PURCHASE' AND source_id=?)",[receiptId],'Khoản hoàn vừa thay đổi.');
  }
  const refundTotal=Math.max(refunded,paid-total);
  if(refundTotal>0){
    if(supplierId==null)throw new Error('Khoản trả dư phải có nhà cung cấp.');
    batch.add("INSERT INTO kgame_refund_obligations(source_type,source_id,partner_id,flow_type,amount_cents,reason) VALUES('PURCHASE',?,?,'IN',?,'Sửa giảm phiếu đặt nhập') ON CONFLICT(source_type,source_id) DO UPDATE SET amount_cents=excluded.amount_cents",receiptId,supplierId,refundTotal);
  }else if(obligation)batch.add('DELETE FROM kgame_refund_obligations WHERE id=? AND settled_cents=0',obligation.id);
  batch.add('DELETE FROM purchase_items WHERE receipt_code_id=?',receiptId);
  const costs=purchaseCosts(input.items,input.discount_cents??0,input.extra_fee_cents??0,input.other_fee_cents??0);
  let costIndex=0;
  for (const item of input.items) {
    await batch.assert('EXISTS(SELECT 1 FROM products WHERE id=?)',[item.product_id],'Hàng hóa không tồn tại.');
    if (item.product_type_id != null) await batch.assert('EXISTS(SELECT 1 FROM product_types WHERE id=? AND product_id=?)',[item.product_type_id,item.product_id],'Phân loại không thuộc hàng hóa.');
    const cost=costs[costIndex++],fee=cost.fee;
    batch.add(`INSERT INTO purchase_items(receipt_code_id,product_id,product_type_id,product_unit_id,program_code,condition,quantity,unit_cost_cents,discount_cents,allocated_fee_cents,final_cost_cents,item_note,total_cost_cents,allocated_discount_cents)
      VALUES(?,?,?,NULL,?,?,?,?,?,?,?,?,?,?)`,receiptId,item.product_id,item.product_type_id??null,item.program_code?.trim()||null,item.condition,item.quantity,item.unit_cost_cents,item.discount_cents??0,fee,cost.unit,item.item_note??null,cost.total,cost.discount);
  }
  batch.add(`UPDATE purchase_receipts SET supplier_id=?,total_amount_cents=?,debt_amount_cents=?,discount_cents=?,extra_fee_cents=?,extra_fee_category=?,other_fee_cents=?,other_fee_category=?,other_fee_note=?,invoice_number=?,order_receipt_code=?,note=? WHERE id=?`,supplierId,total,Math.max(0,total-paid+refunded),input.discount_cents??0,input.extra_fee_cents??0,input.extra_fee_category??null,input.other_fee_cents??0,input.other_fee_category??null,input.other_fee_note??null,input.invoice_number??null,input.order_receipt_code??null,input.note??null,receiptId);
  await batch.commit();
  return {success:true,receipt_code:receipt.receipt_code};
}
