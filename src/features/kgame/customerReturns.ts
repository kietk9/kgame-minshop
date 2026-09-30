import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, commitOperation, executeOperation, fingerprint, integer, object, requestKey, text } from './atomic.ts';
import { purchaseCosts } from './purchaseCost.ts';
import { writeCustomerCredit } from './credit.ts';

/** Received goods remain unavailable until a separate inspection releases them. */
export async function returnCustomerGoods(db:D1Database,raw:unknown):Promise<{success:boolean;id:number;return_code:string;amount_cents:number}>{
 const input=object(raw),orderId=integer(input.order_id,'Đơn bán',1),reason=text(input.reason),actor=text(input.created_by,'Thu ngân');
 const customerId=input.customer_id==null?null:integer(input.customer_id,'Khách nhận hoàn',1);
 if(!reason||input.confirmed!==true)throw new Error('Cần lý do và xác nhận đã nhận lại hàng/quyền sử dụng.');
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>100)throw new Error('Chọn dòng hàng trả.');
 const seen=new Set<number>();
 const items=input.items.map(raw=>{const item=object(raw),id=integer(item.order_line_id,'Dòng bán',1),quantity=integer(item.quantity,'Lượng trả',1);if(seen.has(id))throw new Error('Trùng dòng trả.');seen.add(id);return {id,quantity};});
 const key=`customer-return:${requestKey(input.request_id)}`,hash=await fingerprint({orderId,customerId,reason,items,actor});
 return executeOperation(db,key,hash,async()=>{
  const order=await db.prepare('SELECT * FROM orders WHERE id=? AND order_code IS NOT NULL').bind(orderId).first<any>();
  if(!order||order.order_status!=='COMPLETED')throw new Error('Chỉ lập trả hàng cho đơn đã hoàn tất giao.');
  const partner=order.customer_id??customerId;
  if(!partner||(customerId&&order.customer_id&&customerId!==order.customer_id))throw new Error('Chọn đúng khách của đơn để nhận hoàn.');
  const total=integer(order.amount_total_cents,'Tổng đơn'),paid=integer(order.paid_amount_cents,'Đã trả'),returned=integer(order.returned_amount_cents,'Giá trị đã trả hàng'),refunded=integer(order.refunded_cents,'Tiền đã hoàn'),creditReturned=integer(order.returned_credit_cents,'Số dư đã hoàn');
  if(order.cod_amount_cents!==Math.max(0,total-returned-paid+refunded+creditReturned))throw new Error('Nợ đơn không khớp; cần đối chiếu trước khi trả hàng.');
  const batch=new AtomicBatch(db),cols=Object.keys(order);
  await batch.assert(`EXISTS(SELECT 1 FROM orders WHERE ${cols.map(c=>`"${c}" IS ?`).join(' AND ')})`,cols.map(c=>order[c]),'Đơn vừa thay đổi.');
  await batch.assert('EXISTS(SELECT 1 FROM partners WHERE id=? AND is_customer=1)',[partner],'Khách không hợp lệ.');
  await batch.assert('(SELECT COALESCE(SUM(amount_cents),0) FROM customer_returns WHERE order_id=?)=?',[orderId,returned],'Lịch sử trả hàng không khớp.');
  const payments=await db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS total,COALESCE(SUM(CASE WHEN payment_method='CREDIT' THEN amount_cents ELSE 0 END),0) AS credit FROM payments WHERE order_id=? AND status='CONFIRMED'").bind(orderId).first<any>();
  if(payments.total!==paid)throw new Error('Lịch sử thanh toán không khớp.');
  await batch.assert("(SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE order_id=? AND status='CONFIRMED')=? AND (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE order_id=? AND status='CONFIRMED' AND payment_method='CREDIT')=?",[orderId,paid,orderId,payments.credit],'Thanh toán vừa thay đổi.');
  if(payments.credit)await batch.assert("(SELECT -COALESCE(SUM(amount_cents),0) FROM customer_credit_entries WHERE reference_type='ORDER_PAYMENT' AND reference_id=? AND partner_id=?)=?",[orderId,partner,payments.credit],'Lịch sử dùng số dư không khớp.');
  await batch.assert("(SELECT COALESCE(SUM(CASE WHEN flow_type='IN' THEN amount_cents ELSE -amount_cents END),0) FROM cash_transactions WHERE UPPER(reference_type)='ORDER' AND reference_id=? AND category IN ('ORDER_PAYMENT','REFUND') AND COALESCE(status,'ACTIVE')!='CANCELLED')=?",[orderId,paid-payments.credit-refunded],'Sổ quỹ lệch tiền đơn.');
  await batch.assert("(SELECT COALESCE(SUM(ce.amount_cents),0) FROM customer_credit_entries ce JOIN customer_returns cr ON ce.reference_type='CUSTOMER_RETURN' AND ce.reference_id=cr.id WHERE cr.order_id=? AND ce.partner_id=?)=?",[orderId,partner,creditReturned],'Lịch sử hoàn số dư không khớp.');
  const oldDue=Math.max(0,paid-total+returned),oldCashDue=oldDue-creditReturned;
  if(creditReturned!==Math.min(payments.credit,oldDue)||oldCashDue<refunded)throw new Error('Tiền hoàn/số dư không khớp hàng đã trả.');
  const obligation=await db.prepare("SELECT * FROM kgame_refund_obligations WHERE source_type='ORDER' AND source_id=?").bind(orderId).first<any>();
  if(obligation){if(obligation.amount_cents!==oldCashDue||obligation.settled_cents!==refunded||obligation.partner_id!==partner||obligation.flow_type!=='OUT')throw new Error('Khoản hoàn không khớp.');await batch.assert('EXISTS(SELECT 1 FROM kgame_refund_obligations WHERE id=? AND amount_cents=? AND settled_cents=?)',[obligation.id,oldCashDue,refunded],'Khoản hoàn vừa thay đổi.');}
  else {if(oldCashDue||refunded)throw new Error('Thiếu khoản hoàn nguồn.');await batch.assert("NOT EXISTS(SELECT 1 FROM kgame_refund_obligations WHERE source_type='ORDER' AND source_id=?)",[orderId],'Khoản hoàn vừa thay đổi.');}
  const lines=(await db.prepare('SELECT * FROM order_lines WHERE order_id=? ORDER BY id').bind(orderId).all<any>()).results;
  if(!lines.length)throw new Error('Đơn cũ thiếu dòng hàng; cần đối chiếu.');
  const costs=purchaseCosts(lines.map(l=>({quantity:l.quantity,unit_cost_cents:l.unit_price_cents,discount_cents:l.discount_cents})),order.discount_cents);
  if(costs.reduce((s,c)=>s+c.total,0)+order.shipping_cents!==total)throw new Error('Tổng dòng và chiết khấu không khớp đơn.');
  await batch.assert('(SELECT COUNT(*) FROM order_lines WHERE order_id=?)=?',[orderId,lines.length],'Dòng bán vừa thay đổi.');
  for(const l of lines){const keys=Object.keys(l);await batch.assert(`EXISTS(SELECT 1 FROM order_lines WHERE ${keys.map(c=>`"${c}" IS ?`).join(' AND ')})`,keys.map(c=>l[c]),'Dòng bán vừa thay đổi.');}
  const rows:any[]=[];let amount=0;
  for(const item of items){
   const index=lines.findIndex(l=>l.id===item.id),line=lines[index];if(!line)throw new Error('Dòng trả không thuộc đơn.');
   const prior=(await db.prepare('SELECT COALESCE(SUM(quantity),0) AS n FROM customer_return_items WHERE order_line_id=?').bind(line.id).first<{n:number}>())!.n;
   if(item.quantity>line.quantity-prior)throw new Error('Lượng trả vượt số đã giao còn lại.');
   await batch.assert('(SELECT COALESCE(SUM(quantity),0) FROM customer_return_items WHERE order_line_id=?)=?',[line.id,prior],'Lượng trả vừa thay đổi.');
   const soldSame=lines.filter(l=>l.product_id===line.product_id&&l.product_type_id===line.product_type_id&&l.condition===line.condition).reduce((s,l)=>s+l.quantity,0);
   await batch.assert("(SELECT COALESCE(-SUM(quantity),0) FROM inventory_transactions WHERE UPPER(reference_type)='ORDER' AND reference_id=? AND product_id=? AND product_type_id IS ? AND condition=? AND transaction_type IN ('SALE','SALE_REVERSE','CANCEL'))=?",[orderId,line.product_id,line.product_type_id,line.condition,soldSame],'Lịch sử xuất kho không đủ đối chiếu.');
   const units=(await db.prepare('SELECT pu.* FROM order_units ou JOIN product_units pu ON pu.id=ou.product_unit_id WHERE ou.order_line_id=?').bind(line.id).all<any>()).results;
   await batch.assert('(SELECT COUNT(*) FROM order_units WHERE order_line_id=?)=?',[line.id,units.length],'Mã giao hàng vừa thay đổi.');
   if(units.length){
    if(units.length!==1||line.quantity!==1||item.quantity!==1)throw new Error('Serial phải trả theo dòng một mã.');
    const unit=units[0];if(unit.availability!=='SOLD')throw new Error('Serial đã được xử lý ở nơi khác.');
    await batch.assert("EXISTS(SELECT 1 FROM product_units WHERE id=? AND availability='SOLD' AND owner_type IS ? AND owner_id IS ?) AND EXISTS(SELECT 1 FROM order_units WHERE order_line_id=? AND product_unit_id=?) AND (SELECT reference_id FROM inventory_transactions WHERE product_unit_id=? AND transaction_type='SALE' ORDER BY id DESC LIMIT 1)=?",[unit.id,unit.owner_type,unit.owner_id,line.id,unit.id,unit.id,orderId],'Serial vừa thay đổi.');
    batch.add("UPDATE product_units SET availability='RETURN_INSPECTION',owner_type='KGAME',owner_id=NULL,updated_at=datetime('now') WHERE id=?",unit.id);
   }else{
    const p=await db.prepare('SELECT tracking_mode,has_serial FROM products WHERE id=?').bind(line.product_id).first<any>();
    const t=line.product_type_id?await db.prepare('SELECT tracking_mode FROM product_types WHERE id=?').bind(line.product_type_id).first<any>():null;
    if(t)await batch.assert('EXISTS(SELECT 1 FROM product_types WHERE id=? AND product_id=? AND tracking_mode IS ?)',[line.product_type_id,line.product_id,t.tracking_mode],'Phân loại vừa thay đổi.');
    if(!p||p.tracking_mode==='CODE'||p.has_serial||t?.tracking_mode==='CODE')throw new Error('Thiếu serial nguồn để nhận trả.');
    await batch.assert('EXISTS(SELECT 1 FROM products WHERE id=? AND tracking_mode IS ? AND has_serial IS ?)',[line.product_id,p.tracking_mode,p.has_serial],'Cách quản lý hàng vừa thay đổi.');
   }
   const value=costs[index].total,portion=(q:number)=>Number(BigInt(value)*BigInt(q)/BigInt(line.quantity));
   const credit=portion(prior+item.quantity)-portion(prior);amount=integer(amount+credit,'Tổng hàng trả');rows.push({line,quantity:item.quantity,amount:credit});
  }
  const newReturned=integer(returned+amount,'Tổng đã trả');if(newReturned>total)throw new Error('Trả vượt tổng đơn.');
  const due=Math.max(0,paid-total+newReturned),newCredit=Math.min(payments.credit,due),cashDue=due-newCredit;
  const id=(await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM customer_returns').first<{id:number}>())!.id,code=`THB${String(id).padStart(6,'0')}`;
  batch.add('INSERT INTO customer_returns(id,return_code,order_id,customer_id,amount_cents,reason,operation_key) VALUES(?,?,?,?,?,?,?)',id,code,orderId,partner,amount,reason,key);
  for(const row of rows)batch.add('INSERT INTO customer_return_items(return_id,order_line_id,quantity,amount_cents) VALUES(?,?,?,?)',id,row.line.id,row.quantity,row.amount);
  if(newCredit>creditReturned)await writeCustomerCredit(batch,partner,newCredit-creditReturned,'CUSTOMER_RETURN','?',[id],key,`Hoàn số dư ${code}`,actor);
  if(cashDue)batch.add("INSERT INTO kgame_refund_obligations(source_type,source_id,partner_id,flow_type,amount_cents,reason) VALUES('ORDER',?,?,'OUT',?,?) ON CONFLICT(source_type,source_id) DO UPDATE SET amount_cents=excluded.amount_cents",orderId,partner,cashDue,reason);
  const debt=Math.max(0,total-newReturned-paid+refunded+newCredit);
  batch.add('UPDATE orders SET customer_id=?,returned_amount_cents=?,returned_credit_cents=?,cod_amount_cents=?,payment_status=? WHERE id=?',partner,newReturned,newCredit,debt,debt===0?'PAID':paid>0?'PARTIALLY_PAID':'UNPAID',orderId);
  batch.add('UPDATE shipments SET cod_amount_cents=? WHERE order_id=?',debt,orderId);
  const result={success:true,id,return_code:code,amount_cents:amount};batch.add("INSERT INTO kgame_operations(operation_key,kind,payload_hash,result_json) VALUES(?,'CUSTOMER_RETURN',?,?)",key,hash,JSON.stringify(result));return commitOperation(batch,key,hash);
 });
}
