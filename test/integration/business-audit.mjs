import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { auditBusinessInvariants } from '../../src/features/kgame/audit.ts';

// Isolated D1, with the recorded fields used by the audit. The existing worker
// integration gate remains responsible for applying every real migration.
const mf = new Miniflare({ modules: true,
  script: 'export default { fetch() { return new Response("ok") } }',
  compatibilityDate: '2026-07-20', d1Databases: ['DB'] });

try {
  const db = await mf.getD1Database('DB');
  const schema = [
    `CREATE TABLE orders (id INTEGER PRIMARY KEY, order_code TEXT, order_type TEXT,
      order_status TEXT, customer_id INTEGER, amount_total_cents INTEGER,
      paid_amount_cents INTEGER, cod_amount_cents INTEGER)`,
    `CREATE TABLE purchase_receipts (id INTEGER PRIMARY KEY, receipt_code TEXT,
      receipt_status TEXT, total_amount_cents INTEGER, paid_amount_cents INTEGER, debt_amount_cents INTEGER)`,
    `CREATE TABLE payments (id INTEGER PRIMARY KEY, order_id INTEGER, amount_cents INTEGER)`,
    `CREATE TABLE cash_transactions (id INTEGER PRIMARY KEY, transaction_code TEXT,
      reference_type TEXT, reference_id INTEGER)`,
    `CREATE TABLE products (id INTEGER PRIMARY KEY, product_code TEXT, stock INTEGER,
      stock_new INTEGER, stock_used INTEGER)`,
    `CREATE TABLE product_types (id INTEGER PRIMARY KEY, code TEXT, name TEXT,
      cached_stock_new INTEGER, cached_stock_used INTEGER)`,
  ];
  for (const sql of schema) await db.prepare(sql).run();
  await db.batch([
    db.prepare("INSERT INTO orders VALUES (1,'ĐH0001','ORDER','COMPLETED',1,100,100,0)"),
    db.prepare("INSERT INTO orders VALUES (2,'ĐH0002','PREORDER','PENDING',1,100,20,80)"),
    // Original storefront orders use a separate payment model; no KGAME code.
    db.prepare("INSERT INTO orders VALUES (3,NULL,'ORDER','PENDING',NULL,100,0,0)"),
    db.prepare("INSERT INTO orders VALUES (4,'ĐH0004','ORDER','CANCELLED',1,100,20,0)"),
    db.prepare('INSERT INTO payments VALUES (1,1,100),(2,2,20)'),
    db.prepare("INSERT INTO purchase_receipts VALUES (1,'PN0001','COMPLETED',100,20,80)"),
    // Drafts are not a recognized supplier liability.
    db.prepare("INSERT INTO purchase_receipts VALUES (2,'PN0002','DRAFT',100,0,0)"),
    db.prepare("INSERT INTO products VALUES (1,'SP0001',10,6,4),(2,NULL,3,0,0)"),
    db.prepare("INSERT INTO product_types VALUES (1,'PL0001','Test',6,4)"),
    // Cancelling a document does not prove the real cash movement never existed.
    db.prepare("INSERT INTO cash_transactions VALUES (1,'PT0001','ORDER',4)"),
  ]);
  let result = await auditBusinessInvariants(db);
  assert.equal(result.passed, true);
  assert.equal(result.totalChecks, 8);
  console.log('✓ clean records, preorder, drafts and original storefront scope');

  await db.batch([
    db.prepare('UPDATE orders SET cod_amount_cents = 10 WHERE id = 1'),
    db.prepare('UPDATE orders SET cod_amount_cents = 70 WHERE id = 2'),
  ]);
  result = await auditBusinessInvariants(db);
  assert.equal(result.discrepancies.filter(d => d.entity === 'ORDER_REMAINING').length, 2);
  console.log('✓ opposite discrepancies cannot cancel out in a customer aggregate');
  await db.batch([
    db.prepare('UPDATE orders SET cod_amount_cents = 0 WHERE id = 1'),
    db.prepare('UPDATE orders SET cod_amount_cents = 80 WHERE id = 2'),
    db.prepare('UPDATE payments SET amount_cents = 90 WHERE id = 1'),
    db.prepare('UPDATE orders SET customer_id = NULL WHERE id = 2'),
    db.prepare('UPDATE products SET stock_new = 7 WHERE id = 1'),
    db.prepare('UPDATE product_types SET cached_stock_used = -1 WHERE id = 1'),
    db.prepare("INSERT INTO cash_transactions VALUES (2,'PT0002','ORDER',999),(3,'PC0001','purchase_receipt',999)"),
    db.prepare('UPDATE purchase_receipts SET debt_amount_cents = 70 WHERE id = 1'),
  ]);
  const before = await db.prepare('SELECT * FROM orders ORDER BY id').all();
  result = await auditBusinessInvariants(db);
  assert.equal(result.passed, false);
  const entities = new Set(result.discrepancies.map(d => d.entity));
  for (const entity of ['ORDER_PAYMENTS', 'UNASSIGNED_REMAINING', 'PRODUCT_STOCK', 'TYPE_STOCK', 'CASH_REFERENCE', 'SUPPLIER_REMAINING']) {
    assert.ok(entities.has(entity), entity);
  }
  assert.equal(result.discrepancies.filter(d => d.entity === 'CASH_REFERENCE').length, 2);
  assert.deepEqual((await db.prepare('SELECT * FROM orders ORDER BY id').all()).results, before.results);
  console.log('✓ payment mismatch, missing customer, stock mismatch, orphan cash, supplier mismatch; audit preserves records');

  await db.prepare('UPDATE orders SET paid_amount_cents = 101 WHERE id = 1').run();
  assert.ok((await auditBusinessInvariants(db)).discrepancies.some(d => d.entity === 'ORDER_AMOUNTS'));
  await db.prepare('UPDATE orders SET paid_amount_cents = 0.5 WHERE id = 1').run();
  assert.ok((await auditBusinessInvariants(db)).discrepancies.some(d => d.entity === 'ORDER_AMOUNTS'));
  console.log('✓ overpayment and fractional money are flagged');
  await assert.rejects(auditBusinessInvariants({ prepare() { return { all: async () => ({ success: false, results: [] }) }; } }));
  console.log('✓ failed D1 response cannot pass');
} finally {
  await mf.dispose();
}
