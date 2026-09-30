import { purchaseCosts } from './purchaseCost.ts';
import type { D1Database } from '@cloudflare/workers-types';
import type { CreatePurchaseReceiptInput } from './db';
import { AtomicBatch, commitOperation, executeOperation, fingerprint, requestKey, text } from './atomic.ts';
import { validatePurchaseInput } from './purchaseValidation.ts';
import { appendPurchaseStock } from './purchaseCompletion.ts';
import { writeCashEntry } from './cashbook.ts';

/** All identifiers are reserved by inserts in the same batch; a collision rolls back. */
export async function createPurchaseReceipt(db: D1Database, input: CreatePurchaseReceiptInput): Promise<{id:number;receipt_code:string;cash_code?:string}> {
  const key=`purchase-create:${requestKey(input.request_id)}`;
  const {request_id: _requestId, ...payload}=input;
  const hash=await fingerprint(payload);
  return executeOperation(db,key,hash,async()=>{
    await validatePurchaseInput(db,input);
    const batch=new AtomicBatch(db);
    let supplierId=input.supplier_id??null;
    let supplierName=text(input.supplier_name)||'Nhà cung cấp lẻ';
    if(supplierId!=null){
      const supplier=await db.prepare('SELECT name FROM partners WHERE id=? AND is_supplier=1').bind(supplierId).first<{name:string}>();
      if(!supplier)throw new Error('Nhà cung cấp không hợp lệ.');
      supplierName=supplier.name;
      await batch.assert('EXISTS(SELECT 1 FROM partners WHERE id=? AND is_supplier=1)',[supplierId],'Nhà cung cấp vừa thay đổi.');
    }else if(text(input.supplier_name)||text(input.supplier_phone)){
      supplierId=(await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM partners').first<{id:number}>())!.id;
      // A new supplier is distinct: never merge intentional duplicates by name/phone.
      batch.add('INSERT INTO partners(id,partner_code,name,phone,address_detail,is_customer,is_supplier) VALUES(?,?,?,?,?,0,1)',supplierId,`NCC-${crypto.randomUUID()}`,supplierName,text(input.supplier_phone)||null,text(input.supplier_address)||null);
    }
    const subtotal=input.items.reduce((sum,it)=>sum+it.quantity*it.unit_cost_cents-(it.discount_cents??0),0);
    const total=subtotal-(input.discount_cents??0)+(input.extra_fee_cents??0),paid=input.paid_amount_cents??0;
    if(supplierId==null&&total>paid)throw new Error('Phiếu còn nợ phải chọn nhà cung cấp.');
    const id=(await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM purchase_receipts').first<{id:number}>())!.id;
    const receiptCode=`PN${String(id).padStart(6,'0')}`,status=input.receipt_status??'COMPLETED';
    batch.add(`INSERT INTO purchase_receipts(id,receipt_code,supplier_id,total_amount_cents,paid_amount_cents,debt_amount_cents,discount_cents,extra_fee_cents,extra_fee_category,other_fee_cents,other_fee_category,other_fee_note,invoice_number,order_receipt_code,receipt_status,payment_method,bank_name,note,created_by,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,receiptCode,supplierId,total,paid,total-paid,input.discount_cents??0,input.extra_fee_cents??0,input.extra_fee_category??null,input.other_fee_cents??0,input.other_fee_category??null,input.other_fee_note??null,input.invoice_number??null,input.order_receipt_code??null,status,input.payment_method,input.bank_name??null,input.note??null,text(input.created_by,'Thu ngân'),status==='COMPLETED'?new Date().toISOString():null);
    let nextItemId=(await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM purchase_items').first<{id:number}>())!.id;
    const items=[];
  const costs=purchaseCosts(input.items,input.discount_cents??0,input.extra_fee_cents??0,input.other_fee_cents??0);
  let costIndex=0;
    for(const item of input.items){
      await batch.assert('EXISTS(SELECT 1 FROM products WHERE id=?)',[item.product_id],'Hàng hóa vừa thay đổi.');
      if(item.product_type_id!=null)await batch.assert('EXISTS(SELECT 1 FROM product_types WHERE id=? AND product_id=?)',[item.product_type_id,item.product_id],'Phân loại vừa thay đổi.');
      const cost=costs[costIndex++],fee=cost.fee;
      const row={...item,id:nextItemId++,product_unit_id:null,final_cost_cents:cost.unit,total_cost_cents:cost.total,allocated_discount_cents:cost.discount};
      items.push(row);
      batch.add(`INSERT INTO purchase_items(id,receipt_code_id,product_id,product_type_id,program_code,condition,quantity,unit_cost_cents,discount_cents,allocated_fee_cents,final_cost_cents,item_note,total_cost_cents,allocated_discount_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,row.id,id,item.product_id,item.product_type_id??null,text(item.program_code)||null,item.condition,item.quantity,item.unit_cost_cents,item.discount_cents??0,fee,row.final_cost_cents,item.item_note??null,cost.total,cost.discount);
    }
    if(status==='COMPLETED')await appendPurchaseStock(db,batch,{id,receipt_code:receiptCode,total_amount_cents:total,discount_cents:input.discount_cents??0,extra_fee_cents:input.extra_fee_cents??0,other_fee_cents:input.other_fee_cents??0},items);
    if(paid){
      writeCashEntry(batch,{created_by:input.created_by,flow_type:'OUT',account_type:input.payment_method==='BANK'?'BANK':'CASH',category:status==='DRAFT'?'DEPOSIT':'PURCHASE',amount_cents:paid,reference_type:'purchase_receipt',reference_id:id,recipient_name:supplierName,bank_name:input.bank_name,note:`Chi ${receiptCode}`},key);
      batch.add('UPDATE purchase_receipts SET cash_transaction_id=(SELECT id FROM cash_transactions WHERE operation_key=?) WHERE id=?',key,id);
    }
    if(input.other_fee_cents){
      writeCashEntry(batch,{created_by:input.created_by,flow_type:'OUT',account_type:input.payment_method==='BANK'?'BANK':'CASH',category:'EXPENSE',amount_cents:input.other_fee_cents,reference_type:'purchase_receipt_other_fee',reference_id:id,recipient_name:'Đơn vị vận chuyển / Chành xe',bank_name:input.bank_name,note:input.other_fee_note},`${key}:fee`);
      batch.add('UPDATE purchase_receipts SET other_fee_cash_id=(SELECT id FROM cash_transactions WHERE operation_key=?) WHERE id=?',`${key}:fee`,id);
    }
    batch.add(`INSERT INTO kgame_operations(operation_key,kind,payload_hash,result_json) VALUES(?,'PURCHASE_CREATE',?,json_object('id',?,'receipt_code',?))`,key,hash,id,receiptCode);
    return commitOperation(batch,key,hash);
  });
}
