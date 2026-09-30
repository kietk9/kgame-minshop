import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { applyKgameMigrations } from './kgame-migrations.mjs';
import { listPartners, getPartnerDetailsWithHistory } from '../../src/features/kgame/db.ts';
import { createPosOrder, addPosOrderPayment } from '../../src/features/kgame/pos.ts';
import { getCustomerCredit } from '../../src/features/kgame/credit.ts';
import { cancelOrder } from '../../src/features/kgame/cancelOrder.ts';
import { payPartnerDebt } from '../../src/features/kgame/debtPayments.ts';
import { recordCashTransaction, recordManualCashTransaction } from '../../src/features/kgame/cashbook.ts';

const mf = new Miniflare({ modules:true, script:'export default { fetch() { return new Response("ok") } }', compatibilityDate:'2026-07-20', d1Databases:['DB'] });
let failures = 0;
const check = async (name,fn) => { try { await fn(); console.log(`✓ ${name}`); } catch (err) { failures++; console.error(`✗ ${name}: ${err.stack}`); } };
try {
  const db = await mf.getD1Database('DB'); await applyKgameMigrations(db);
  await db.prepare("INSERT INTO partners(id,partner_code,name,phone,is_customer,is_supplier) VALUES(500,'TEST-C500','Customer A','TEST-A',1,0),(501,'TEST-C501','Customer B','TEST-B',1,0),(502,'TEST-S502','Supplier A',NULL,0,1),(503,'TEST-S503','Supplier B',NULL,0,1)").run();
  let sequence = 0;
  async function order() {
    const n = ++sequence;
    const result = await db.prepare("INSERT INTO products(name,slug,price_cents,currency,stock,stock_new,stock_used,tracking_mode,has_serial,cost_price_cents) VALUES(?, ?,1000,'vnd',10,10,0,'QUANTITY',0,600)").bind(`Debt ${n}`,`debt-${n}`).run();
    return createPosOrder(db,{request_id:crypto.randomUUID(),customer_id:500,order_type:'PREORDER',items:[{product_id:result.meta.last_row_id,quantity:1,unit_price_cents:1000,condition:'NEW'}],payment:{amount_paid_cents:0},shipment:{carrier:'PICKUP'}});
  }
  const item = (id,amount=100,type='ORDER') => ({id,amount_cents:amount,doc_type:type});
  const payload = (items,partner=500) => ({request_id:crypto.randomUUID(),partner_id:partner,payment_method:'CASH',items});
  const row = id => db.prepare('SELECT paid_amount_cents,cod_amount_cents,payment_status FROM orders WHERE id = ?').bind(id).first();
  const sum = (table,id) => db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS n FROM ${table} WHERE ${table==='payments'?'order_id':'reference_id'} = ?`).bind(id).first().then(r=>r.n);
  const snapshot = async () => {
    const data = {};
    for (const table of ['orders','payments','cash_transactions','kgame_operations','purchase_receipts','repair_tickets','products']) {
      data[table] = (await db.prepare(`SELECT * FROM ${table} ORDER BY ${table==='kgame_operations'?'operation_key':'id'}`).all()).results;
    }
    return data;
  };
  async function receipt(status='COMPLETED') {
    const n=++sequence;
    const r=await db.prepare('INSERT INTO purchase_receipts(receipt_code,supplier_id,total_amount_cents,paid_amount_cents,debt_amount_cents,receipt_status) VALUES(?,502,1000,0,1000,?)').bind(`TEST-P${n}`,status).run();
    return r.meta.last_row_id;
  }
  await check('C01: wrong customer, supplier role and document ownership are refused without writes', async () => {
    const o=await order(), p=await receipt(), before=await snapshot();
    await assert.rejects(payPartnerDebt(db,payload([item(o.id)],501)), /khách hàng/);
    await assert.rejects(payPartnerDebt(db,payload([item(o.id)],502)), /vai trò/);
    await assert.rejects(payPartnerDebt(db,payload([item(p,100,'PURCHASE')],503)), /nhà cung cấp/);
    assert.deepEqual(await snapshot(),before);
  });
  await check('C02: overpayment, invalid amount, duplicate rows and missing documents abort the entire request', async () => {
    const a=await order(), b=await order(), before=await snapshot();
    for (const amount of [0,-1,0.5,1001]) await assert.rejects(payPartnerDebt(db,payload([item(a.id,amount)])));
    await assert.rejects(payPartnerDebt(db,payload([item(a.id),item(a.id)])), /hai lần/);
    await assert.rejects(payPartnerDebt(db,payload([item(a.id),item(9999999)])));
    await assert.rejects(payPartnerDebt(db,payload([item(a.id),item(b.id,1001)])), /vượt/);
    assert.deepEqual(await snapshot(),before);
  });
  await check('C03: cancelled invoices and purchases cannot receive debt payments', async () => {
    const o=await order(), p=await receipt('CANCELLED'); await cancelOrder(db,o.id); const before=await snapshot();
    await assert.rejects(payPartnerDebt(db,payload([item(o.id)])), /hủy/);
    await assert.rejects(payPartnerDebt(db,payload([item(p,100,'PURCHASE')],502)), /hủy/);
    assert.deepEqual(await snapshot(),before);
  });
  await check('C04: collecting two invoices records payments, cash, COD and correct partial status together', async () => {
    const a=await order(), b=await order(); const result=await payPartnerDebt(db,payload([item(a.id,200),item(b.id,1000)]));
    assert.equal(result.transactions.length,2);
    assert.deepEqual(await row(a.id),{paid_amount_cents:200,cod_amount_cents:800,payment_status:'PARTIALLY_PAID'});
    assert.deepEqual(await row(b.id),{paid_amount_cents:1000,cod_amount_cents:0,payment_status:'PAID'});
    assert.equal(await sum('payments',a.id),200); assert.equal(await sum('cash_transactions',a.id),200);
    assert.equal((await db.prepare('SELECT cod_amount_cents FROM shipments WHERE order_id=?').bind(a.id).first()).cod_amount_cents,800);
  });
  await check('C05: failure on the second cash entry rolls back both invoices and all receipts', async () => {
    const a=await order(), b=await order(), before=await snapshot();
    await db.prepare(`CREATE TRIGGER fail_second_cash BEFORE INSERT ON cash_transactions WHEN NEW.reference_id = ${b.id} BEGIN SELECT RAISE(ABORT,'injected second cash failure'); END`).run();
    try { await assert.rejects(payPartnerDebt(db,payload([item(a.id),item(b.id)])), /injected/); }
    finally { await db.prepare('DROP TRIGGER fail_second_cash').run(); }
    assert.deepEqual(await snapshot(),before);
  });
  await check('C06: concurrent retry charges once; changed payload under the same key is refused', async () => {
    const o=await order(), p=payload([item(o.id,200)]);
    const results=await Promise.all([payPartnerDebt(db,p),payPartnerDebt(db,p)]); assert.deepEqual(results[0],results[1]);
    assert.equal(await sum('payments',o.id),200); assert.equal(await sum('cash_transactions',o.id),200);
    await assert.rejects(payPartnerDebt(db,{...p,items:[item(o.id,300)]}), /nội dung khác/);
  });
  await check('C07: bulk collection racing with POS collection cannot lose an update or exceed the debt', async () => {
    const o=await order();
    const result=await Promise.allSettled([payPartnerDebt(db,payload([item(o.id,600)])),addPosOrderPayment(db,{order_id:o.id,amount_paid_cents:600})]);
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await row(o.id)).paid_amount_cents,600); assert.equal(await sum('payments',o.id),600);
  });
  await check('C08: supplier payments for draft and completed receipts update debt and cash without touching stock', async () => {
    const a=await receipt(), b=await receipt('DRAFT');
    const stockBefore=(await db.prepare('SELECT id,stock FROM products ORDER BY id').all()).results;
    const p=payload([item(a,200,'PURCHASE'),item(b,300,'PURCHASE')],502); await payPartnerDebt(db,p); await payPartnerDebt(db,p);
    assert.deepEqual(await db.prepare('SELECT paid_amount_cents,debt_amount_cents FROM purchase_receipts WHERE id=?').bind(a).first(),{paid_amount_cents:200,debt_amount_cents:800});
    assert.equal((await db.prepare('SELECT paid_amount_cents FROM purchase_receipts WHERE id=?').bind(b).first()).paid_amount_cents,300);
    assert.deepEqual((await db.prepare('SELECT id,stock FROM products ORDER BY id').all()).results,stockBefore);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM cash_transactions WHERE reference_type='purchase_receipt' AND reference_id IN (?,?)").bind(a,b).first()).n,2);
  });
  await check('C09: inconsistent historical payment records cannot be extended silently', async () => {
    const o=await order(), p=await receipt();
    await db.prepare('UPDATE orders SET paid_amount_cents=100,cod_amount_cents=900 WHERE id=?').bind(o.id).run();
    await db.prepare('UPDATE purchase_receipts SET paid_amount_cents=100,debt_amount_cents=900 WHERE id=?').bind(p).run();
    const before=await snapshot();
    await assert.rejects(payPartnerDebt(db,payload([item(o.id)])), /lệch/);
    await assert.rejects(payPartnerDebt(db,payload([item(p,100,'PURCHASE')],502)), /lệch/);
    assert.deepEqual(await snapshot(),before);
  });
  await check('C10: repair collection counts previous cash; overcollection and ambiguous legacy identity fail', async () => {
    await db.prepare("INSERT INTO customers(id,customer_code,name,phone) VALUES(500,'TEST-C500','Customer A','TEST-A')").run();
    const r=await db.prepare("INSERT INTO repair_tickets(ticket_code,owner_type,customer_id,problem_reported,repair_price_cents) VALUES('TEST-C-REPAIR','CUSTOMER',500,'Test',1000)").run();
    const id=r.meta.last_row_id; await payPartnerDebt(db,payload([item(id,200,'REPAIR')]));
    const listed = await listPartners(db,{ type: 'CUSTOMER' });
    assert.equal(listed.partners.find(p => p.id === 500).repair_debt_cents,800);
    const details = await getPartnerDetailsWithHistory(db,500);
    const repair = details.repairs.find(r => r.id === id);
    assert.equal(repair.paid_amount_cents,200); assert.equal(repair.debt_amount_cents,800);
    const before=await snapshot();
    await assert.rejects(payPartnerDebt(db,payload([item(id,900,'REPAIR')])), /vượt/);
    assert.deepEqual(await snapshot(),before);
    await db.prepare("UPDATE customers SET customer_code='UNMATCHED-LEGACY' WHERE id=500").run();
    await assert.rejects(payPartnerDebt(db,payload([item(id,100,'REPAIR')])), /Định danh/);
    await db.prepare("UPDATE customers SET customer_code='TEST-C500' WHERE id=500").run();
  });
  await check('C13: concurrent supplier payments cannot overpay and late cash failure rolls back all supplier debts', async () => {
    const a=await receipt(), b=await receipt();
    const result=await Promise.allSettled([payPartnerDebt(db,payload([item(a,600,'PURCHASE')],502)),payPartnerDebt(db,payload([item(a,600,'PURCHASE')],502))]);
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await db.prepare('SELECT paid_amount_cents FROM purchase_receipts WHERE id=?').bind(a).first()).paid_amount_cents,600);
    const before=await snapshot();
    await db.prepare(`CREATE TRIGGER fail_supplier_cash BEFORE INSERT ON cash_transactions WHEN NEW.reference_type='purchase_receipt' AND NEW.reference_id=${b} BEGIN SELECT RAISE(ABORT,'injected supplier failure'); END`).run();
    try { await assert.rejects(payPartnerDebt(db,payload([item(a,100,'PURCHASE'),item(b,100,'PURCHASE')],502)), /injected/); }
    finally { await db.prepare('DROP TRIGGER fail_supplier_cash').run(); }
    assert.deepEqual(await snapshot(),before);
  });
  await check('C14: cancelling after bulk collection credits exactly the collected amount once and preserves cash', async () => {
    const o=await order(), balance=await getCustomerCredit(db,500);
    await payPartnerDebt(db,payload([item(o.id,200)]));
    await cancelOrder(db,o.id); await cancelOrder(db,o.id);
    assert.equal(await getCustomerCredit(db,500),balance+200);
    assert.equal(await sum('payments',o.id),200); assert.equal(await sum('cash_transactions',o.id),200);
  });
  await check('C15: concurrent repair collection cannot overcollect; a mixed order/repair cash failure rolls back both', async () => {
    const r=await db.prepare("INSERT INTO repair_tickets(ticket_code,owner_type,customer_id,problem_reported,repair_price_cents) VALUES('TEST-C-REPAIR2','CUSTOMER',500,'Test',1000)").run();
    const id=r.meta.last_row_id;
    const results=await Promise.allSettled([payPartnerDebt(db,payload([item(id,600,'REPAIR')])),payPartnerDebt(db,payload([item(id,600,'REPAIR')]))]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const o=await order(), before=await snapshot();
    await db.prepare(`CREATE TRIGGER fail_repair_cash BEFORE INSERT ON cash_transactions WHEN NEW.reference_type='repair_ticket' AND NEW.reference_id=${id} BEGIN SELECT RAISE(ABORT,'injected repair cash failure'); END`).run();
    try { await assert.rejects(payPartnerDebt(db,payload([item(o.id,100),item(id,100,'REPAIR')])), /injected/); }
    finally { await db.prepare('DROP TRIGGER fail_repair_cash').run(); }
    assert.deepEqual(await snapshot(),before);
  });
  await check('C16: customers with identical names do not inherit each other cash entries or unlinked manual cash', async () => {
    await db.prepare("UPDATE partners SET name='Customer A' WHERE id=501").run();
    const f=await db.prepare("INSERT INTO products(name,slug,price_cents,currency,stock,stock_new,stock_used,tracking_mode,has_serial,cost_price_cents) VALUES('Same name','same-name',1000,'vnd',1,1,0,'QUANTITY',0,600)").run();
    const o=await createPosOrder(db,{request_id:crypto.randomUUID(),customer_id:501,order_type:'PREORDER',items:[{product_id:f.meta.last_row_id,quantity:1,condition:'NEW',unit_price_cents:1000}],payment:{amount_paid_cents:200}});
    const manual=await recordManualCashTransaction(db,{flow_type:'IN',account_type:'CASH',category:'OTHER',amount_cents:100,recipient_name:'Customer A'});
    const details=await getPartnerDetailsWithHistory(db,500);
    assert.ok(!details.cash_transactions.some(c=>c.reference_type==='ORDER' && c.reference_id===o.id));
    assert.ok(!details.cash_transactions.some(c=>c.id===manual.id));
  });
  await check('C11: manual cash rejects negative/fractional money and untethered business payments', async () => {
    const base={flow_type:'IN',account_type:'CASH',category:'OTHER',amount_cents:100}, before=await snapshot();
    for (const amount of [-100,0,0.5]) await assert.rejects(recordCashTransaction(db,{...base,amount_cents:amount}));
    for (const category of ['ORDER_PAYMENT','PURCHASE','REPAIR_FEE','DEPOSIT','REFUND','COD_SETTLEMENT']) await assert.rejects(recordManualCashTransaction(db,{...base,category}), /chứng từ/);
    await assert.rejects(recordManualCashTransaction(db,{...base,category:'EXPENSE'}));
    assert.deepEqual(await snapshot(),before);
  });
  await check('C12: concurrent manual cash gets unique codes and same-request retries produce one receipt', async () => {
    const base={flow_type:'IN',account_type:'CASH',category:'OTHER',amount_cents:100}, p={...base,request_id:crypto.randomUUID()};
    const same=await Promise.all([recordManualCashTransaction(db,p),recordManualCashTransaction(db,p)]); assert.deepEqual(same[0],same[1]);
    const different=await Promise.all([recordManualCashTransaction(db,base),recordManualCashTransaction(db,base)]); assert.notEqual(different[0].transaction_code,different[1].transaction_code);
    await assert.rejects(recordManualCashTransaction(db,{...p,amount_cents:200}), /nội dung khác/);
  });
} finally { await mf.dispose(); }
if (failures) process.exitCode=1;
