import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { applyKgameMigrations } from './kgame-migrations.mjs';
import { createPosOrder, fulfillPreorder, addPosOrderPayment, addRepairReplacementItem, updatePosOrderStatus } from '../../src/features/kgame/db.ts';
import { cancelOrder } from '../../src/features/kgame/ledger.ts';
import { getCustomerCredit } from '../../src/features/kgame/credit.ts';

const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok") } }',
  compatibilityDate: '2026-07-20', d1Databases: ['DB'] });
let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (err) { failures++; console.error(`✗ ${name}: ${err.stack}`); }
};
try {
  const db = await mf.getD1Database('DB');
  await applyKgameMigrations(db);
  console.log('✓ B00: all production migrations applied to isolated D1');
  await db.prepare("INSERT INTO partners (id, partner_code, name, phone, is_customer, is_supplier) VALUES (500, 'KH0500', 'Test customer', 'TEST-PHONE', 1, 0)").run();
  let sequence = 0;
  async function fixture(stock = 10, serial = false, used = false) {
    const n = ++sequence, cond = used ? 'QSD' : 'NEW';
    const p = await db.prepare(`INSERT INTO products (name, slug, product_code, price_cents, currency, stock, stock_new, stock_used,
      tracking_mode, has_serial, cost_price_cents, cost_price_used_cents) VALUES (?, ?, ?, 1000, 'vnd', ?, ?, ?, ?, ?, 600, 400)`)
      .bind(`Test ${n}`, `test-${n}`, `SP${n}`, stock, used ? 0 : stock, used ? stock : 0, serial ? 'CODE' : 'QUANTITY', serial ? 1 : 0).run();
    const pid = p.meta.last_row_id;
    const t = await db.prepare(`INSERT INTO product_types (product_id, name, tracking_mode, cached_stock_new, cached_stock_used, cost_price_cents)
      VALUES (?, 'Standard', ?, ?, ?, 600)`).bind(pid, serial ? 'CODE' : 'QUANTITY', used ? 0 : stock, used ? stock : 0).run();
    const tid = t.meta.last_row_id;
    let uid = null;
    if (serial) {
      const u = await db.prepare("INSERT INTO product_units (product_type_id, program_code, condition, availability, owner_type, cost_price_cents) VALUES (?, ?, ?, 'IN_STOCK', 'KGAME', 550)")
        .bind(tid, `TEST-UNIT-${n}`, cond).run();
      uid = u.meta.last_row_id;
    }
    return { pid, tid, uid, cond };
  }
  const input = (f, extra = {}) => ({ request_id: crypto.randomUUID(), customer_id: 500, order_type: 'ORDER',
    items: [{ product_id: f.pid, product_type_id: f.tid, product_unit_id: f.uid, condition: f.cond, quantity: 1, unit_price_cents: 1000 }],
    payment: { amount_paid_cents: 1000, payment_method: 'CASH' }, shipment: { carrier: 'PICKUP' }, ...extra });
  const stock = pid => db.prepare('SELECT stock, stock_new, stock_used FROM products WHERE id = ?').bind(pid).first();
  const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first().then(row => row.n);
  const counts = async () => Object.fromEntries(await Promise.all(['orders','order_lines','order_units','payments','cash_transactions','inventory_transactions','partners','product_types','kgame_operations','customer_credit_entries']
    .map(async table => [table, await count(table)])));

  await check('P03: individual authority gates prices, discounts, debt and credit independently',async()=>{
    const f=await fixture(),base=input(f),none={price:false,discount:false,debt:false,credit:false};
    const altered=input(f,{items:[{...base.items[0],unit_price_cents:900}],payment:{amount_paid_cents:900}});
    const before=await counts();await assert.rejects(createPosOrder(db,altered,none),/đổi giá/);assert.deepEqual(await counts(),before);
    await createPosOrder(db,altered,{...none,price:true});
    const discount=input(f,{discount_cents:20,payment:{amount_paid_cents:980}});
    await assert.rejects(createPosOrder(db,discount,none),/giảm giá/);await createPosOrder(db,discount,{...none,discount:true});
    const debt=input(f,{payment:{amount_paid_cents:0}});
    await assert.rejects(createPosOrder(db,debt,none),/còn nợ/);await createPosOrder(db,debt,{...none,debt:true});
    const pre=await createPosOrder(db,input(f,{order_type:'PREORDER',payment:{amount_paid_cents:0}}),none);
    await assert.rejects(fulfillPreorder(db,pre.id,{amount_paid_cents:0},crypto.randomUUID(),undefined,none),/còn nợ/);
    await fulfillPreorder(db,pre.id,{amount_paid_cents:0},crypto.randomUUID(),undefined,{...none,debt:true});
    await assert.rejects(addPosOrderPayment(db,{order_id:pre.id,amount_paid_cents:100,payment_method:'CREDIT'},none),/số dư/);
    await db.prepare("UPDATE product_types SET sale_price_cents=1200 WHERE id=?").bind(f.tid).run();
    await assert.rejects(createPosOrder(db,input(f),none),/đổi giá/);
  });

  await check('B01: cancelling a processing order restores actual stock and records one reversal', async () => {
    const f = await fixture(), o = await createPosOrder(db, input(f, { shipment: { carrier: 'GHN' }, payment: { amount_paid_cents: 0 } }));
    assert.equal((await stock(f.pid)).stock, 9);
    await cancelOrder(db, o.id); await cancelOrder(db, o.id);
    assert.equal((await stock(f.pid)).stock, 10);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM inventory_transactions WHERE reference_id = ? AND transaction_type = 'SALE_REVERSE'").bind(o.id).first()).n, 1);
  });
  await check('B02: preorder serial is reserved, cannot be sold elsewhere, and is released on cancellation', async () => {
    const f = await fixture(1, true), o = await createPosOrder(db, input(f, { order_type: 'PREORDER', payment: { amount_paid_cents: 200 } }));
    assert.equal((await db.prepare('SELECT availability FROM product_units WHERE id = ?').bind(f.uid).first()).availability, 'RESERVED');
    assert.equal((await stock(f.pid)).stock, 1);
    await assert.rejects(createPosOrder(db, input(f)), /Serial/);
    const beforeCredit = await getCustomerCredit(db, 500);
    await cancelOrder(db, o.id); await cancelOrder(db, o.id);
    assert.equal((await db.prepare('SELECT availability FROM product_units WHERE id = ?').bind(f.uid).first()).availability, 'IN_STOCK');
    assert.equal(await getCustomerCredit(db, 500), beforeCredit + 200);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM cash_transactions WHERE reference_id = ? AND status = 'ACTIVE'").bind(o.id).first()).n, 1);
  });
  await check('B03/B05: reject insufficient stock, duplicate-line demand, anonymous debt and invalid customer without writes', async () => {
    const f = await fixture(1), before = await counts();
    const base = input(f);
    await assert.rejects(createPosOrder(db, { ...base, items: [{ ...base.items[0], quantity: 2 }], payment: { amount_paid_cents: 2000 } }), /tồn kho/);
    await assert.rejects(createPosOrder(db, { ...base, request_id: crypto.randomUUID(), items: [...base.items, ...base.items], payment: { amount_paid_cents: 2000 } }), /tồn kho/);
    await assert.rejects(createPosOrder(db, input(f, { customer_id: null, payment: { amount_paid_cents: 0 } })), /khách hàng/);
    await assert.rejects(createPosOrder(db, input(f, { customer_id: 101 })), /Khách hàng/);
    assert.deepEqual(await counts(), before);
    assert.equal((await stock(f.pid)).stock, 1);
    const pre = await createPosOrder(db, input(f, { order_type: 'PREORDER', items: [{ ...base.items[0], quantity: 2 }], payment: { amount_paid_cents: 0 } }));
    assert.ok(pre.id); assert.equal((await stock(f.pid)).stock, 1);
  });
  await check('B04: cancelled preorder cannot be fulfilled or receive another payment', async () => {
    const f = await fixture(), o = await createPosOrder(db, input(f, { order_type: 'PREORDER', payment: { amount_paid_cents: 0 } }));
    await cancelOrder(db, o.id);
    const before = await counts();
    await assert.rejects(fulfillPreorder(db, o.id, { amount_paid_cents: 0 }), /hủy/);
    await assert.rejects(addPosOrderPayment(db, { order_id: o.id, amount_paid_cents: 100 }), /hủy/);
    assert.deepEqual(await counts(), before); assert.equal((await stock(f.pid)).stock, 10);
  });
  await check('B06: a real SQLite failure at cash insert rolls back order, stock, payment and auto-created customer', async () => {
    const f = await fixture(), before = await counts();
    await db.prepare("CREATE TRIGGER test_fail_cash BEFORE INSERT ON cash_transactions BEGIN SELECT RAISE(ABORT, 'injected cash failure'); END").run();
    try {
      await assert.rejects(createPosOrder(db, input(f, { customer_id: null, customer_phone: 'NEW-TEST-CUSTOMER' })), /injected cash failure/);
    } finally { await db.prepare('DROP TRIGGER test_fail_cash').run(); }
    assert.deepEqual(await counts(), before); assert.equal((await stock(f.pid)).stock, 10);
  });
  await check('B07: repair use updates new stock, total stock, variant, journal and repair cost atomically', async () => {
    const f = await fixture(), ticket = await db.prepare("INSERT INTO repair_tickets (ticket_code, owner_type, unidentified_product_name, problem_reported) VALUES ('TEST-REPAIR', 'CUSTOMER', 'Test', 'Test')").run();
    const id = ticket.meta.last_row_id;
    await addRepairReplacementItem(db, id, f.pid, f.tid, 1, 600, 'Test');
    assert.deepEqual(await stock(f.pid), { stock: 9, stock_new: 9, stock_used: 0 });
    assert.equal((await db.prepare('SELECT repair_cost_cents FROM repair_tickets WHERE id = ?').bind(id).first()).repair_cost_cents, 600);
    await assert.rejects(addRepairReplacementItem(db, id, f.pid, f.tid, 10, 600, 'Test'), /tồn kho/);
    assert.equal((await stock(f.pid)).stock, 9);
  });
  await check('B08: deposit 200, fulfill with 500 and collect 300 balances payments, cash, COD and one stock export', async () => {
    const f = await fixture(), o = await createPosOrder(db, input(f, { order_type: 'PREORDER', payment: { amount_paid_cents: 200 } }));
    await fulfillPreorder(db, o.id, { amount_paid_cents: 500 });
    const partial = await db.prepare('SELECT paid_amount_cents, cod_amount_cents FROM orders WHERE id = ?').bind(o.id).first();
    assert.deepEqual(partial, { paid_amount_cents: 700, cod_amount_cents: 300 });
    await addPosOrderPayment(db, { order_id: o.id, amount_paid_cents: 300 });
    assert.equal((await db.prepare('SELECT SUM(amount_cents) AS n FROM payments WHERE order_id = ?').bind(o.id).first()).n, 1000);
    assert.equal((await db.prepare("SELECT SUM(amount_cents) AS n FROM cash_transactions WHERE reference_type = 'ORDER' AND reference_id = ?").bind(o.id).first()).n, 1000);
    assert.equal((await db.prepare('SELECT cod_amount_cents FROM shipments WHERE order_id = ?').bind(o.id).first()).cod_amount_cents, 0);
    assert.equal((await stock(f.pid)).stock, 9);
    await assert.rejects(fulfillPreorder(db, o.id), /đặt/);
  });
  await check('concurrent last-stock sales: one succeeds, one fails, no hidden negative stock', async () => {
    const f = await fixture(1), before = await count('orders');
    const result = await Promise.allSettled([createPosOrder(db, input(f)), createPosOrder(db, input(f))]);
    assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(await count('orders'), before + 1); assert.equal((await stock(f.pid)).stock, 0);
  });
  await check('same request retry creates exactly one order; changed payload under same key is refused', async () => {
    const f = await fixture(3), payload = input(f), before = await count('orders');
    const results = await Promise.all([createPosOrder(db, payload), createPosOrder(db, payload)]);
    assert.deepEqual(results[0], results[1]); assert.equal(await count('orders'), before + 1);
    assert.deepEqual(await createPosOrder(db, payload), results[0]);
    await assert.rejects(createPosOrder(db, { ...payload, note: 'changed' }), /nội dung khác/);
    assert.equal((await stock(f.pid)).stock, 2);
  });
  await check('two concurrent payments do not lose updates or over-collect; same request is charged once', async () => {
    const f = await fixture(), o = await createPosOrder(db, input(f, { payment: { amount_paid_cents: 0 } }));
    const p = { order_id: o.id, amount_paid_cents: 300, request_id: crypto.randomUUID() };
    const result = await Promise.all([addPosOrderPayment(db, p), addPosOrderPayment(db, p)]);
    assert.deepEqual(result[0], result[1]);
    const other = await Promise.allSettled([addPosOrderPayment(db, { order_id: o.id, amount_paid_cents: 500 }), addPosOrderPayment(db, { order_id: o.id, amount_paid_cents: 500 })]);
    assert.equal(other.filter(r => r.status === 'fulfilled').length, 1);
    const row = await db.prepare('SELECT paid_amount_cents FROM orders WHERE id = ?').bind(o.id).first();
    assert.equal(row.paid_amount_cents, 800);
    assert.equal((await db.prepare('SELECT SUM(amount_cents) AS n FROM payments WHERE order_id = ?').bind(o.id).first()).n, 800);
  });
  await check('concurrent fulfillment exports and collects only once', async () => {
    const f = await fixture(), o = await createPosOrder(db, input(f, { order_type: 'PREORDER', payment: { amount_paid_cents: 200 } }));
    const key = crypto.randomUUID();
    const results = await Promise.all([fulfillPreorder(db, o.id, { amount_paid_cents: 800 }, key), fulfillPreorder(db, o.id, { amount_paid_cents: 800 }, key)]);
    assert.deepEqual(results[0], results[1]); assert.equal((await stock(f.pid)).stock, 9);
    assert.equal((await db.prepare('SELECT SUM(amount_cents) AS n FROM payments WHERE order_id = ?').bind(o.id).first()).n, 1000);
  });
  await check('cancelling paid completed orders requires returned goods and credits the customer without erasing cash', async () => {
    const f = await fixture(2, true, true), o = await createPosOrder(db, input(f));
    await assert.rejects(cancelOrder(db, o.id), /nhận lại/);
    const balance = await getCustomerCredit(db, 500);
    await Promise.all([cancelOrder(db, o.id, 'Test', { return_confirmed: true }), cancelOrder(db, o.id, 'Test', { return_confirmed: true })]);
    assert.equal(await getCustomerCredit(db, 500), balance + 1000);
    assert.deepEqual(await stock(f.pid), { stock: 2, stock_new: 0, stock_used: 2 });
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM cash_transactions WHERE reference_id = ? AND status = 'ACTIVE'").bind(o.id).first()).n, 1);
  });
  await check('customer credit pays an invoice once without cash; cancellation restores credit; insufficient balance rolls back', async () => {
    const f = await fixture(), balance = await getCustomerCredit(db, 500), cashBefore = await count('cash_transactions');
    assert.ok(balance >= 1000);
    const payload = input(f, { payment: { amount_paid_cents: 1000, payment_method: 'CREDIT' } });
    const o = await createPosOrder(db, payload);
    await createPosOrder(db, payload);
    assert.equal(await getCustomerCredit(db, 500), balance - 1000);
    assert.equal(await count('cash_transactions'), cashBefore);
    await cancelOrder(db, o.id, 'Credit paid', { return_confirmed: true });
    assert.equal(await getCustomerCredit(db, 500), balance);
    assert.equal(await count('cash_transactions'), cashBefore);
    const before = await counts();
    await assert.rejects(createPosOrder(db, input(f, { items: [{ ...payload.items[0], unit_price_cents: balance + 1 }], payment: { amount_paid_cents: balance + 1, payment_method: 'CREDIT' } })), /Số dư/);
    assert.deepEqual(await counts(), before);
    const two = await Promise.allSettled([1,2].map(() => createPosOrder(db, input(f, { items: [{ ...payload.items[0], unit_price_cents: balance }], payment: { amount_paid_cents: balance, payment_method: 'CREDIT' } }))));
    assert.equal(two.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(await getCustomerCredit(db, 500), 0);
  });
  await check('fulfillment assigns an available serial to an unassigned preorder and refuses price changes', async () => {
    const f = await fixture(1, true), base = input(f), o = await createPosOrder(db, input(f, { order_type: 'PREORDER', items: [{ ...base.items[0], product_unit_id: null }], payment: { amount_paid_cents: 0 } }));
    const line = await db.prepare('SELECT * FROM order_lines WHERE order_id = ?').bind(o.id).first();
    const assigned = [{ ...line, order_line_id: line.id, product_unit_id: f.uid }];
    await assert.rejects(fulfillPreorder(db, o.id, { amount_paid_cents: 0 }, crypto.randomUUID(), [{ ...assigned[0], unit_price_cents: 999 }]), /giá/);
    assert.equal((await stock(f.pid)).stock, 1);
    await fulfillPreorder(db, o.id, { amount_paid_cents: 1000 }, crypto.randomUUID(), assigned);
    assert.equal((await stock(f.pid)).stock, 0);
    assert.equal((await db.prepare('SELECT product_unit_id FROM order_units WHERE order_line_id = ?').bind(line.id).first()).product_unit_id, f.uid);
    assert.equal((await db.prepare('SELECT unit_cost_cents FROM order_lines WHERE id = ?').bind(line.id).first()).unit_cost_cents, 550);
  });
  await check('late failures roll back payment, fulfillment and cancellation credit with their stock changes', async () => {
    const f = await fixture(), o = await createPosOrder(db, input(f, { order_type: 'PREORDER', payment: { amount_paid_cents: 200 } }));
    let before = await counts();
    await db.prepare("CREATE TRIGGER test_fail_cash BEFORE INSERT ON cash_transactions BEGIN SELECT RAISE(ABORT, 'injected cash failure'); END").run();
    try {
      await assert.rejects(addPosOrderPayment(db, { order_id: o.id, amount_paid_cents: 100 }), /injected/);
      await assert.rejects(fulfillPreorder(db, o.id, { amount_paid_cents: 800 }), /injected/);
    } finally { await db.prepare('DROP TRIGGER test_fail_cash').run(); }
    assert.deepEqual(await counts(), before); assert.equal((await stock(f.pid)).stock, 10);
    assert.equal((await db.prepare('SELECT paid_amount_cents FROM orders WHERE id = ?').bind(o.id).first()).paid_amount_cents, 200);
    await db.prepare("CREATE TRIGGER test_fail_credit BEFORE INSERT ON customer_credit_entries BEGIN SELECT RAISE(ABORT, 'injected credit failure'); END").run();
    try { await assert.rejects(cancelOrder(db, o.id), /injected credit/); }
    finally { await db.prepare('DROP TRIGGER test_fail_credit').run(); }
    assert.deepEqual(await counts(), before);
    assert.equal((await db.prepare('SELECT order_status FROM orders WHERE id = ?').bind(o.id).first()).order_status, 'PENDING');
  });
  await check('paid anonymous cancellation needs a selected customer; status cannot bypass fulfillment or reopen completed invoices', async () => {
    const f = await fixture(), o = await createPosOrder(db, input(f, { customer_id: null }));
    await assert.rejects(cancelOrder(db, o.id, 'Test', { return_confirmed: true }), /khách/);
    await cancelOrder(db, o.id, 'Test', { return_confirmed: true, customer_id: 500 });
    assert.equal((await db.prepare('SELECT customer_id FROM orders WHERE id = ?').bind(o.id).first()).customer_id, 500);
    const pre = await createPosOrder(db, input(f, { order_type: 'PREORDER', payment: { amount_paid_cents: 0 } }));
    await assert.rejects(updatePosOrderStatus(db, pre.id, 'COMPLETED'), /xuất bán/);
    await fulfillPreorder(db, pre.id);
    await assert.rejects(updatePosOrderStatus(db, pre.id, 'PROCESSING'), /chuyển/);
  });
  await check('missing variants inherit stock atomically; ambiguous variants and fractional stock fail without writes', async () => {
    const f = await fixture(2);
    await db.prepare('DELETE FROM product_types WHERE id = ?').bind(f.tid).run();
    const base = input(f), o = await createPosOrder(db, input(f, { items: [{ ...base.items[0], product_type_id: null }] }));
    const t = await db.prepare('SELECT cached_stock_new FROM product_types WHERE product_id = ?').bind(f.pid).first();
    assert.equal(t.cached_stock_new, 1); assert.equal((await stock(f.pid)).stock, 1);
    await cancelOrder(db, o.id, 'Test', { return_confirmed: true });
    await db.prepare("INSERT INTO product_types (product_id,name,cached_stock_new) VALUES (?, 'Extra', 2)").bind(f.pid).run();
    let before = await counts();
    await assert.rejects(createPosOrder(db, input(f, { items: [{ ...base.items[0], product_type_id: null }] })), /phiên bản/);
    assert.deepEqual(await counts(), before);
    const fractional = await fixture(2);
    await db.prepare('UPDATE products SET stock = 2.5, stock_new = 2.5 WHERE id = ?').bind(fractional.pid).run();
    before = await counts();
    await assert.rejects(createPosOrder(db, input(fractional)), /tồn/);
    assert.deepEqual(await counts(), before);
  });
  await check('repair use late failure rolls back component, stock, journal and cost', async () => {
    const f = await fixture(1), ticket = await db.prepare("INSERT INTO repair_tickets (ticket_code, owner_type, unidentified_product_name, problem_reported) VALUES ('TEST-REPAIR-ROLLBACK', 'CUSTOMER', 'Test', 'Test')").run();
    const before = await counts(), id = ticket.meta.last_row_id;
    await db.prepare("CREATE TRIGGER test_fail_repair BEFORE INSERT ON repair_events BEGIN SELECT RAISE(ABORT, 'injected repair failure'); END").run();
    try { await assert.rejects(addRepairReplacementItem(db, id, f.pid, f.tid, 1, 600, 'Test'), /injected repair/); }
    finally { await db.prepare('DROP TRIGGER test_fail_repair').run(); }
    assert.deepEqual(await counts(), before); assert.equal((await stock(f.pid)).stock, 1);
    assert.equal((await db.prepare('SELECT repair_cost_cents FROM repair_tickets WHERE id = ?').bind(id).first()).repair_cost_cents, 0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM repair_items WHERE repair_ticket_id = ?').bind(id).first()).n, 0);
  });
  await check('a retry finishing during validation is recovered even when stock is already exhausted', async () => {
    const f = await fixture(1), payload = input(f), before = await count('orders');
    let armed = true, winner;
    const delayedDb = { prepare(sql) {
      let statement = db.prepare(sql);
      return { bind(...args) { statement = statement.bind(...args); return this; },
        async first(...args) {
          const row = await statement.first(...args);
          if (armed && sql.startsWith('SELECT payload_hash') && !row) {
            armed = false; winner = await createPosOrder(db, payload);
          }
          return row;
        }, all: (...args) => statement.all(...args), run: (...args) => statement.run(...args) };
    }, batch: statements => db.batch(statements) };
    assert.deepEqual(await createPosOrder(delayedDb, payload), winner);
    assert.equal(await count('orders'), before + 1); assert.equal((await stock(f.pid)).stock, 0);
  });
  await check('intentional duplicate customer phones stay separate; automatic matching fails and explicit selection works', async () => {
    await db.prepare("INSERT INTO partners(partner_code,name,phone,is_customer,is_supplier) VALUES ('TEST-DUP-A','Duplicate A','TEST-DUP-PHONE',1,0),('TEST-DUP-B','Duplicate B','TEST-DUP-PHONE',1,0)").run();
    const f = await fixture(), before = await counts();
    await assert.rejects(createPosOrder(db, input(f, { customer_id: null, customer_phone: 'TEST-DUP-PHONE' })), /nhiều khách/);
    assert.deepEqual(await counts(), before);
    const customer = await db.prepare("SELECT id FROM partners WHERE partner_code='TEST-DUP-B'").first();
    const o = await createPosOrder(db, input(f, { customer_id: customer.id, customer_phone: 'TEST-DUP-PHONE' }));
    assert.equal((await db.prepare('SELECT customer_id FROM orders WHERE id = ?').bind(o.id).first()).customer_id, customer.id);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM partners WHERE phone='TEST-DUP-PHONE'").first()).n, 2);
  });
  await check('invalid money, quantity, serial ownership/condition/type and overpayment are rejected without writes', async () => {
    const f = await fixture(1, true), other = await fixture(), before = await counts();
    const base = input(f);
    for (const amount of [-1, 0.5, 1001]) await assert.rejects(createPosOrder(db, input(f, { payment: { amount_paid_cents: amount } })));
    for (const qty of [0, -1, 0.5, 2]) await assert.rejects(createPosOrder(db, { ...base, items: [{ ...base.items[0], quantity: qty }] }));
    await assert.rejects(createPosOrder(db, { ...base, items: [{ ...base.items[0], product_type_id: other.tid }] }), /Phân loại/);
    await assert.rejects(createPosOrder(db, { ...base, items: [{ ...base.items[0], condition: 'QSD' }] }), /Serial/);
    await db.prepare("UPDATE product_units SET owner_type = 'CUSTOMER' WHERE id = ?").bind(f.uid).run();
    await assert.rejects(createPosOrder(db, input(f)), /Serial/);
    assert.deepEqual(await counts(), before);
  });
} finally { await mf.dispose(); }
if (failures) process.exitCode = 1;
