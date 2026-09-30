import type { D1Database } from '@cloudflare/workers-types';

/** POS sales cohort in the selected period; cash expenses use their actual date.
 * Never substitute purchases or a revenue percentage for recorded sale costs. */
export async function getPosFinancialReport(db: D1Database, start: string, end: string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw new Error('Khoảng ngày không hợp lệ.');
  const eligible=`o.order_status!='CANCELLED' AND (o.order_type='ORDER' OR (o.order_type='PREORDER' AND o.order_status='COMPLETED')) AND DATE(o.created_at,'+7 hours') BETWEEN ? AND ?`;
  const sales=await db.prepare(`SELECT COUNT(*) AS total_orders, COALESCE(SUM(o.amount_total_cents),0) AS net_sales,
    COALESCE(SUM(o.discount_cents),0) AS header_discount,COALESCE(SUM((CASE WHEN o.returned_amount_cents>0 THEN o.returned_amount_cents ELSE o.refunded_cents END)),0) AS refunds,
    COALESCE(SUM((SELECT SUM(ol.discount_cents) FROM order_lines ol WHERE ol.order_id=o.id)),0) AS line_discount,
    SUM(CASE WHEN EXISTS(SELECT 1 FROM customer_return_items ri JOIN customer_returns r ON r.id=ri.return_id WHERE r.order_id=o.id AND ri.inspection_status='PENDING') OR NOT EXISTS(SELECT 1 FROM order_lines ol WHERE ol.order_id=o.id) THEN 1 ELSE 0 END) AS missing_lines
    FROM orders o WHERE ${eligible}`).bind(start,end).first<any>();
  const cost=await db.prepare(`SELECT COALESCE(SUM(ol.quantity*ol.unit_cost_cents-COALESCE((SELECT SUM(ri.restocked_cost_cents) FROM customer_return_items ri WHERE ri.order_line_id=ol.id),0)),0) AS cogs,
    SUM(CASE WHEN ol.unit_cost_cents IS NULL THEN 1 ELSE 0 END) AS missing_costs
    FROM order_lines ol JOIN orders o ON o.id=ol.order_id WHERE ${eligible}`).bind(start,end).first<any>();
  const expense=await db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN category='SHIPPING_FEE' THEN amount_cents ELSE 0 END),0) AS shipping,
    COALESCE(SUM(CASE WHEN category='EXPENSE' THEN amount_cents ELSE 0 END),0) AS operating
    FROM cash_transactions WHERE flow_type='OUT' AND COALESCE(status,'ACTIVE')!='CANCELLED'
    AND category IN ('EXPENSE','SHIPPING_FEE') AND COALESCE(LOWER(reference_type),'')!='purchase_receipt_other_fee'
    AND DATE(created_at,'+7 hours') BETWEEN ? AND ?`).bind(start,end).first<any>();
  const discount=sales.header_discount+sales.line_discount,refunds=sales.refunds;
  const grossSales=sales.net_sales+discount,netRevenue=sales.net_sales-refunds,cogs=cost.cogs;
  const shippingCost=expense.shipping,totalExpenses=expense.shipping+expense.operating;
  return {totalOrders:sales.total_orders,operationalExpenses:expense.operating,grossSales,discount,refunds,deductions:discount+refunds,netRevenue,cogs,grossProfit:netRevenue-cogs,shippingCost,totalExpenses,netProfit:netRevenue-cogs-totalExpenses,incomplete:(sales.missing_lines??0)+(cost.missing_costs??0)};
}

/** Aggregate each order once, even if multiple shipment records exist. */
export async function getPosSalesGroups(db: D1Database, start: string, end: string, seller = '', carrier = '') {
  const where = `o.order_status!='CANCELLED' AND (o.order_type='ORDER' OR (o.order_type='PREORDER' AND o.order_status='COMPLETED'))
    AND DATE(o.created_at,'+7 hours') BETWEEN ? AND ?
    AND (?='' OR COALESCE(o.created_by,'Admin Kgame')=?)
    AND (?='' OR EXISTS(SELECT 1 FROM shipments s WHERE s.order_id=o.id AND s.carrier=?))`;
  const fields = `COUNT(*) AS order_count,
    SUM(o.amount_total_cents+COALESCE(o.discount_cents,0)+COALESCE((SELECT SUM(l.discount_cents) FROM order_lines l WHERE l.order_id=o.id),0)) AS gross_revenue,
    SUM(COALESCE(o.discount_cents,0)+(CASE WHEN o.returned_amount_cents>0 THEN o.returned_amount_cents ELSE o.refunded_cents END)+COALESCE((SELECT SUM(l.discount_cents) FROM order_lines l WHERE l.order_id=o.id),0)) AS total_discount,
    SUM(o.amount_total_cents-(CASE WHEN o.returned_amount_cents>0 THEN o.returned_amount_cents ELSE o.refunded_cents END)) AS net_revenue,
    SUM(COALESCE((SELECT SUM(l.quantity*l.unit_cost_cents-COALESCE((SELECT SUM(ri.restocked_cost_cents) FROM customer_return_items ri WHERE ri.order_line_id=l.id),0)) FROM order_lines l WHERE l.order_id=o.id),0)) AS cogs,
    SUM(CASE WHEN EXISTS(SELECT 1 FROM customer_return_items ri JOIN customer_returns r ON r.id=ri.return_id WHERE r.order_id=o.id AND ri.inspection_status='PENDING') OR NOT EXISTS(SELECT 1 FROM order_lines l WHERE l.order_id=o.id) OR EXISTS(SELECT 1 FROM order_lines l WHERE l.order_id=o.id AND l.unit_cost_cents IS NULL) THEN 1 ELSE 0 END) AS incomplete`;
  const args=[start,end,seller,seller,carrier,carrier];
  const daily=await db.prepare(`SELECT DATE(o.created_at,'+7 hours') AS day,${fields} FROM orders o WHERE ${where} GROUP BY day ORDER BY day`).bind(...args).all<any>();
  const staff=await db.prepare(`SELECT COALESCE(o.created_by,'Admin Kgame') AS staff_name,${fields} FROM orders o WHERE ${where} GROUP BY staff_name ORDER BY net_revenue DESC`).bind(...args).all<any>();
  return {daily:daily.results??[],staff:staff.results??[]};
}
