import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, commitOperation, executeOperation, fingerprint, integer, object, requestKey, text } from './atomic.ts';

/** Inspection changes sellable stock, never the customer's already agreed refund. */
export async function inspectCustomerReturn(db:D1Database,raw:unknown):Promise<{success:boolean;inspection_id:number;order_id:number}> {
 const input=object(raw),id=integer(input.return_item_id,'Dòng trả hàng',1),quantity=integer(input.quantity,'Số lượng kiểm tra',1);
 const decision=text(input.decision),condition=decision==='RESTOCK'?text(input.condition):null,note=text(input.note),actor=text(input.created_by,'Thu ngân');
 if(!['RESTOCK','REJECT'].includes(decision))throw new Error('Chọn nhập lại kho bán hoặc giữ hàng lỗi.');
 if(input.confirmed!==true||!note)throw new Error('Cần xác nhận kiểm tra và ghi kết quả.');
 if(decision==='RESTOCK'&&(!['NEW','QSD'].includes(condition!)||input.resale_confirmed!==true))throw new Error('Cần xác nhận hàng đủ điều kiện bán lại và chọn tình trạng.');
 const resale=input.resale_confirmed===true,key=`return-inspection:${requestKey(input.request_id)}`,hash=await fingerprint({id,quantity,decision,condition,note,actor,resale});
 return executeOperation(db,key,hash,async()=>{
  const item=await db.prepare('SELECT * FROM customer_return_items WHERE id=?').bind(id).first<any>();
  if(!item)throw new Error('Không tìm thấy dòng hàng trả.');
  const qty=integer(item.quantity,'Lượng nhận trả',1),stocked=integer(item.restocked_quantity,'Lượng đã nhập lại'),rejected=integer(item.rejected_quantity,'Lượng hàng lỗi'),restored=integer(item.restocked_cost_cents,'Giá vốn đã nhập lại');
  if(item.inspection_status!=='PENDING'||quantity>qty-stocked-rejected)throw new Error('Số lượng vượt phần còn chờ kiểm tra.');
  const receipt=await db.prepare('SELECT * FROM customer_returns WHERE id=?').bind(item.return_id).first<any>();
  const line=await db.prepare('SELECT * FROM order_lines WHERE id=? AND order_id=?').bind(item.order_line_id,receipt?.order_id??0).first<any>();
  const order=receipt?await db.prepare('SELECT order_status,customer_id FROM orders WHERE id=?').bind(receipt.order_id).first<any>():null;
  if(!receipt||!line||!order||order.order_status!=='COMPLETED'||order.customer_id!==receipt.customer_id)throw new Error('Phiếu trả và đơn bán không khớp.');
  const batch=new AtomicBatch(db);
  for(const [table,row] of [['customer_return_items',item],['customer_returns',receipt],['order_lines',line]] as const){const columns=Object.keys(row);await batch.assert(`EXISTS(SELECT 1 FROM ${table} WHERE ${columns.map(c=>`"${c}" IS ?`).join(' AND ')})`,columns.map(c=>row[c]),'Chứng từ trả vừa thay đổi.');}
  await batch.assert("EXISTS(SELECT 1 FROM orders WHERE id=? AND order_status='COMPLETED' AND customer_id=?)",[receipt.order_id,receipt.customer_id],'Đơn nguồn vừa thay đổi.');
  await batch.assert("(SELECT COALESCE(SUM(CASE WHEN decision='RESTOCK' THEN quantity ELSE 0 END),0) FROM customer_return_inspections WHERE return_item_id=?)=? AND (SELECT COALESCE(SUM(CASE WHEN decision='REJECT' THEN quantity ELSE 0 END),0) FROM customer_return_inspections WHERE return_item_id=?)=? AND (SELECT COALESCE(SUM(restored_cost_cents),0) FROM customer_return_inspections WHERE return_item_id=?)=?",[id,stocked,id,rejected,id,restored],'Lịch sử kiểm tra không khớp.');
  await batch.assert('(SELECT COALESCE(SUM(quantity),0) FROM customer_return_items WHERE order_line_id=?)<=?',[line.id,line.quantity],'Lượng trả vượt lịch sử bán.');
  const product=await db.prepare('SELECT * FROM products WHERE id=?').bind(line.product_id).first<any>();
  const type=await db.prepare('SELECT * FROM product_types WHERE id=? AND product_id=?').bind(line.product_type_id,line.product_id).first<any>();
  if(!product||!type)throw new Error('Sản phẩm/phân loại nguồn không còn hợp lệ.');
  const units=(await db.prepare('SELECT pu.* FROM product_units pu JOIN order_units ou ON ou.product_unit_id=pu.id WHERE ou.order_line_id=?').bind(line.id).all<any>()).results;
  const serialized=product.tracking_mode==='CODE'||product.has_serial===1||type.tracking_mode==='CODE';
  if(serialized&&!units.length)throw new Error('Thiếu serial nguồn.');
  if(units.length&& (units.length!==1||line.quantity!==1||qty!==1||quantity!==1))throw new Error('Serial phải kiểm tra theo từng mã.');
  await batch.assert('(SELECT COUNT(*) FROM order_units WHERE order_line_id=?)=?',[line.id,units.length],'Liên kết serial vừa thay đổi.');
  const unit=units[0];
  if(unit){
   await batch.assert("EXISTS(SELECT 1 FROM product_units WHERE id=? AND availability='RETURN_INSPECTION' AND owner_type='KGAME' AND owner_id IS NULL AND product_type_id=? AND condition=?) AND EXISTS(SELECT 1 FROM order_units WHERE order_line_id=? AND product_unit_id=?) AND (SELECT reference_id FROM inventory_transactions WHERE product_unit_id=? AND transaction_type='SALE' ORDER BY id DESC LIMIT 1)=?",[unit.id,type.id,line.condition,line.id,unit.id,unit.id,receipt.order_id],'Serial không còn ở khu chờ kiểm tra của đơn.');
   await batch.assert("NOT EXISTS(SELECT 1 FROM order_units ou JOIN order_lines ol ON ol.id=ou.order_line_id JOIN orders o ON o.id=ol.order_id WHERE ou.product_unit_id=? AND o.order_type='PREORDER' AND o.order_status NOT IN ('COMPLETED','CANCELLED'))",[unit.id],'Serial đang bị giữ cho đơn khác.');
  }
  let restoredCost=0;
  const inspectionId=(await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM customer_return_inspections').first<{id:number}>())!.id;
  if(decision==='RESTOCK'){
   if(line.condition==='QSD'&&condition==='NEW')throw new Error('Hàng đã bán qua sử dụng không được đổi thành hàng mới khi nhận lại.');
   const cost=integer(line.unit_cost_cents,'Giá vốn gốc'),pcol=condition==='NEW'?'stock_new':'stock_used',tcol=condition==='NEW'?'cached_stock_new':'cached_stock_used',ccol=condition==='NEW'?'cost_price_cents':'cost_price_used_cents';
   restoredCost=integer(quantity*cost,'Giá vốn nhập lại');
   for(const [table,row] of [['products',product],['product_types',type]] as const){const cols=Object.keys(row);await batch.assert(`EXISTS(SELECT 1 FROM ${table} WHERE ${cols.map(c=>`"${c}" IS ?`).join(' AND ')})`,cols.map(c=>row[c]),'Tồn hoặc giá vốn vừa thay đổi.');}
   integer(product.stock_new,'Tồn mới');integer(product.stock_used,'Tồn cũ');integer(type.cached_stock_new,'Tồn phân loại mới');integer(type.cached_stock_used,'Tồn phân loại cũ');
   if(product.stock!==product.stock_new+product.stock_used)throw new Error('Tồn tổng không khớp mới/cũ.');
   const average=(stock:number,oldCost:number)=>{integer(stock,'Tồn hiện tại');integer(oldCost,'Giá vốn hiện tại');const total=BigInt(stock)*BigInt(oldCost)+BigInt(restoredCost),den=BigInt(stock+quantity);return integer(Number((total+den/2n)/den),'Giá vốn bình quân');};
   const productAverage=average(product[pcol],product[ccol]??product.cost_price_cents??0),typeAverage=average(type[tcol],type[ccol]??product[ccol]??product.cost_price_cents??0);
   integer(product.stock+quantity,'Tồn sau nhập lại');integer(type[tcol]+quantity,'Tồn phân loại sau nhập lại');
   batch.add(`UPDATE products SET stock=stock+?,${pcol}=${pcol}+?,${ccol}=? WHERE id=?`,quantity,quantity,productAverage,product.id);
   batch.add(`UPDATE product_types SET ${tcol}=${tcol}+?,${ccol}=? WHERE id=?`,quantity,typeAverage,type.id);
   if(unit)batch.add("UPDATE product_units SET availability='IN_STOCK',condition=?,cost_price_cents=?,updated_at=datetime('now') WHERE id=?",condition,cost,unit.id);
   batch.add("INSERT INTO inventory_transactions(product_id,product_type_id,product_unit_id,condition,quantity,transaction_type,reference_type,reference_id,unit_cost_cents,location_id,note,created_by) VALUES(?,?,?,?,?,'CUSTOMER_RETURN','customer_return_inspection',?,?,'MAIN',?,?)",product.id,type.id,unit?.id??null,condition,quantity,inspectionId,cost,`${receipt.return_code}: ${note}`,actor);
  }else if(unit)batch.add("UPDATE product_units SET availability='RETURN_REJECTED',updated_at=datetime('now') WHERE id=?",unit.id);
  const newStocked=stocked+(decision==='RESTOCK'?quantity:0),newRejected=rejected+(decision==='REJECT'?quantity:0),status=newStocked+newRejected<qty?'PENDING':newStocked?'RESTOCKED':'REJECTED';
  batch.add('UPDATE customer_return_items SET restocked_quantity=?,rejected_quantity=?,restocked_cost_cents=restocked_cost_cents+?,inspection_status=? WHERE id=?',newStocked,newRejected,restoredCost,status,id);
  batch.add('INSERT INTO customer_return_inspections(id,return_item_id,quantity,decision,restock_condition,restored_cost_cents,note,inspected_by,resale_confirmed,operation_key) VALUES(?,?,?,?,?,?,?,?,?,?)',inspectionId,id,quantity,decision,condition,restoredCost,note,actor,resale?1:0,key);
  const result={success:true,inspection_id:inspectionId,order_id:receipt.order_id};batch.add("INSERT INTO kgame_operations(operation_key,kind,payload_hash,result_json) VALUES(?,'RETURN_INSPECTION',?,?)",key,hash,JSON.stringify(result));return commitOperation(batch,key,hash);
 });
}
