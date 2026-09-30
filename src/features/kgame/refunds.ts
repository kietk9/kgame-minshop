import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, commitOperation, executeOperation, fingerprint, integer, object, requestKey, text } from './atomic.ts';
import { writeCashEntry } from './cashbook.ts';

export async function listPurchaseRefunds(db: D1Database, receiptId: number) {
  return (await db.prepare("SELECT * FROM kgame_refund_obligations WHERE source_type = 'PURCHASE' AND source_id = ?").bind(receiptId).all<any>()).results;
}

export async function settleRefund(db: D1Database, raw: unknown): Promise<{success:boolean;transaction_code:string}> {
  const input=object(raw), id=integer(input.obligation_id,'Khoản hoàn tiền',1),amount=integer(input.amount_cents,'Số tiền thực nhận',1);
  if (input.confirmed !== true) throw new Error('Cần xác nhận đã nhận tiền thực tế.');
  if (!['CASH','BANK'].includes(String(input.account_type))) throw new Error('Chọn quỹ tiền mặt hoặc ngân hàng.');
  const account=input.account_type as 'CASH'|'BANK',bank=text(input.bank_name),reference=text(input.reference_code),note=text(input.note),actor=text(input.created_by,'Thu ngân');
  if (account === 'BANK' && !reference) throw new Error('Vui lòng ghi thông tin giao dịch chuyển khoản đã nhận.');
  const key=`refund:${requestKey(input.request_id)}`,hash=await fingerprint({id,amount,account,bank,reference,note,actor});
  return executeOperation(db,key,hash,async()=>{
    const row=await db.prepare('SELECT * FROM kgame_refund_obligations WHERE id = ?').bind(id).first<any>();
    // Other refund sources need their own original-payment/credit rules.
    if (!row || row.source_type !== 'PURCHASE' || row.flow_type !== 'IN') throw new Error('Khoản nhận hoàn tiền NCC không hợp lệ.');
    const total=integer(row.amount_cents,'Tiền phải hoàn',1),settled=integer(row.settled_cents,'Tiền đã hoàn');
    if (amount > total-settled) throw new Error('Tiền nhận vượt khoản còn phải hoàn.');
    const batch=new AtomicBatch(db);
    await batch.assert(`EXISTS(SELECT 1 FROM kgame_refund_obligations WHERE id = ? AND source_type = 'PURCHASE'
      AND source_id = ? AND partner_id = ? AND flow_type = 'IN' AND amount_cents = ? AND settled_cents = ?)`,
      [id,row.source_id,row.partner_id,total,settled],'Khoản hoàn tiền vừa thay đổi.');
    const receipt=await db.prepare('SELECT * FROM purchase_receipts WHERE id=?').bind(row.source_id).first<any>();
    if(!receipt || receipt.supplier_id!==row.partner_id || receipt.refunded_amount_cents!==settled)throw new Error('Chứng từ nguồn không khớp khoản hoàn.');
    const expected=receipt.receipt_status==='CANCELLED'?receipt.paid_amount_cents:Math.max(settled,receipt.paid_amount_cents-receipt.total_amount_cents+(receipt.returned_amount_cents??0));
    if(total!==expected)throw new Error('Khoản hoàn không khớp tiền trả dư của phiếu.');
    await batch.assert('EXISTS(SELECT 1 FROM purchase_receipts WHERE id=? AND supplier_id=? AND receipt_status=? AND paid_amount_cents=? AND total_amount_cents=? AND refunded_amount_cents=? AND returned_amount_cents=?)',
      [row.source_id,row.partner_id,receipt.receipt_status,receipt.paid_amount_cents,receipt.total_amount_cents,settled,receipt.returned_amount_cents??0],'Chứng từ nguồn vừa thay đổi.');
    await batch.assert(`(SELECT COALESCE(SUM(CASE WHEN flow_type='OUT' THEN amount_cents ELSE -amount_cents END),0) FROM cash_transactions WHERE LOWER(reference_type)='purchase_receipt' AND reference_id=? AND category IN ('PURCHASE','DEPOSIT','REFUND') AND COALESCE(status,'ACTIVE')!='CANCELLED')=?`,[row.source_id,receipt.paid_amount_cents-settled],'Sổ quỹ không khớp tiền phiếu.');
    batch.add('UPDATE purchase_receipts SET refunded_amount_cents=refunded_amount_cents+?,debt_amount_cents=? WHERE id=?',amount,receipt.receipt_status==='CANCELLED'?0:Math.max(0,receipt.total_amount_cents-(receipt.returned_amount_cents??0)-receipt.paid_amount_cents+settled+amount),row.source_id);
    await batch.assert('(SELECT COALESCE(SUM(amount_cents),0) FROM kgame_refund_settlements WHERE obligation_id = ?) = ?',
      [id,settled],'Lịch sử hoàn tiền đang lệch.');
    await batch.assert(`NOT EXISTS(SELECT 1 FROM kgame_refund_settlements rs JOIN cash_transactions ct ON ct.id = rs.cash_id
      WHERE rs.obligation_id = ? AND (COALESCE(ct.status,'ACTIVE') = 'CANCELLED' OR ct.amount_cents != rs.amount_cents
      OR ct.flow_type != 'IN' OR ct.category != 'REFUND' OR LOWER(ct.reference_type) != 'purchase_receipt' OR ct.reference_id != ?))`,
      [id,row.source_id],'Phiếu thu hoàn tiền bị thay đổi; cần đối chiếu.');
    await batch.assert('EXISTS(SELECT 1 FROM partners WHERE id = ? AND is_supplier = 1)',[row.partner_id],'Nhà cung cấp không hợp lệ.');
    const partner=await db.prepare('SELECT name FROM partners WHERE id = ?').bind(row.partner_id).first<{name:string}>();
    writeCashEntry(batch,{flow_type:'IN',account_type:account,category:'REFUND',amount_cents:amount,
      reference_type:'purchase_receipt',reference_id:row.source_id,bank_name:bank,recipient_name:partner!.name,
      note:`Nhận hoàn tiền NCC: ${reference}${note ? ' · '+note : ''}`,created_by:actor},key);
    batch.add('UPDATE kgame_refund_obligations SET settled_cents = settled_cents + ? WHERE id = ?',amount,id);
    batch.add(`INSERT INTO kgame_operations(operation_key,kind,payload_hash,result_json)
      SELECT ?,'REFUND_SETTLEMENT',?,json_object('success',json('true'),'transaction_code',transaction_code)
      FROM cash_transactions WHERE operation_key = ?`,key,hash,key);
    batch.add(`INSERT INTO kgame_refund_settlements(obligation_id,amount_cents,cash_id,operation_key)
      SELECT ?,?,id,? FROM cash_transactions WHERE operation_key = ?`,id,amount,key,key);
    return commitOperation(batch,key,hash);
  });
}
