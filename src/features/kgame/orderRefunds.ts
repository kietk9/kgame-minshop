import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, commitOperation, executeOperation, fingerprint, integer, object, requestKey, text } from './atomic.ts';
import { writeCashEntry } from './cashbook.ts';

export async function settleOrderRefund(db:D1Database, raw:unknown) {
 const input=object(raw),id=integer(input.obligation_id,'Khoản hoàn',1),amount=integer(input.amount_cents,'Tiền thực trả',1);
 if(input.confirmed!==true)throw new Error('Cần xác nhận đã trả tiền thực tế cho khách.');
 if(!['CASH','BANK'].includes(String(input.account_type)))throw new Error('Chọn quỹ tiền mặt hoặc ngân hàng.');
 const account=input.account_type as 'CASH'|'BANK',reference=text(input.reference_code),bank=text(input.bank_name),note=text(input.note),actor=text(input.created_by,'Thu ngân');
 if(account==='BANK'&&!reference)throw new Error('Cần thông tin giao dịch chuyển khoản đã trả.');
 const key=`order-refund:${requestKey(input.request_id)}`,hash=await fingerprint({id,amount,account,reference,bank,note,actor});
 return executeOperation(db,key,hash,async()=>{
  const row=await db.prepare("SELECT * FROM kgame_refund_obligations WHERE id=? AND source_type='ORDER' AND flow_type='OUT'").bind(id).first<any>();
  if(!row)throw new Error('Không tìm thấy khoản hoàn cho khách.');
  const total=integer(row.amount_cents,'Tiền phải hoàn',1),settled=integer(row.settled_cents,'Tiền đã hoàn');
  if(amount>total-settled)throw new Error('Tiền trả vượt khoản còn chờ hoàn.');
  const order=await db.prepare('SELECT * FROM orders WHERE id=?').bind(row.source_id).first<any>();
  if(!order||!['CANCELLED','COMPLETED'].includes(order.order_status)||order.customer_id!==row.partner_id||order.refunded_cents!==settled)throw new Error('Đơn nguồn không khớp khoản hoàn.');
  const cashPaid=(await db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS n FROM payments WHERE order_id=? AND status='CONFIRMED' AND payment_method!='CREDIT'").bind(row.source_id).first<{n:number}>())!.n;
  const expected=order.order_status==='CANCELLED'?cashPaid:Math.max(0,order.paid_amount_cents-order.amount_total_cents+order.returned_amount_cents-order.returned_credit_cents);
  if(total!==expected)throw new Error('Khoản hoàn vượt phần phải trả lại khách.');
  const batch=new AtomicBatch(db);
  await batch.assert("EXISTS(SELECT 1 FROM kgame_refund_obligations WHERE id=? AND source_type='ORDER' AND flow_type='OUT' AND source_id=? AND partner_id=? AND amount_cents=? AND settled_cents=?)",[id,row.source_id,row.partner_id,total,settled],'Khoản hoàn vừa thay đổi.');
  await batch.assert("EXISTS(SELECT 1 FROM orders WHERE id=? AND order_status=? AND customer_id=? AND paid_amount_cents=? AND refunded_cents=? AND returned_amount_cents=? AND returned_credit_cents=? AND amount_total_cents=?)",[row.source_id,order.order_status,row.partner_id,order.paid_amount_cents,settled,order.returned_amount_cents,order.returned_credit_cents,order.amount_total_cents],'Đơn nguồn vừa thay đổi.');
  await batch.assert("(SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE order_id=? AND status='CONFIRMED' AND payment_method!='CREDIT')=?",[row.source_id,cashPaid],'Lịch sử tiền thực thu không khớp.');
  await batch.assert("(SELECT COALESCE(SUM(CASE WHEN flow_type='IN' THEN amount_cents ELSE -amount_cents END),0) FROM cash_transactions WHERE UPPER(reference_type)='ORDER' AND reference_id=? AND category IN ('ORDER_PAYMENT','REFUND') AND COALESCE(status,'ACTIVE')!='CANCELLED')=?",[row.source_id,cashPaid-settled],'Sổ quỹ không khớp khoản hoàn.');
  await batch.assert('(SELECT COALESCE(SUM(amount_cents),0) FROM kgame_refund_settlements WHERE obligation_id=?)=?',[id,settled],'Lịch sử hoàn tiền không khớp.');
  await batch.assert("NOT EXISTS(SELECT 1 FROM kgame_refund_settlements rs LEFT JOIN cash_transactions ct ON ct.id=rs.cash_id WHERE rs.obligation_id=? AND (ct.id IS NULL OR ct.status='CANCELLED' OR ct.flow_type!='OUT' OR ct.category!='REFUND' OR UPPER(ct.reference_type)!='ORDER' OR ct.reference_id!=? OR ct.amount_cents!=rs.amount_cents))",[id,row.source_id],'Phiếu hoàn tiền bị thay đổi.');
  const partner=await db.prepare('SELECT name FROM partners WHERE id=? AND is_customer=1').bind(row.partner_id).first<{name:string}>();
  if(!partner)throw new Error('Khách nhận hoàn không hợp lệ.');
  await batch.assert('EXISTS(SELECT 1 FROM partners WHERE id=? AND is_customer=1)',[row.partner_id],'Khách nhận hoàn vừa thay đổi.');
  writeCashEntry(batch,{flow_type:'OUT',account_type:account,category:'REFUND',amount_cents:amount,reference_type:'ORDER',reference_id:row.source_id,recipient_name:partner.name,bank_name:bank,note:`Hoàn tiền đơn ${order.order_code}: ${reference} ${note}`,created_by:actor},key);
  batch.add('UPDATE orders SET external_refunded_cents=external_refunded_cents+? WHERE id=?',amount,row.source_id);
  batch.add('UPDATE kgame_refund_obligations SET settled_cents=settled_cents+? WHERE id=?',amount,id);
  batch.add("INSERT INTO kgame_operations(operation_key,kind,payload_hash,result_json) SELECT ?,'ORDER_REFUND',?,json_object('success',json('true'),'transaction_code',transaction_code) FROM cash_transactions WHERE operation_key=?",key,hash,key);
  batch.add('INSERT INTO kgame_refund_settlements(obligation_id,amount_cents,cash_id,operation_key) SELECT ?,?,id,? FROM cash_transactions WHERE operation_key=?',id,amount,key,key);
  return commitOperation(batch,key,hash);
 });
}
