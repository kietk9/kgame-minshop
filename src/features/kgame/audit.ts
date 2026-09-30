import type { D1Database } from '@cloudflare/workers-types';

export interface AuditRow {
  id: number;
  code: string;
  expected: number;
  actual: number;
}

// These checks validate recorded arithmetic and references. They do not certify
// debt recognition, refund policy, opening inventory, or provider settlements.
export const BUSINESS_AUDIT_CHECKS = [
  {
    entity: 'ORDER_REMAINING', label: 'Số tiền còn lại trên đơn KGAME',
    sql: `SELECT id, order_code AS code,
      amount_total_cents - paid_amount_cents AS expected, cod_amount_cents AS actual
      FROM orders WHERE order_code IS NOT NULL AND order_status != 'CANCELLED'
      AND (cod_amount_cents IS NULL OR paid_amount_cents IS NULL OR amount_total_cents IS NULL
        OR cod_amount_cents != amount_total_cents - paid_amount_cents)`,
  },
  {
    entity: 'ORDER_AMOUNTS', label: 'Số tiền không âm, nguyên và không trả vượt tổng đơn',
    sql: `SELECT id, order_code AS code, amount_total_cents AS expected, paid_amount_cents AS actual
      FROM orders WHERE order_code IS NOT NULL AND
      (amount_total_cents IS NULL OR paid_amount_cents IS NULL OR cod_amount_cents IS NULL
        OR amount_total_cents < 0 OR paid_amount_cents < 0 OR cod_amount_cents < 0
        OR paid_amount_cents > amount_total_cents
        OR typeof(amount_total_cents) != 'integer' OR typeof(paid_amount_cents) != 'integer'
        OR typeof(cod_amount_cents) != 'integer')`,
  },
  {
    entity: 'SUPPLIER_REMAINING', label: 'Số tiền còn lại trên phiếu nhập hoàn thành',
    sql: `SELECT id, receipt_code AS code, total_amount_cents - paid_amount_cents AS expected,
      debt_amount_cents AS actual FROM purchase_receipts WHERE receipt_status = 'COMPLETED'
      AND (debt_amount_cents IS NULL OR total_amount_cents IS NULL OR paid_amount_cents IS NULL
        OR debt_amount_cents != total_amount_cents - paid_amount_cents
        OR paid_amount_cents < 0 OR paid_amount_cents > total_amount_cents OR total_amount_cents < 0
        OR typeof(total_amount_cents) != 'integer' OR typeof(paid_amount_cents) != 'integer'
        OR typeof(debt_amount_cents) != 'integer')`,
  },
  {
    entity: 'UNASSIGNED_REMAINING', label: 'Đơn còn tiền chưa trả nhưng thiếu khách hàng',
    sql: `SELECT id, order_code AS code, 0 AS expected, cod_amount_cents AS actual FROM orders
      WHERE order_code IS NOT NULL AND order_status != 'CANCELLED'
      AND cod_amount_cents > 0 AND customer_id IS NULL`,
  },
  {
    entity: 'ORDER_PAYMENTS', label: 'Tiền đã thu khớp các lần thanh toán của đơn',
    sql: `SELECT o.id, o.order_code AS code, COALESCE(SUM(p.amount_cents), 0) AS expected,
      o.paid_amount_cents AS actual FROM orders o LEFT JOIN payments p ON p.order_id = o.id
      WHERE o.order_code IS NOT NULL AND o.order_status != 'CANCELLED'
      GROUP BY o.id HAVING o.paid_amount_cents != COALESCE(SUM(p.amount_cents), 0)`,
  },
  {
    entity: 'CASH_REFERENCE', label: 'Phiếu quỹ có tham chiếu đơn hoặc phiếu nhập tồn tại',
    sql: `SELECT ct.id, ct.transaction_code AS code, 1 AS expected, 0 AS actual
      FROM cash_transactions ct WHERE ct.reference_id IS NOT NULL AND (
        (UPPER(ct.reference_type) = 'ORDER' AND NOT EXISTS
          (SELECT 1 FROM orders o WHERE o.id = ct.reference_id)) OR
        (UPPER(ct.reference_type) = 'PURCHASE_RECEIPT' AND NOT EXISTS
          (SELECT 1 FROM purchase_receipts pr WHERE pr.id = ct.reference_id)))`,
  },
  {
    entity: 'PRODUCT_STOCK', label: 'Tồn tổng sản phẩm KGAME khớp tồn mới và đã sử dụng',
    sql: `SELECT id, product_code AS code, stock_new + stock_used AS expected, stock AS actual
      FROM products WHERE product_code IS NOT NULL AND
      (stock IS NULL OR stock_new IS NULL OR stock_used IS NULL OR stock < 0 OR stock_new < 0
        OR stock_used < 0 OR stock != stock_new + stock_used
        OR typeof(stock) != 'integer' OR typeof(stock_new) != 'integer' OR typeof(stock_used) != 'integer')`,
  },
  {
    entity: 'TYPE_STOCK', label: 'Tồn từng phân loại không âm và là số nguyên',
    sql: `SELECT id, COALESCE(code, name) AS code, 0 AS expected,
      MIN(cached_stock_new, cached_stock_used) AS actual FROM product_types WHERE
      cached_stock_new IS NULL OR cached_stock_used IS NULL OR cached_stock_new < 0
      OR cached_stock_used < 0 OR typeof(cached_stock_new) != 'integer'
      OR typeof(cached_stock_used) != 'integer'`,
  },
] as const;

export interface AuditDiscrepancy extends AuditRow {
  entity: string;
  diff: number;
  message: string;
}

export async function runBusinessAudit(query: (sql: string) => Promise<AuditRow[]>) {
  const discrepancies: AuditDiscrepancy[] = [];
  for (const check of BUSINESS_AUDIT_CHECKS) {
    const rows = await query(check.sql); // A failed query aborts; it is never a pass.
    for (const row of rows) {
      discrepancies.push({ ...row, entity: check.entity, diff: row.actual - row.expected,
        message: `${check.label}: ${row.code || '#' + row.id}` });
    }
  }
  return { passed: discrepancies.length === 0, totalChecks: BUSINESS_AUDIT_CHECKS.length, discrepancies };
}

export async function auditBusinessInvariants(db: D1Database) {
  return runBusinessAudit(async sql => {
    const result = await db.prepare(sql).all<AuditRow>();
    if (!result.success || !Array.isArray(result.results)) throw new Error('Không đọc được dữ liệu kiểm tra.');
    return result.results;
  });
}
