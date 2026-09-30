import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { applyKgameMigrations } from './kgame-migrations.mjs';
import { createPosOrder, listPartners, getPartnerDetailsWithHistory } from '../../src/features/kgame/db.ts';
import { createPurchaseReceipt } from '../../src/features/kgame/purchaseCreate.ts';
import { returnPurchase } from '../../src/features/kgame/purchaseReturns.ts';
import { getPosFinancialReport, getPosSalesGroups } from '../../src/features/reports/financial.ts';
import { parseDatePreset } from '../../src/features/reports/date-utils.ts';
assert.equal(parseDatePreset('this_month',null,null,new Date('2026-02-01T12:00:00')).endDate,'2026-02-01');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-07-20',d1Databases:['DB']});
try {
 const db=await mf.getD1Database('DB');await applyKgameMigrations(db);
 await db.prepare("INSERT INTO partners(id,partner_code,name,is_customer,is_supplier) VALUES(800,'F800','Duplicate test',1,1),(801,'F801','Duplicate test',1,1)").run();
 const product=(await db.prepare("INSERT INTO products(name,slug,price_cents,currency,stock,stock_new,stock_used,tracking_mode,has_serial,cost_price_cents) VALUES('Report test','report-test',1000,'vnd',10,10,0,'QUANTITY',0,400)").run()).meta.last_row_id;
 const input=()=>({request_id:crypto.randomUUID(),customer_id:800,order_type:'ORDER',items:[{product_id:product,condition:'NEW',quantity:1,unit_price_cents:1000,discount_cents:100}],discount_cents:50,payment:{amount_paid_cents:850,payment_method:'CASH'},shipment:{carrier:'PICKUP'}});
 const sale=await createPosOrder(db,input());
 await createPosOrder(db,{...input(),order_type:'PREORDER'});
 const cancelled=await createPosOrder(db,input());await db.prepare("UPDATE orders SET order_status='CANCELLED' WHERE id=?").bind(cancelled.id).run();
 await db.prepare("UPDATE orders SET created_at='2026-01-31 18:00:00'").run();
 let n=0;
 for(const [category,amount,status,reference] of [['EXPENSE',50,'ACTIVE',null],['SHIPPING_FEE',20,'ACTIVE',null],['DEPOSIT',1000,'ACTIVE',null],['REFUND',1000,'ACTIVE',null],['PURCHASE',1000,'ACTIVE',null],['BUYBACK',1000,'ACTIVE',null],['EXPENSE',1000,'CANCELLED',null],['EXPENSE',1000,'ACTIVE','purchase_receipt_other_fee']]){
 await db.prepare("INSERT INTO cash_transactions(transaction_code,flow_type,category,amount_cents,status,reference_type,created_at) VALUES(?,'OUT',?,?,?,?, '2026-01-31 18:00:00')").bind('F'+(++n),category,amount,status,reference).run();
 }
 const report=await getPosFinancialReport(db,'2026-02-01','2026-02-01');
 assert.deepEqual(report,{totalOrders:1,operationalExpenses:50,grossSales:1000,discount:150,refunds:0,deductions:150,netRevenue:850,cogs:400,grossProfit:450,shippingCost:20,totalExpenses:70,netProfit:380,incomplete:0});
 assert.equal((await getPosFinancialReport(db,'2026-01-31','2026-01-31')).totalOrders,0);
 const groups=await getPosSalesGroups(db,'2026-02-01','2026-02-01');
 assert.equal(groups.daily[0].net_revenue,850);assert.equal(groups.daily[0].cogs,400);assert.equal(groups.daily[0].total_discount,150);assert.equal(groups.staff[0].cogs,400);
 assert.equal((await getPosSalesGroups(db,'2026-02-01','2026-02-01','Missing staff')).daily.length,0);
 assert.equal((await getPosSalesGroups(db,'2026-02-01','2026-02-01','','PICKUP')).daily[0].order_count,1);
 console.log('✓ F01: POS costs and discounts from sold lines; excluded preorder/cancellation/deposit/refund/capitalized fees; Vietnam date boundary');
 await db.prepare('UPDATE orders SET external_refunded_cents=850 WHERE id=?').bind(sale.id).run();
 assert.equal((await getPosFinancialReport(db,'2026-02-01','2026-02-01')).netProfit,-470);
 await db.prepare('DELETE FROM order_lines WHERE order_id=?').bind(sale.id).run();
 assert.equal((await getPosFinancialReport(db,'2026-02-01','2026-02-01')).incomplete,1);
 assert.equal((await getPosFinancialReport(db,'2020-01-01','2020-01-01')).cogs,0);
 console.log('✓ F02: losses remain visible, missing lines flagged, empty period never invents cost');
 const receipt=await createPurchaseReceipt(db,{request_id:crypto.randomUUID(),supplier_id:800,receipt_status:'COMPLETED',payment_method:'CASH',paid_amount_cents:600,items:[{product_id:product,quantity:2,unit_cost_cents:500,condition:'NEW'}]});
 const line=await db.prepare('SELECT id FROM purchase_items WHERE receipt_code_id=?').bind(receipt.id).first();
 await returnPurchase(db,{receipt_id:receipt.id,request_id:crypto.randomUUID(),reason:'Report test',confirmed:true,items:[{purchase_item_id:line.id,quantity:1}]});
 const listed=(await listPartners(db)).partners.find(p=>p.id===800),detail=(await getPartnerDetailsWithHistory(db,800)).partner;
 for(const p of [listed,detail]){assert.equal(p.total_purchase_cents,500);assert.equal(p.payable_debt_cents,0);assert.equal(p.supplier_pending_refund_cents,100);}
 const duplicate=(await getPartnerDetailsWithHistory(db,801)).partner;assert.equal(duplicate.total_purchase_cents,0);assert.equal(duplicate.supplier_pending_refund_cents,0);
 console.log('✓ F03: supplier net purchases, debt and pending refund reconcile independently; duplicate names remain separate');
} finally {await mf.dispose();}
