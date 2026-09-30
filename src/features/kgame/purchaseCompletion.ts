import { purchaseCosts } from './purchaseCost.ts';
import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, commitOperation, executeOperation, fingerprint, integer, object, requestKey, text } from './atomic.ts';
import { validatePurchaseCompletion } from './purchaseValidation.ts';
import { writeCashEntry } from './cashbook.ts';

// Rows are read from fixed internal tables, not from browser-provided SQL.
async function unchanged(batch: AtomicBatch, table: string, row: Record<string, any>) {
  const columns=Object.keys(row);
  await batch.assert(`EXISTS(SELECT 1 FROM ${table} WHERE ${columns.map(c=>`"${c}" IS ?`).join(' AND ')})`,columns.map(c=>row[c]),'Phiếu, hàng hóa hoặc phân loại vừa thay đổi.');
}

export async function completePurchaseReceipt(db: D1Database, receiptId: number, raw?: unknown): Promise<{success:boolean;receipt_code:string}> {
  integer(receiptId,'Phiếu nhập',1);
  const input=raw==null?{}:object(raw),additional=integer(input.additional_paid_cents??0,'Tiền trả thêm');
  const method=input.payment_method??'CASH';
  if(method!=='CASH'&&method!=='BANK')throw new Error('Phương thức thanh toán không hợp lệ.');
  const bank=text(input.bank_name),note=text(input.note),key=`purchase-complete:${requestKey(input.request_id)}`;
  const hash=await fingerprint({receiptId,additional,method,bank,note});
  return executeOperation(db,key,hash,async()=>{
    const receipt=await db.prepare('SELECT * FROM purchase_receipts WHERE id=?').bind(receiptId).first<any>();
    if(!receipt)throw new Error('Không tìm thấy phiếu nhập.');
    if(receipt.receipt_status!=='DRAFT')throw new Error('Chỉ hoàn tất phiếu đặt nhập đang nháp; phiếu hủy không được nhập lại.');
    validatePurchaseCompletion(receipt,{additional_paid_cents:additional,payment_method:method});
    const batch=new AtomicBatch(db);await unchanged(batch,'purchase_receipts',receipt);
    await batch.assert("NOT EXISTS(SELECT 1 FROM inventory_transactions WHERE LOWER(reference_type)='purchase_receipt' AND reference_id=? AND quantity!=0)",[receiptId],'Phiếu nháp đã có thẻ kho; cần đối chiếu trước khi nhập.');
    await batch.assert(`(SELECT COALESCE(SUM(CASE WHEN flow_type='OUT' THEN amount_cents ELSE -amount_cents END),0)
      FROM cash_transactions WHERE LOWER(reference_type)='purchase_receipt' AND reference_id=?
      AND category IN ('PURCHASE','DEPOSIT','REFUND') AND COALESCE(status,'ACTIVE')!='CANCELLED')=?`,
      [receiptId,receipt.paid_amount_cents-(receipt.refunded_amount_cents??0)],'Lịch sử chi tiền không khớp phiếu nhập.');
    let supplierName='Nhà cung cấp lẻ';
    if(receipt.supplier_id!=null){
      const supplier=await db.prepare('SELECT id,name,is_supplier FROM partners WHERE id=?').bind(receipt.supplier_id).first<any>();
      if(!supplier||supplier.is_supplier!==1)throw new Error('Nhà cung cấp không hợp lệ.');
      await unchanged(batch,'partners',supplier);supplierName=supplier.name;
    }else if(receipt.total_amount_cents>receipt.paid_amount_cents-(receipt.refunded_amount_cents??0)+additional)throw new Error('Phiếu còn nợ phải chọn nhà cung cấp.');
    const items=(await db.prepare('SELECT * FROM purchase_items WHERE receipt_code_id=? ORDER BY id').bind(receiptId).all<any>()).results;
    if(!items.length||items.length>100)throw new Error('Phiếu phải có từ 1 đến 100 dòng hàng.');
    await batch.assert('(SELECT COUNT(*) FROM purchase_items WHERE receipt_code_id=?)=?',[receiptId,items.length],'Dòng hàng vừa thay đổi.');
    await appendPurchaseStock(db,batch,receipt,items,true,note);
    if(additional)writeCashEntry(batch,{created_by:text(input.created_by,'Thu ngân'),flow_type:'OUT',account_type:method,category:'PURCHASE',amount_cents:additional,reference_type:'purchase_receipt',reference_id:receiptId,recipient_name:supplierName,bank_name:bank,note:note||`Thanh toán hoàn tất ${receipt.receipt_code}`},key);
    batch.add("UPDATE purchase_receipts SET receipt_status='COMPLETED',paid_amount_cents=?,debt_amount_cents=?,completed_at=datetime('now') WHERE id=?",receipt.paid_amount_cents+additional,Math.max(0,receipt.total_amount_cents-receipt.paid_amount_cents+(receipt.refunded_amount_cents??0)-additional),receiptId);
    batch.add("INSERT INTO kgame_operations(operation_key,kind,payload_hash,result_json) VALUES(?,'PURCHASE_COMPLETE',?,?)",key,hash,JSON.stringify({success:true,receipt_code:receipt.receipt_code}));
    return commitOperation(batch,key,hash);
  });
}

/** Shared stock writes for direct receipt and completion of a saved draft. */
export async function appendPurchaseStock(db: D1Database, batch: AtomicBatch, receipt: any, items: any[], existingItems = false, note = '') {
  const receiptId=receipt.id;
  const costs=purchaseCosts(items,receipt.discount_cents??0,receipt.extra_fee_cents??0,receipt.other_fee_cents??0);
  let costIndex=0;
    const products=new Map<number,any>(),types=new Map<number,any>(),newTypes=new Map<number,any>(),codes=new Set<string>();
    let nextTypeId:number|null=null,subtotal=0;
    for(const item of items){
      const cost=costs[costIndex++];
      if (existingItems) await unchanged(batch,'purchase_items',item);
      const qty=integer(item.quantity,'Số lượng',1),price=integer(item.unit_cost_cents,'Giá nhập'),discount=integer(item.discount_cents??0,'Giảm giá dòng');
      const gross=integer(qty*price,'Giá trị dòng');if(discount>gross)throw new Error('Giảm giá vượt giá trị hàng.');
      subtotal=integer(subtotal+gross-discount,'Tổng hàng');
      if(!['NEW','QSD'].includes(item.condition))throw new Error('Tình trạng hàng không hợp lệ.');
      integer(item.product_id,'Hàng hóa',1);
      let product=products.get(item.product_id);
      if(!product){product=await db.prepare('SELECT * FROM products WHERE id=?').bind(item.product_id).first<any>();if(!product)throw new Error('Hàng hóa không tồn tại.');await unchanged(batch,'products',product);products.set(product.id,product);}
      integer(product.stock,'Tồn tổng');integer(product.stock_new,'Tồn mới');integer(product.stock_used,'Tồn cũ');
      if(product.stock!==product.stock_new+product.stock_used)throw new Error('Tồn tổng và tình trạng không khớp.');
      let type:any=null;
      if(item.product_type_id!=null){integer(item.product_type_id,'Phân loại',1);type=types.get(item.product_type_id)??await db.prepare('SELECT * FROM product_types WHERE id=? AND product_id=?').bind(item.product_type_id,product.id).first<any>();if(!type)throw new Error('Phân loại không thuộc sản phẩm.');}
      else{
        const choices=(await db.prepare('SELECT * FROM product_types WHERE product_id=? ORDER BY id LIMIT 2').bind(product.id).all<any>()).results;
        if(choices.length>1)throw new Error('Hàng có nhiều phân loại; cần chọn đúng phân loại trước khi nhập.');
        await batch.assert('(SELECT COUNT(*) FROM product_types WHERE product_id=?)=?',[product.id,choices.length],'Phân loại vừa thay đổi.');
        type=types.get(choices[0]?.id)??choices[0]??newTypes.get(product.id);
        if(!type){
          if(nextTypeId===null)nextTypeId=(await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM product_types').first<{id:number}>())!.id;
          type={id:nextTypeId++,product_id:product.id,tracking_mode:product.tracking_mode,cached_stock_new:product.stock_new,cached_stock_used:product.stock_used};newTypes.set(product.id,type);
          batch.add(`INSERT INTO product_types(id,product_id,name,tracking_mode,sale_price_cents,cost_price_cents,cached_stock_new,cached_stock_used)
            VALUES(?,?,'Tiêu chuẩn',?,?,?,?,?)`,type.id,product.id,product.tracking_mode,product.price_cents,product.cost_price_cents??0,product.stock_new,product.stock_used);
        }
      }
      if(!newTypes.has(product.id)&&!types.has(type.id)){await unchanged(batch,'product_types',type);types.set(type.id,type);}
      const code=text(item.program_code),serialized=product.tracking_mode==='CODE'||product.has_serial===1||type.tracking_mode==='CODE';
      if(serialized&&!code)throw new Error('Hàng quản lý serial cần có mã trước khi nhập.');
      if(code&&(!serialized||qty!==1))throw new Error('Mỗi serial phải là một dòng số lượng một của hàng quản lý mã.');
      if(item.product_unit_id!=null)throw new Error('Dòng nhập đã gắn serial có sẵn; cần đối chiếu để tránh nhập trùng.');
      if(code){
        if(codes.has(code))throw new Error('Một serial xuất hiện hai lần trong phiếu.');codes.add(code);
        await batch.assert('NOT EXISTS(SELECT 1 FROM product_units WHERE program_code=?)',[code],'Serial đã tồn tại; không nhập lại serial đang bán, giữ chỗ hoặc thuộc khách.');
        batch.add(`INSERT INTO product_units(product_type_id,program_code,condition,availability,owner_type,cost_price_cents,note)
          VALUES(?,?,?,'IN_STOCK','KGAME',?,?)`,type.id,code,item.condition,cost.total,note||`Nhập ${receipt.receipt_code}`);
      }
      batch.add(`UPDATE purchase_items SET product_type_id=?,product_unit_id=${code?'(SELECT id FROM product_units WHERE program_code=?)':'NULL'} WHERE id=?`,type.id,...(code?[code]:[]),item.id);
      batch.add('UPDATE purchase_items SET final_cost_cents=?,total_cost_cents=?,allocated_fee_cents=?,allocated_discount_cents=? WHERE id=?',cost.unit,cost.total,cost.fee,cost.discount,item.id);
      // At most two integer-cost movements preserve the exact line total.
      for(const [quantity,unitCost] of [[qty-cost.remainder,cost.unit],[cost.remainder,cost.unit+1]]) {
        if(!quantity)continue;
        batch.add(`INSERT INTO inventory_transactions(product_id,product_type_id,product_unit_id,condition,quantity,transaction_type,reference_type,reference_id,unit_cost_cents,note)
          SELECT product_id,product_type_id,product_unit_id,condition,?,'PURCHASE','purchase_receipt',?,?,? FROM purchase_items WHERE id=?`,quantity,receiptId,unitCost,`Hoàn tất ${receipt.receipt_code}`,item.id);
      }
      const pcol=item.condition==='NEW'?'stock_new':'stock_used',tcol=item.condition==='NEW'?'cached_stock_new':'cached_stock_used';
      const pcost=item.condition==='NEW'?'cost_price_cents':'cost_price_used_cents';
      const tcost=item.condition==='NEW'?'cost_price_cents':'cost_price_used_cents';
      const average=(oldQty:number,oldCost:number,total:number)=>{const value=BigInt(integer(oldQty,'Tồn giá vốn'))*BigInt(integer(oldCost,'Giá vốn cũ'))+BigInt(total);const count=BigInt(oldQty+qty);return integer(Number((value+count/2n)/count),'Giá vốn bình quân');};
      const productCost=average(product[pcol],product[pcost]??product.cost_price_cents??0,cost.total);
      const typeCost=average(type[tcol],type[tcost]??product[pcost]??product.cost_price_cents??0,cost.total);
      batch.add(`UPDATE products SET stock=stock+?,${pcol}=${pcol}+?,${pcost}=? WHERE id=?`,qty,qty,productCost,product.id);
      batch.add(`UPDATE product_types SET ${tcol}=${tcol}+?,${tcost}=?,updated_at=datetime('now') WHERE id=?`,qty,typeCost,type.id);
      // Subsequent lines for this item use the already planned running balance.
      product[pcol]+=qty;product.stock+=qty;product[pcost]=productCost;
      type[tcol]+=qty;type[tcost]=typeCost;
    }
    const discount=integer(receipt.discount_cents??0,'Giảm giá'),fee=integer(receipt.extra_fee_cents??0,'Chi phí NCC');
    if(discount>subtotal||integer(subtotal-discount+fee,'Tổng phiếu')!==receipt.total_amount_cents)throw new Error('Tổng dòng hàng không khớp tổng phiếu; cần đối chiếu.');
}
