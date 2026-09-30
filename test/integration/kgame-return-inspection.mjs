import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { applyKgameMigrations } from './kgame-migrations.mjs';
import { createPosOrder } from '../../src/features/kgame/db.ts';
import { returnCustomerGoods } from '../../src/features/kgame/customerReturns.ts';
import { inspectCustomerReturn } from '../../src/features/kgame/returnInspection.ts';
import { getPosFinancialReport,getPosSalesGroups } from '../../src/features/reports/financial.ts';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-07-20',d1Databases:['DB']});
try{
 const db=await mf.getD1Database('DB');await applyKgameMigrations(db);
 await db.prepare("INSERT INTO partners(id,partner_code,name,is_customer) VALUES(920,'RI920','Inspection test',1)").run();let n=0;
 async function fixture(serial=false){
  const qty=serial?1:4,pid=(await db.prepare("INSERT INTO products(name,slug,price_cents,currency,stock,stock_new,stock_used,tracking_mode,has_serial,cost_price_cents,cost_price_used_cents) VALUES(?,?,100,'vnd',10,10,0,?,?,40,20)").bind('RI'+(++n),'ri'+n,serial?'CODE':'QUANTITY',serial?1:0).run()).meta.last_row_id;
  const tid=(await db.prepare("INSERT INTO product_types(product_id,name,tracking_mode,cached_stock_new,cached_stock_used,cost_price_cents) VALUES(?,'Standard',?,10,0,40)").bind(pid,serial?'CODE':'QUANTITY').run()).meta.last_row_id;
  let uid=null;if(serial)uid=(await db.prepare("INSERT INTO product_units(product_type_id,program_code,condition,availability,owner_type,cost_price_cents) VALUES(?,?,'NEW','IN_STOCK','KGAME',40)").bind(tid,'RI-UNIT-'+n).run()).meta.last_row_id;
  const saleInput={request_id:crypto.randomUUID(),customer_id:920,order_type:'ORDER',items:[{product_id:pid,product_type_id:tid,product_unit_id:uid,condition:'NEW',quantity:qty,unit_price_cents:100}],payment:{amount_paid_cents:qty*100,payment_method:'CASH'},shipment:{carrier:'PICKUP'}};
  const order=await createPosOrder(db,saleInput),line=await db.prepare('SELECT id FROM order_lines WHERE order_id=?').bind(order.id).first();
  const receipt=await returnCustomerGoods(db,{order_id:order.id,request_id:crypto.randomUUID(),reason:'Test inspection',confirmed:true,items:[{order_line_id:line.id,quantity:qty}]});
  const ri=await db.prepare('SELECT id FROM customer_return_items WHERE return_id=?').bind(receipt.id).first();return {pid,tid,uid,order,line,ri,saleInput};
 }
 const input=(f,qty=1,extra={})=>({return_item_id:f.ri.id,quantity:qty,decision:'RESTOCK',condition:'NEW',note:'Inspected test',confirmed:true,resale_confirmed:true,request_id:crypto.randomUUID(),...extra});
 const tables=['orders','products','product_types','product_units','inventory_transactions','cash_transactions','payments','customer_return_items','customer_return_inspections','kgame_operations','kgame_refund_obligations','customer_credit_entries'];
 async function snapshot(){const result={};for(const t of tables)result[t]=(await db.prepare(`SELECT * FROM ${t} ORDER BY ${t==='kgame_operations'?'operation_key':'id'}`).all()).results;return result;}
 const f=await fixture();await db.prepare('UPDATE products SET cost_price_cents=80 WHERE id=?').bind(f.pid).run();await db.prepare('UPDATE product_types SET cost_price_cents=80 WHERE id=?').bind(f.tid).run();
 const key=crypto.randomUUID(),payBefore=(await snapshot()).cash_transactions;await inspectCustomerReturn(db,input(f,2,{request_id:key}));const once=await snapshot();await inspectCustomerReturn(db,input(f,2,{request_id:key}));assert.deepEqual(await snapshot(),once);
 await assert.rejects(inspectCustomerReturn(db,input(f,1,{request_id:key})),/nội dung khác/);
 assert.deepEqual(await db.prepare('SELECT stock,stock_new,cost_price_cents FROM products WHERE id=?').bind(f.pid).first(),{stock:8,stock_new:8,cost_price_cents:70});
 assert.equal((await getPosFinancialReport(db,'2020-01-01','2099-12-31')).incomplete,1);
 await inspectCustomerReturn(db,input(f,2,{decision:'REJECT',resale_confirmed:false}));
 assert.deepEqual(await db.prepare('SELECT restocked_quantity,rejected_quantity,restocked_cost_cents,inspection_status FROM customer_return_items WHERE id=?').bind(f.ri.id).first(),{restocked_quantity:2,rejected_quantity:2,restocked_cost_cents:80,inspection_status:'RESTOCKED'});
 assert.deepEqual((await snapshot()).cash_transactions,payBefore);
 const report=await getPosFinancialReport(db,'2020-01-01','2099-12-31');assert.equal(report.cogs,80);assert.equal(report.netRevenue,0);assert.equal(report.netProfit,-80);assert.equal(report.incomplete,0);
 const grouped=await getPosSalesGroups(db,'2020-01-01','2099-12-31');assert.equal(grouped.daily[0].cogs,80);assert.equal(grouped.staff[0].cogs,80);
 console.log('✓ I01: split good/bad quantity; original cost restored, weighted average correct, cash unchanged; report reverses only restocked cost; replay writes once');
 const serial=await fixture(true);await db.prepare("UPDATE product_units SET availability='SOLD' WHERE id=?").bind(serial.uid).run();await assert.rejects(inspectCustomerReturn(db,input(serial)),/Serial/);await db.prepare("UPDATE product_units SET availability='RETURN_INSPECTION' WHERE id=?").bind(serial.uid).run();
 await inspectCustomerReturn(db,input(serial,1,{condition:'QSD'}));assert.deepEqual(await db.prepare('SELECT availability,condition,cost_price_cents FROM product_units WHERE id=?').bind(serial.uid).first(),{availability:'IN_STOCK',condition:'QSD',cost_price_cents:40});
 await createPosOrder(db,{...serial.saleInput,request_id:crypto.randomUUID(),items:[{...serial.saleInput.items[0],condition:'QSD'}]});
 console.log('✓ I02: wrong serial state refused; inspected used serial becomes sellable in correct condition and can be sold');
 const bad=await fixture(true);await inspectCustomerReturn(db,input(bad,1,{decision:'REJECT',resale_confirmed:false}));assert.equal((await db.prepare('SELECT availability FROM product_units WHERE id=?').bind(bad.uid).first()).availability,'RETURN_REJECTED');await assert.rejects(createPosOrder(db,{...bad.saleInput,request_id:crypto.randomUUID()}),/Serial/);
 console.log('✓ I03: defective serial stays non-sellable and cannot be sold');
 const race=await fixture();const races=await Promise.allSettled([inspectCustomerReturn(db,input(race,4)),inspectCustomerReturn(db,input(race,4))]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.prepare('SELECT stock FROM products WHERE id=?').bind(race.pid).first()).stock,10);
 const fail=await fixture();await db.prepare("CREATE TRIGGER fail_inspection BEFORE INSERT ON kgame_operations WHEN NEW.kind='RETURN_INSPECTION' BEGIN SELECT RAISE(ABORT,'last inspection write'); END").run();const before=await snapshot();await assert.rejects(inspectCustomerReturn(db,input(fail,4)));assert.deepEqual(await snapshot(),before);await db.prepare('DROP TRIGGER fail_inspection').run();
 console.log('✓ I04: concurrent inspectors cannot receive twice; failure at final write rolls back stock, cost, status and journal');
 const invalid=await snapshot();for(const patch of [{quantity:0},{quantity:0.5},{quantity:5},{confirmed:false},{resale_confirmed:false},{condition:'INVALID'},{note:''}])await assert.rejects(inspectCustomerReturn(db,input(fail,1,patch)));assert.deepEqual(await snapshot(),invalid);
 console.log('✓ I05: invalid quantities, missing confirmation, invalid condition and blank result leave no changes');
}finally{await mf.dispose();}
