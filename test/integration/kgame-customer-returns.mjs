import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { applyKgameMigrations } from './kgame-migrations.mjs';
import { createPosOrder,addPosOrderPayment } from '../../src/features/kgame/db.ts';
import { returnCustomerGoods } from '../../src/features/kgame/customerReturns.ts';
import { settleOrderRefund } from '../../src/features/kgame/orderRefunds.ts';
import { getPosFinancialReport } from '../../src/features/reports/financial.ts';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-07-20',d1Databases:['DB']});
try{
 const db=await mf.getD1Database('DB');await applyKgameMigrations(db);
 await db.prepare("INSERT INTO partners(id,partner_code,name,is_customer) VALUES(910,'CR910','Return test',1)").run();let n=0;
 async function fixture({paid=600,qty=10,price=100,discount=0,serial=false}={}){
  const pid=(await db.prepare("INSERT INTO products(name,slug,price_cents,currency,stock,stock_new,stock_used,tracking_mode,has_serial,cost_price_cents) VALUES(?,?,100,'vnd',30,30,0,?,?,40)").bind('CR'+(++n),'cr'+n,serial?'CODE':'QUANTITY',serial?1:0).run()).meta.last_row_id;
  const tid=(await db.prepare("INSERT INTO product_types(product_id,name,tracking_mode,cached_stock_new,cached_stock_used,cost_price_cents) VALUES(?,'Standard',?,30,0,40)").bind(pid,serial?'CODE':'QUANTITY').run()).meta.last_row_id;
  let uid=null;if(serial)uid=(await db.prepare("INSERT INTO product_units(product_type_id,program_code,condition,availability,owner_type,cost_price_cents) VALUES(?,?,'NEW','IN_STOCK','KGAME',40)").bind(tid,'CR-UNIT-'+n).run()).meta.last_row_id;
  const order=await createPosOrder(db,{request_id:crypto.randomUUID(),customer_id:910,order_type:'ORDER',discount_cents:discount,items:[{product_id:pid,product_type_id:tid,product_unit_id:uid,condition:'NEW',quantity:qty,unit_price_cents:price}],payment:{amount_paid_cents:paid,payment_method:'CASH'},shipment:{carrier:'PICKUP'}});
  const line=await db.prepare('SELECT id FROM order_lines WHERE order_id=?').bind(order.id).first();return {...order,pid,tid,uid,line};
 }
 const input=(f,qty,key=crypto.randomUUID())=>({order_id:f.id,request_id:key,reason:'Test return',confirmed:true,items:[{order_line_id:f.line.id,quantity:qty}]});
 const row=id=>db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
 const f=await fixture(),key=crypto.randomUUID();await returnCustomerGoods(db,input(f,7,key));await returnCustomerGoods(db,input(f,7,key));
 assert.equal((await row(f.id)).cod_amount_cents,0);assert.equal((await row(f.id)).returned_amount_cents,700);assert.equal((await db.prepare('SELECT stock FROM products WHERE id=?').bind(f.pid).first()).stock,20);
 let obligation=await db.prepare("SELECT * FROM kgame_refund_obligations WHERE source_type='ORDER' AND source_id=?").bind(f.id).first();assert.equal(obligation.amount_cents,300);
 await settleOrderRefund(db,{obligation_id:obligation.id,amount_cents:300,confirmed:true,account_type:'CASH',request_id:crypto.randomUUID()});
 await returnCustomerGoods(db,input(f,3));obligation=await db.prepare('SELECT * FROM kgame_refund_obligations WHERE id=?').bind(obligation.id).first();assert.equal(obligation.amount_cents,600);assert.equal(obligation.settled_cents,300);await assert.rejects(returnCustomerGoods(db,input(f,1)),/vượt/);
 console.log('✓ T01: 1000 sale/600 paid/700 returned offsets debt400 and refunds300; successive returns, retry and over-return safe; quarantine does not increase sellable stock');
 const debt=await fixture();await returnCustomerGoods(db,input(debt,2));assert.equal((await row(debt.id)).cod_amount_cents,200);
 await assert.rejects(addPosOrderPayment(db,{order_id:debt.id,amount_paid_cents:201,payment_method:'CASH'}),/vượt/);await addPosOrderPayment(db,{order_id:debt.id,amount_paid_cents:200,payment_method:'CASH'});assert.equal((await row(debt.id)).cod_amount_cents,0);
 console.log('✓ T02: remaining debt after partial return can be collected, original gross debt cannot be over-collected');
 const mixed=await fixture({paid:300});await db.prepare("INSERT INTO customer_credit_entries(entry_code,partner_id,amount_cents,reference_type,reference_id,operation_key) VALUES('CR-SEED',910,200,'TEST',0,'cr-credit-seed')").run();await addPosOrderPayment(db,{order_id:mixed.id,amount_paid_cents:200,payment_method:'CREDIT'});await returnCustomerGoods(db,input(mixed,8));
 assert.equal((await row(mixed.id)).returned_credit_cents,200);assert.equal((await db.prepare("SELECT amount_cents FROM kgame_refund_obligations WHERE source_type='ORDER' AND source_id=?").bind(mixed.id).first()).amount_cents,100);
 console.log('✓ T03: mixed payment restores original credit first; only remaining actual cash creates refund');
 const serial=await fixture({paid:100,qty:1,serial:true});await returnCustomerGoods(db,input(serial,1));assert.equal((await db.prepare('SELECT availability FROM product_units WHERE id=?').bind(serial.uid).first()).availability,'RETURN_INSPECTION');
 const rounding=await fixture({paid:299,qty:3,discount:1});let sum=0;for(let i=0;i<3;i++)sum+=(await returnCustomerGoods(db,input(rounding,1))).amount_cents;assert.equal(sum,299);
 console.log('✓ T04: serial held for inspection; repeated partial return preserves discount rounding exactly');
 const race=await fixture();const results=await Promise.allSettled([returnCustomerGoods(db,input(race,10)),returnCustomerGoods(db,input(race,10))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const fail=await fixture();await db.prepare("CREATE TRIGGER fail_customer_return BEFORE INSERT ON kgame_operations WHEN NEW.kind='CUSTOMER_RETURN' BEGIN SELECT RAISE(ABORT,'last write'); END").run();await assert.rejects(returnCustomerGoods(db,input(fail,10)));assert.equal((await row(fail.id)).returned_amount_cents,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM customer_returns WHERE order_id=?').bind(fail.id).first()).n,0);
 const report=await getPosFinancialReport(db,'2020-01-01','2099-12-31');assert.ok(report.incomplete>0);
 console.log('✓ T05: concurrent returns cannot duplicate; final failure rolls back; uninspected returns prevent publishing profit');
}finally{await mf.dispose();}
