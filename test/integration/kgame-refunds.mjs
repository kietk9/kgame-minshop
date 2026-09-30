import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { applyKgameMigrations } from './kgame-migrations.mjs';
import { cancelPurchaseReceipt } from '../../src/features/kgame/purchaseCancellation.ts';
import { settleRefund } from '../../src/features/kgame/refunds.ts';
import { completePurchaseReceipt, createPurchaseReceipt } from '../../src/features/kgame/db.ts';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-07-20',d1Databases:['DB']});
try {
 const db=await mf.getD1Database('DB');await applyKgameMigrations(db);
 await db.prepare("INSERT INTO partners(id,partner_code,name,is_customer,is_supplier) VALUES(500,'TEST-D500','TEST-D Supplier',0,1)").run();
 let n=0;
 async function receipt(status='DRAFT',paid=200){
  const code=`TEST-D-${++n}`;
  const id=(await db.prepare('INSERT INTO purchase_receipts(receipt_code,supplier_id,receipt_status,total_amount_cents,paid_amount_cents,debt_amount_cents) VALUES(?,500,?,1000,?,?)').bind(code,status,paid,1000-paid).run()).meta.last_row_id;
  if(paid)await db.prepare("INSERT INTO cash_transactions(transaction_code,flow_type,account_type,category,amount_cents,reference_type,reference_id) VALUES(?,'OUT','CASH','DEPOSIT',?,'purchase_receipt',?)").bind('PC-TEST-D-'+n,paid,id).run();
  return id;
 }
 async function snap(){const rows={};for(const t of ['purchase_receipts','cash_transactions','kgame_refund_obligations','kgame_refund_settlements','kgame_operations'])rows[t]=(await db.prepare(`SELECT * FROM ${t} ORDER BY ${t==='kgame_operations'?'operation_key':'id'}`).all()).results;return rows;}
 const pay=(id,amount=100,key=crypto.randomUUID())=>({obligation_id:id,amount_cents:amount,account_type:'CASH',confirmed:true,request_id:key});
 const draft=await receipt();const invalidBefore=await snap();
 for(const amount of [-1,0.5,801]) await assert.rejects(completePurchaseReceipt(db,draft,{additional_paid_cents:amount,payment_method:'CASH'}));
 assert.deepEqual(await snap(),invalidBefore);
 const badInput={supplier_id:500,payment_method:'CASH',receipt_status:'DRAFT',paid_amount_cents:0,items:[{product_id:99999999,quantity:1,unit_cost_cents:1000,condition:'NEW'}]};
 await assert.rejects(createPurchaseReceipt(db,badInput),/không tồn tại/);assert.deepEqual(await snap(),invalidBefore);
 await assert.rejects(createPurchaseReceipt(db,{...badInput,items:[]}),/dòng hàng/);assert.deepEqual(await snap(),invalidBefore);
 console.log('✓ D10 invalid product/empty receipt/invalid completion money leave no partial writes');
 const r=await receipt();await cancelPurchaseReceipt(db,r);const o=await db.prepare('SELECT * FROM kgame_refund_obligations WHERE source_id=?').bind(r).first();
 assert.equal(o.amount_cents,200);assert.equal(o.settled_cents,0);assert.equal((await db.prepare('SELECT status FROM cash_transactions WHERE reference_id=?').bind(r).first()).status,'ACTIVE');
 console.log('✓ D01 cancellation retains actual cash and records a pending supplier refund');
 const s=await snap();await cancelPurchaseReceipt(db,r);assert.deepEqual(await snap(),s);await assert.rejects(completePurchaseReceipt(db,r),/Chỉ hoàn tất/);assert.deepEqual(await snap(),s);
 console.log('✓ D02 repeat cancellation is harmless; cancelled purchases cannot complete');
 const completed=await receipt('COMPLETED');const before=await snap();await assert.rejects(cancelPurchaseReceipt(db,completed),/trả hàng/);assert.deepEqual(await snap(),before);
 console.log('✓ D03 received purchases require returns, with no erased stock/cash history');
 for(const bad of [{confirmed:false},{amount_cents:0},{amount_cents:-1},{amount_cents:0.5},{amount_cents:201},{account_type:'DEBT'},{account_type:'BANK',reference_code:''}])await assert.rejects(settleRefund(db,{...pay(o.id),...bad}));assert.deepEqual(await snap(),before);
 console.log('✓ D04 invalid/unconfirmed/excess refunds produce no writes');
 const key=crypto.randomUUID(),first=await settleRefund(db,pay(o.id,80,key));assert.ok(first.transaction_code);assert.equal((await db.prepare('SELECT settled_cents FROM kgame_refund_obligations WHERE id=?').bind(o.id).first()).settled_cents,80);
 const partial=await snap();await settleRefund(db,pay(o.id,80,key));assert.deepEqual(await snap(),partial);await assert.rejects(settleRefund(db,pay(o.id,81,key)),/nội dung khác/);
 console.log('✓ D05 partial receipt writes linked cash/settlement together; retry is charged once');
 const race=await Promise.allSettled([settleRefund(db,pay(o.id,100)),settleRefund(db,pay(o.id,100))]);assert.equal(race.filter(v=>v.status==='fulfilled').length,1);assert.equal((await db.prepare('SELECT settled_cents FROM kgame_refund_obligations WHERE id=?').bind(o.id).first()).settled_cents,180);
 console.log('✓ D06 concurrent receipt cannot exceed the pending amount');
 await db.prepare("CREATE TRIGGER test_refund_failure BEFORE INSERT ON kgame_refund_settlements BEGIN SELECT RAISE(ABORT,'test failure'); END").run();const atomic=await snap();await assert.rejects(settleRefund(db,pay(o.id,20)));assert.deepEqual(await snap(),atomic);await db.prepare('DROP TRIGGER test_refund_failure').run();
 console.log('✓ D07 final-write failure rolls back cash, obligation and operation receipt');
 const r2=await receipt();await db.prepare("CREATE TRIGGER test_cancel_failure BEFORE UPDATE ON purchase_receipts WHEN NEW.id="+r2+" BEGIN SELECT RAISE(ABORT,'test cancel failure'); END").run();const b2=await snap();await assert.rejects(cancelPurchaseReceipt(db,r2));assert.deepEqual(await snap(),b2);await db.prepare('DROP TRIGGER test_cancel_failure').run();
 console.log('✓ D08 cancellation failure rolls back the new refund obligation');
 await settleRefund(db,pay(o.id,20));assert.equal((await db.prepare('SELECT settled_cents FROM kgame_refund_obligations WHERE id=?').bind(o.id).first()).settled_cents,200);await assert.rejects(settleRefund(db,pay(o.id,1)),/vượt/);
 console.log('✓ D09 full receipt closes the outstanding amount without cancelling original cash');
}finally{await mf.dispose();}
