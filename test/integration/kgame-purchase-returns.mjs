import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { applyKgameMigrations } from './kgame-migrations.mjs';
import { createPurchaseReceipt } from '../../src/features/kgame/purchaseCreate.ts';
import { returnPurchase } from '../../src/features/kgame/purchaseReturns.ts';
import { settleRefund } from '../../src/features/kgame/refunds.ts';
import { payPartnerDebt } from '../../src/features/kgame/debtPayments.ts';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-07-20',d1Databases:['DB']});
try {
 const db=await mf.getD1Database('DB');await applyKgameMigrations(db);
 await db.prepare("INSERT INTO partners(id,partner_code,name,is_customer,is_supplier) VALUES(800,'TEST-RETURN','Test return supplier',0,1)").run();let n=0;
 async function fixture({paid=600,qty=2,serial=false,status='COMPLETED'}={}){
  n++;const product=(await db.prepare("INSERT INTO products(name,slug,price_cents,currency,stock,stock_new,stock_used,tracking_mode,has_serial,cost_price_cents) VALUES(?,?,1000,'vnd',0,0,0,?,?,500)").bind('TEST-R-'+n,'test-r-'+n,serial?'CODE':'QUANTITY',serial?1:0).run()).meta.last_row_id;
  const r=await createPurchaseReceipt(db,{request_id:crypto.randomUUID(),supplier_id:800,receipt_status:status,payment_method:'CASH',paid_amount_cents:paid,items:[{product_id:product,quantity:qty,unit_cost_cents:500,condition:'NEW',program_code:serial?'TEST-RETURN-SERIAL-'+n:null}]});
  const line=await db.prepare('SELECT * FROM purchase_items WHERE receipt_code_id=?').bind(r.id).first();return {...r,product,line};
 }
 const payload=(f,quantity=1,key=crypto.randomUUID())=>({receipt_id:f.id,request_id:key,reason:'Test supplier return',confirmed:true,items:[{purchase_item_id:f.line.id,quantity}]});
 const tables=['purchase_receipts','purchase_items','purchase_returns','purchase_return_items','products','product_types','product_units','inventory_transactions','cash_transactions','kgame_refund_obligations','kgame_refund_settlements','kgame_operations'];
 async function snapshot(){const out={};for(const table of tables)out[table]=(await db.prepare(`SELECT * FROM ${table} ORDER BY ${table==='kgame_operations'?'operation_key':'id'}`).all()).results;return out;}
 const f=await fixture(),key=crypto.randomUUID();await returnPurchase(db,payload(f,1,key));
 assert.deepEqual(await db.prepare('SELECT total_amount_cents,paid_amount_cents,returned_amount_cents,debt_amount_cents,receipt_status FROM purchase_receipts WHERE id=?').bind(f.id).first(),{total_amount_cents:1000,paid_amount_cents:600,returned_amount_cents:500,debt_amount_cents:0,receipt_status:'COMPLETED'});
 let obligation=await db.prepare("SELECT * FROM kgame_refund_obligations WHERE source_type='PURCHASE' AND source_id=?").bind(f.id).first();assert.equal(obligation.amount_cents,100);
 assert.equal((await db.prepare('SELECT stock FROM products WHERE id=?').bind(f.product).first()).stock,1);
 const once=await snapshot();await returnPurchase(db,payload(f,1,key));assert.deepEqual(await snapshot(),once);
 await assert.rejects(returnPurchase(db,payload(f,2,key)),/nội dung khác/);assert.deepEqual(await snapshot(),once);
 console.log('✓ R01 return offsets unpaid debt first, preserves original receipt and cash, and retry writes once');
 await settleRefund(db,{obligation_id:obligation.id,amount_cents:100,account_type:'CASH',confirmed:true,request_id:crypto.randomUUID()});
 await returnPurchase(db,payload(f));obligation=await db.prepare('SELECT * FROM kgame_refund_obligations WHERE id=?').bind(obligation.id).first();assert.equal(obligation.amount_cents,600);assert.equal(obligation.settled_cents,100);
 await settleRefund(db,{obligation_id:obligation.id,amount_cents:500,account_type:'CASH',confirmed:true,request_id:crypto.randomUUID()});
 const all=await snapshot();await assert.rejects(returnPurchase(db,payload(f)),/vượt/);assert.deepEqual(await snapshot(),all);
 console.log('✓ R02 successive returns and partial refunds settle only actual money, over-return leaves no changes');
 const unpaid=await fixture({paid:0});await returnPurchase(db,payload(unpaid));assert.equal((await db.prepare('SELECT debt_amount_cents FROM purchase_receipts WHERE id=?').bind(unpaid.id).first()).debt_amount_cents,500);
 await payPartnerDebt(db,{partner_id:800,target_type:'PURCHASE',request_id:crypto.randomUUID(),payment_method:'CASH',items:[{id:unpaid.id,doc_type:'PURCHASE',amount_cents:500}]});
 assert.equal((await db.prepare('SELECT debt_amount_cents FROM purchase_receipts WHERE id=?').bind(unpaid.id).first()).debt_amount_cents,0);
 console.log('✓ R03 unpaid return reduces debt; remaining supplier debt can still be paid');
 const rollback=await fixture();await db.prepare("CREATE TRIGGER return_failure BEFORE INSERT ON kgame_operations WHEN NEW.kind='PURCHASE_RETURN' BEGIN SELECT RAISE(ABORT,'return last write failure'); END").run();const before=await snapshot();await assert.rejects(returnPurchase(db,payload(rollback)));assert.deepEqual(await snapshot(),before);await db.prepare('DROP TRIGGER return_failure').run();
 const race=await Promise.allSettled([returnPurchase(db,payload(rollback,2)),returnPurchase(db,payload(rollback,2))]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 console.log('✓ R04 final failure rolls back every table; concurrent full returns cannot export twice');
 const serial=await fixture({paid:500,qty:1,serial:true});await db.prepare("UPDATE product_units SET availability='SOLD' WHERE id=?").bind(serial.line.product_unit_id).run();const sold=await snapshot();await assert.rejects(returnPurchase(db,payload(serial)),/Serial/);assert.deepEqual(await snapshot(),sold);
 await db.prepare("UPDATE product_units SET availability='IN_STOCK' WHERE id=?").bind(serial.line.product_unit_id).run();await returnPurchase(db,payload(serial));assert.deepEqual(await db.prepare('SELECT availability,owner_type,owner_id FROM product_units WHERE id=?').bind(serial.line.product_unit_id).first(),{availability:'RETURNED_SUPPLIER',owner_type:'SUPPLIER',owner_id:800});
 console.log('✓ R05 sold serial is refused; eligible serial exits store ownership and sellable stock');
 const draft=await fixture({status:'DRAFT'});const invalid=await snapshot();
 await assert.rejects(returnPurchase(db,payload(draft)),/đã nhận/);
 for(const patch of [{confirmed:false},{reason:''},{items:[{purchase_item_id:serial.line.id,quantity:1}]},{items:[{purchase_item_id:unpaid.line.id,quantity:0.5}]}])await assert.rejects(returnPurchase(db,{...payload(unpaid),...patch}));assert.deepEqual(await snapshot(),invalid);
 console.log('✓ R06 wrong receipt, unconfirmed, blank reason and invalid quantity do not write');
} finally {await mf.dispose();}
