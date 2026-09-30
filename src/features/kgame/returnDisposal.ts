import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, commitOperation, executeOperation, fingerprint, integer, object, requestKey, text } from './atomic.ts';

/** Rejected goods are already outside sellable stock. Disposal records custody,
 * never another stock deduction, cost reversal or customer settlement. */
export async function disposeCustomerReturn(db:D1Database,raw:unknown):Promise<{success:boolean;id:number;disposal_code:string;order_id:number}> {
 const input=object(raw),id=integer(input.return_item_id,'Dòng trả hàng',1),quantity=integer(input.quantity,'Số lượng tiêu hủy',1);
 const reason=text(input.reason),actor=text(input.created_by,'Thu ngân');
 if(input.confirmed!==true||!reason)throw new Error('Cần ghi lý do và xác nhận đã tiêu hủy hoặc vô hiệu hóa hàng lỗi.');
 const key=`return-disposal:${requestKey(input.request_id)}`,hash=await fingerprint({id,quantity,reason,actor});
 return executeOperation(db,key,hash,async()=>{
  const item=await db.prepare('SELECT * FROM customer_return_items WHERE id=?').bind(id).first<any>();
  if(!item)throw new Error('Không tìm thấy dòng hàng trả.');
  const received=integer(item.quantity,'Lượng nhận trả',1),stocked=integer(item.restocked_quantity,'Lượng nhập lại'),rejected=integer(item.rejected_quantity,'Lượng kết luận lỗi'),disposed=integer(item.disposed_quantity,'Lượng đã tiêu hủy');
  if(stocked+rejected>received||disposed>rejected||quantity>rejected-disposed)throw new Error('Số lượng vượt hàng lỗi còn giữ riêng hoặc lịch sử số lượng không khớp.');
  const receipt=await db.prepare('SELECT * FROM customer_returns WHERE id=?').bind(item.return_id).first<any>();
  const line=await db.prepare('SELECT * FROM order_lines WHERE id=? AND order_id=?').bind(item.order_line_id,receipt?.order_id??0).first<any>();
  if(!receipt||!line)throw new Error('Phiếu trả và đơn bán không khớp.');
  const batch=new AtomicBatch(db);
  for(const [table,row] of [['customer_return_items',item],['customer_returns',receipt],['order_lines',line]] as const){
   const cols=Object.keys(row);await batch.assert(`EXISTS(SELECT 1 FROM ${table} WHERE ${cols.map(c=>`"${c}" IS ?`).join(' AND ')})`,cols.map(c=>row[c]),'Chứng từ trả vừa thay đổi.');
  }
  await batch.assert("EXISTS(SELECT 1 FROM orders WHERE id=? AND order_status='COMPLETED' AND customer_id=?)",[receipt.order_id,receipt.customer_id],'Đơn nguồn không còn hợp lệ.');
  await batch.assert("(SELECT COALESCE(SUM(quantity),0) FROM customer_return_inspections WHERE return_item_id=? AND decision='REJECT')=? AND (SELECT COALESCE(SUM(quantity),0) FROM customer_return_inspections WHERE return_item_id=? AND decision='RESTOCK')=? AND (SELECT COALESCE(SUM(restored_cost_cents),0) FROM customer_return_inspections WHERE return_item_id=?)=?",[id,rejected,id,stocked,id,item.restocked_cost_cents],'Lịch sử kiểm tra không khớp.');
  await batch.assert('(SELECT COALESCE(SUM(quantity),0) FROM customer_return_disposals WHERE return_item_id=?)=?',[id,disposed],'Lịch sử tiêu hủy không khớp.');
  await batch.assert('(SELECT COALESCE(SUM(quantity),0) FROM customer_return_items WHERE order_line_id=?)<=?',[line.id,line.quantity],'Lượng trả vượt lịch sử bán.');
  const product=await db.prepare('SELECT * FROM products WHERE id=?').bind(line.product_id).first<any>();
  const type=await db.prepare('SELECT * FROM product_types WHERE id=? AND product_id=?').bind(line.product_type_id,line.product_id).first<any>();
  if(!product||!type)throw new Error('Sản phẩm/phân loại nguồn không còn hợp lệ.');
  await batch.assert('EXISTS(SELECT 1 FROM products WHERE id=? AND tracking_mode IS ? AND has_serial IS ?) AND EXISTS(SELECT 1 FROM product_types WHERE id=? AND product_id=? AND tracking_mode IS ?)',[product.id,product.tracking_mode,product.has_serial,type.id,product.id,type.tracking_mode],'Cách quản lý hàng vừa thay đổi.');
  const units=(await db.prepare('SELECT pu.* FROM product_units pu JOIN order_units ou ON ou.product_unit_id=pu.id WHERE ou.order_line_id=?').bind(line.id).all<any>()).results;
  const serialized=product.tracking_mode==='CODE'||product.has_serial===1||type.tracking_mode==='CODE';
  if(serialized&&!units.length)throw new Error('Thiếu serial nguồn.');
  if(units.length&&(units.length!==1||line.quantity!==1||received!==1||quantity!==1))throw new Error('Serial phải xử lý theo từng mã.');
  await batch.assert('(SELECT COUNT(*) FROM order_units WHERE order_line_id=?)=?',[line.id,units.length],'Liên kết serial vừa thay đổi.');
  const unit=units[0];
  if(unit){
   await batch.assert("EXISTS(SELECT 1 FROM product_units WHERE id=? AND availability='RETURN_REJECTED' AND owner_type='KGAME' AND owner_id IS NULL AND product_type_id=? AND condition=?) AND EXISTS(SELECT 1 FROM order_units WHERE order_line_id=? AND product_unit_id=?) AND (SELECT reference_id FROM inventory_transactions WHERE product_unit_id=? AND transaction_type='SALE' ORDER BY id DESC LIMIT 1)=?",[unit.id,type.id,line.condition,line.id,unit.id,unit.id,receipt.order_id],'Serial không còn là hàng lỗi của đơn này.');
   await batch.assert("NOT EXISTS(SELECT 1 FROM order_units ou JOIN order_lines ol ON ol.id=ou.order_line_id JOIN orders o ON o.id=ol.order_id WHERE ou.product_unit_id=? AND o.order_type='PREORDER' AND o.order_status NOT IN ('COMPLETED','CANCELLED'))",[unit.id],'Serial đang bị giữ cho đơn khác.');
   batch.add("UPDATE product_units SET availability='DISPOSED',updated_at=datetime('now') WHERE id=?",unit.id);
  }
  const cost=integer(quantity*integer(line.unit_cost_cents,'Giá vốn gốc'),'Giá vốn gốc của phần tiêu hủy');
  const disposalId=(await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM customer_return_disposals').first<{id:number}>())!.id;
  const code='THL'+String(disposalId).padStart(6,'0');
  batch.add('UPDATE customer_return_items SET disposed_quantity=disposed_quantity+? WHERE id=?',quantity,id);
  batch.add('INSERT INTO customer_return_disposals(id,disposal_code,return_item_id,quantity,product_unit_id,original_cost_cents,reason,created_by,operation_key) VALUES(?,?,?,?,?,?,?,?,?)',disposalId,code,id,quantity,unit?.id??null,cost,reason,actor,key);
  const result={success:true,id:disposalId,disposal_code:code,order_id:receipt.order_id};
  batch.add("INSERT INTO kgame_operations(operation_key,kind,payload_hash,result_json) VALUES(?,'RETURN_DISPOSAL',?,?)",key,hash,JSON.stringify(result));
  return commitOperation(batch,key,hash);
 });
}
