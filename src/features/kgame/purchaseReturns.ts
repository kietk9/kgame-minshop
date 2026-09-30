import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, commitOperation, executeOperation, fingerprint, integer, object, requestKey, text } from './atomic.ts';

export async function listPurchaseReturns(db: D1Database, receiptId: number) {
  return (await db.prepare('SELECT * FROM purchase_returns WHERE receipt_id=? ORDER BY id DESC').bind(receiptId).all<any>()).results;
}

export async function returnPurchase(db: D1Database, raw: unknown): Promise<{success:boolean;id:number;return_code:string;amount_cents:number}> {
  const input=object(raw),receiptId=integer(input.receipt_id,'Phiếu nhập',1),reason=text(input.reason);
  if(!reason)throw new Error('Cần ghi lý do trả hàng.');
  if(input.confirmed!==true)throw new Error('Cần xác nhận đã giao hàng trả cho nhà cung cấp.');
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>100)throw new Error('Chọn từ 1 đến 100 dòng trả hàng.');
  const seen=new Set<number>();
  const items=input.items.map(value=>{const item=object(value),id=integer(item.purchase_item_id,'Dòng nhập',1),quantity=integer(item.quantity,'Số lượng trả',1);if(seen.has(id))throw new Error('Dòng trả hàng bị trùng.');seen.add(id);return {id,quantity};});
  const key=`purchase-return:${requestKey(input.request_id)}`,hash=await fingerprint({receiptId,reason,items});
  return executeOperation(db,key,hash,async()=>{
    const receipt=await db.prepare('SELECT * FROM purchase_receipts WHERE id=?').bind(receiptId).first<any>();
    if(!receipt||receipt.receipt_status!=='COMPLETED')throw new Error('Chỉ trả hàng từ phiếu đã nhận; phiếu đặt nhập chưa nhận cần dùng Hủy.');
    integer(receipt.supplier_id,'Nhà cung cấp',1);
    const total=integer(receipt.total_amount_cents,'Tổng nhập'),paid=integer(receipt.paid_amount_cents,'Đã chi'),refunded=integer(receipt.refunded_amount_cents,'Đã nhận hoàn'),returned=integer(receipt.returned_amount_cents,'Đã trả hàng');
    if(returned>total||refunded>paid||receipt.debt_amount_cents!==Math.max(0,total-returned-paid+refunded))throw new Error('Tiền và nợ phiếu đang lệch; cần đối chiếu trước khi trả hàng.');
    const batch=new AtomicBatch(db),cols=Object.keys(receipt);
    await batch.assert(`EXISTS(SELECT 1 FROM purchase_receipts WHERE ${cols.map(c=>`"${c}" IS ?`).join(' AND ')})`,cols.map(c=>receipt[c]),'Phiếu vừa thay đổi.');
    await batch.assert('EXISTS(SELECT 1 FROM partners WHERE id=? AND is_supplier=1)',[receipt.supplier_id],'Nhà cung cấp không hợp lệ.');
    await batch.assert('(SELECT COALESCE(SUM(amount_cents),0) FROM purchase_returns WHERE receipt_id=?)=?',[receiptId,returned],'Lịch sử trả hàng đang lệch.');
    await batch.assert(`(SELECT COALESCE(SUM(CASE WHEN flow_type='OUT' THEN amount_cents ELSE -amount_cents END),0) FROM cash_transactions WHERE LOWER(reference_type)='purchase_receipt' AND reference_id=? AND category IN ('PURCHASE','DEPOSIT','REFUND') AND COALESCE(status,'ACTIVE')!='CANCELLED')=?`,[receiptId,paid-refunded],'Sổ quỹ không khớp phiếu nhập.');
    const oldObligation=await db.prepare("SELECT * FROM kgame_refund_obligations WHERE source_type='PURCHASE' AND source_id=?").bind(receiptId).first<any>();
    const expectedObligation=Math.max(refunded,paid-total+returned);
    if(oldObligation){
      if(oldObligation.amount_cents!==expectedObligation||oldObligation.settled_cents!==refunded||oldObligation.partner_id!==receipt.supplier_id)throw new Error('Khoản chờ hoàn đang lệch.');
      await batch.assert('EXISTS(SELECT 1 FROM kgame_refund_obligations WHERE id=? AND amount_cents=? AND settled_cents=?)',[oldObligation.id,expectedObligation,refunded],'Khoản hoàn vừa thay đổi.');
    }else{
      if(expectedObligation)throw new Error('Thiếu khoản chờ hoàn của phiếu.');
      await batch.assert("NOT EXISTS(SELECT 1 FROM kgame_refund_obligations WHERE source_type='PURCHASE' AND source_id=?)",[receiptId],'Khoản hoàn vừa thay đổi.');
    }
    const id=(await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM purchase_returns').first<{id:number}>())!.id,code=`THN${String(id).padStart(6,'0')}`;
    const rows:any[]=[],products=new Map<number,any>(),types=new Map<number,any>(),productDemand=new Map<string,number>(),typeDemand=new Map<string,number>();
    let amount=0;
    for(const item of items){
      const line=await db.prepare('SELECT * FROM purchase_items WHERE id=? AND receipt_code_id=?').bind(item.id,receiptId).first<any>();
      if(!line)throw new Error('Dòng hàng không thuộc phiếu nhập.');
      if(line.total_cost_cents==null||line.allocated_discount_cents==null)throw new Error('Phiếu cũ chưa có phân bổ giá vốn được kiểm chứng; cần đối chiếu trước khi trả.');
      const lineQty=integer(line.quantity,'Lượng nhập',1),prior=(await db.prepare('SELECT COALESCE(SUM(quantity),0) AS quantity FROM purchase_return_items WHERE purchase_item_id=?').bind(line.id).first<{quantity:number}>())!.quantity;
      if(item.quantity>lineQty-prior)throw new Error('Lượng trả vượt số đã nhập còn được trả.');
      await batch.assert('(SELECT COALESCE(SUM(quantity),0) FROM purchase_return_items WHERE purchase_item_id=?)=?',[line.id,prior],'Lượng trả vừa thay đổi.');
      const columns=Object.keys(line);await batch.assert(`EXISTS(SELECT 1 FROM purchase_items WHERE ${columns.map(c=>`"${c}" IS ?`).join(' AND ')})`,columns.map(c=>line[c]),'Dòng nhập vừa thay đổi.');
      const value=integer(lineQty*line.unit_cost_cents-line.discount_cents-line.allocated_discount_cents,'Giá trị hàng được trả');
      const portion=(quantity:number)=>Number(BigInt(value)*BigInt(quantity)/BigInt(lineQty));
      const credit=portion(prior+item.quantity)-portion(prior);amount=integer(amount+credit,'Tổng trả hàng');
      const product=products.get(line.product_id)??await db.prepare('SELECT * FROM products WHERE id=?').bind(line.product_id).first<any>();
      const type=types.get(line.product_type_id)??await db.prepare('SELECT * FROM product_types WHERE id=? AND product_id=?').bind(line.product_type_id,line.product_id).first<any>();
      if(!product||!type)throw new Error('Sản phẩm hoặc phân loại không còn hợp lệ.');
      products.set(product.id,product);types.set(type.id,type);
      if(!['NEW','QSD'].includes(line.condition))throw new Error('Tình trạng hàng nhập không hợp lệ.');
      let cost=line.condition==='NEW'?type.cost_price_cents:(type.cost_price_used_cents??product.cost_price_used_cents);
      const serialized=product.tracking_mode==='CODE'||product.has_serial===1||type.tracking_mode==='CODE';
      if(serialized&&!line.product_unit_id)throw new Error('Dòng serial không có mã để đối chiếu.');
      if(line.product_unit_id){
        if(item.quantity!==1||lineQty!==1)throw new Error('Serial phải có số lượng một.');
        const unit=await db.prepare('SELECT * FROM product_units WHERE id=?').bind(line.product_unit_id).first<any>();
        if(!unit||unit.product_type_id!==type.id||unit.condition!==line.condition||unit.owner_type!=='KGAME'||unit.availability!=='IN_STOCK')throw new Error('Serial không sẵn sàng trả; có thể đã bán, giữ chỗ hoặc thuộc khách.');
        const names=Object.keys(unit);await batch.assert(`EXISTS(SELECT 1 FROM product_units WHERE ${names.map(c=>`"${c}" IS ?`).join(' AND ')})`,names.map(c=>unit[c]),'Serial vừa thay đổi.');
        await batch.assert(`NOT EXISTS(SELECT 1 FROM order_units ou JOIN order_lines ol ON ol.id=ou.order_line_id JOIN orders o ON o.id=ol.order_id WHERE ou.product_unit_id=? AND o.order_type='PREORDER' AND o.order_status NOT IN ('CANCELLED','COMPLETED'))`,[unit.id],'Serial đang giữ cho đơn đặt hàng.');
        cost=unit.cost_price_cents;
      }
      const pk=`${product.id}:${line.condition}`,tk=`${type.id}:${line.condition}`;
      productDemand.set(pk,(productDemand.get(pk)??0)+item.quantity);typeDemand.set(tk,(typeDemand.get(tk)??0)+item.quantity);
      rows.push({line,quantity:item.quantity,amount:credit,cost:integer(cost??0,'Giá vốn xuất trả')});
    }
    if(amount>total-returned)throw new Error('Giá trị trả vượt phần còn lại của phiếu.');
    for(const [key,qty] of productDemand){const [pid,condition]=key.split(':'),p=products.get(Number(pid)),column=condition==='NEW'?'stock_new':'stock_used';
      await batch.assert(`EXISTS(SELECT 1 FROM products WHERE id=? AND ${column}>=? AND stock=stock_new+stock_used AND stock_new>=0 AND stock_used>=0 AND typeof(stock)='integer' AND typeof(stock_new)='integer' AND typeof(stock_used)='integer' AND tracking_mode IS ? AND has_serial IS ? AND cost_price_cents IS ? AND cost_price_used_cents IS ?)`,[p.id,qty,p.tracking_mode,p.has_serial,p.cost_price_cents,p.cost_price_used_cents],'Không đủ tồn hoặc giá vốn vừa thay đổi.');}
    for(const [key,qty] of typeDemand){const [tid,condition]=key.split(':'),t=types.get(Number(tid)),column=condition==='NEW'?'cached_stock_new':'cached_stock_used';
      await batch.assert(`EXISTS(SELECT 1 FROM product_types WHERE id=? AND ${column}>=? AND typeof(${column})='integer' AND product_id=? AND tracking_mode IS ? AND cost_price_cents IS ? AND cost_price_used_cents IS ?)`,[t.id,qty,t.product_id,t.tracking_mode,t.cost_price_cents,t.cost_price_used_cents],'Không đủ tồn phân loại hoặc giá vốn vừa thay đổi.');}
    batch.add('INSERT INTO purchase_returns(id,return_code,receipt_id,supplier_id,amount_cents,reason,operation_key) VALUES(?,?,?,?,?,?,?)',id,code,receiptId,receipt.supplier_id,amount,reason,key);
    for(const row of rows){const line=row.line,pcol=line.condition==='NEW'?'stock_new':'stock_used',tcol=line.condition==='NEW'?'cached_stock_new':'cached_stock_used';
      batch.add('INSERT INTO purchase_return_items(return_id,purchase_item_id,quantity,amount_cents,stock_cost_cents) VALUES(?,?,?,?,?)',id,line.id,row.quantity,row.amount,integer(row.quantity*row.cost,'Tổng giá vốn xuất trả'));
      batch.add(`UPDATE products SET stock=stock-?,${pcol}=${pcol}-? WHERE id=?`,row.quantity,row.quantity,line.product_id);
      batch.add(`UPDATE product_types SET ${tcol}=${tcol}-? WHERE id=?`,row.quantity,line.product_type_id);
      if(line.product_unit_id)batch.add("UPDATE product_units SET availability='RETURNED_SUPPLIER',owner_type='SUPPLIER',owner_id=?,updated_at=datetime('now') WHERE id=?",receipt.supplier_id,line.product_unit_id);
      batch.add(`INSERT INTO inventory_transactions(product_id,product_type_id,product_unit_id,condition,quantity,transaction_type,reference_type,reference_id,unit_cost_cents,note) VALUES(?,?,?,?,?,'SUPPLIER_RETURN','purchase_return',?,?,?)`,line.product_id,line.product_type_id,line.product_unit_id,line.condition,-row.quantity,id,row.cost,`${code}: ${reason}`);
    }
    const newReturned=returned+amount,obligation=Math.max(refunded,paid-(total-newReturned));
    if(obligation>0)batch.add(`INSERT INTO kgame_refund_obligations(source_type,source_id,partner_id,flow_type,amount_cents,reason) VALUES('PURCHASE',?,?,'IN',?,'Trả hàng nhập') ON CONFLICT(source_type,source_id) DO UPDATE SET amount_cents=excluded.amount_cents`,receiptId,receipt.supplier_id,obligation);
    batch.add('UPDATE purchase_receipts SET returned_amount_cents=?,debt_amount_cents=? WHERE id=?',newReturned,Math.max(0,total-newReturned-paid+refunded),receiptId);
    const result={success:true,id,return_code:code,amount_cents:amount};
    batch.add("INSERT INTO kgame_operations(operation_key,kind,payload_hash,result_json) VALUES(?,'PURCHASE_RETURN',?,?)",key,hash,JSON.stringify(result));
    return commitOperation(batch,key,hash);
  });
}
