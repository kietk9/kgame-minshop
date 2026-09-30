export const pendingKinds = ['CUSTOMER_REFUND', 'SUPPLIER_REFUND', 'INSPECTION', 'DEFECTIVE'] as const;
export type PendingKind = typeof pendingKinds[number];
export interface PendingAction {
  kind: PendingKind; id: number; created_at: string; partner_id: number;
  partner_code: string | null; partner_name: string | null; document_code: string;
  detail: string; amount: number; quantity: number; href: string | null;
}
export interface PendingSummary {
  count: number; customer_refund: number; supplier_refund: number;
  inspection_quantity: number; defective_quantity: number;
}
// Keep obligations without a valid source visible for reconciliation; never guess a destination.
const queue = `WITH tasks AS (
 SELECT CASE WHEN f.flow_type='OUT' THEN 'CUSTOMER_REFUND' ELSE 'SUPPLIER_REFUND' END kind,
 f.id,f.created_at,f.partner_id,p.partner_code,p.name partner_name,
 COALESCE(o.order_code,pr.receipt_code,f.source_type || ' #' || f.source_id) document_code,
 f.reason detail,f.amount_cents-f.settled_cents amount,0 quantity,
 CASE WHEN o.id IS NOT NULL THEN '/admin/orders/' || o.id || '#refunds'
 WHEN pr.id IS NOT NULL THEN '/admin/purchases/' || pr.id || '#refunds' END href
 FROM kgame_refund_obligations f LEFT JOIN partners p ON p.id=f.partner_id
 LEFT JOIN orders o ON f.source_type='ORDER' AND f.flow_type='OUT' AND o.id=f.source_id AND o.customer_id=f.partner_id
 LEFT JOIN purchase_receipts pr ON f.source_type='PURCHASE' AND f.flow_type='IN' AND pr.id=f.source_id AND pr.supplier_id=f.partner_id
 WHERE f.amount_cents>f.settled_cents
 UNION ALL
 SELECT k.kind,ri.id,r.created_at,r.customer_id,p.partner_code,p.name,
 r.return_code,COALESCE(l.product_name_snapshot,'Dòng hàng #' || ri.order_line_id),0,
 CASE WHEN k.kind='INSPECTION' THEN ri.quantity-ri.restocked_quantity-ri.rejected_quantity ELSE ri.rejected_quantity-ri.disposed_quantity END,
 CASE WHEN o.id IS NOT NULL AND l.order_id=o.id THEN '/admin/orders/' || o.id || '#return-inspections' END
 FROM customer_return_items ri JOIN customer_returns r ON r.id=ri.return_id
 CROSS JOIN (SELECT 'INSPECTION' kind UNION ALL SELECT 'DEFECTIVE') k
 LEFT JOIN partners p ON p.id=r.customer_id LEFT JOIN order_lines l ON l.id=ri.order_line_id
 LEFT JOIN orders o ON o.id=r.order_id AND o.customer_id=r.customer_id
 WHERE (k.kind='INSPECTION' AND ri.quantity>ri.restocked_quantity+ri.rejected_quantity)
 OR (k.kind='DEFECTIVE' AND ri.rejected_quantity>ri.disposed_quantity)
), filtered AS (SELECT * FROM tasks WHERE (?='' OR kind=?) AND
 (?='' OR instr(lower(COALESCE(partner_code,'') || ' ' || COALESCE(partner_name,'') || ' ' || document_code || ' ' || detail),lower(?))>0))`;
export async function getPendingActions(db: D1Database, input: {kind?: string; search?: string; page?: number} = {}) {
  const kind = pendingKinds.includes(input.kind as PendingKind) ? input.kind! : '';
  const search = (input.search || '').trim().slice(0,200);
  const page = Number.isSafeInteger(input.page) && input.page! > 0 ? Math.min(input.page!,1000000) : 1;
  const params = [kind,kind,search,search];
  const results = await db.batch([
    db.prepare(`${queue} SELECT COUNT(*) count,
    COALESCE(SUM(CASE WHEN kind='CUSTOMER_REFUND' THEN amount ELSE 0 END),0) customer_refund,
    COALESCE(SUM(CASE WHEN kind='SUPPLIER_REFUND' THEN amount ELSE 0 END),0) supplier_refund,
    COALESCE(SUM(CASE WHEN kind='INSPECTION' THEN quantity ELSE 0 END),0) inspection_quantity,
    COALESCE(SUM(CASE WHEN kind='DEFECTIVE' THEN quantity ELSE 0 END),0) defective_quantity FROM filtered`).bind(...params),
    db.prepare(`${queue} SELECT * FROM filtered ORDER BY created_at,kind,id LIMIT 50 OFFSET ?`).bind(...params,(page-1)*50),
  ]);
  return {items: results[1].results as unknown as PendingAction[], summary: results[0].results[0] as unknown as PendingSummary, kind, search, page, pageSize:50};
}
