import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, integer } from './atomic.ts';
import { prepareStock, writeStock } from './posStock.ts';

export async function addRepairReplacementItem(db: D1Database, ticketId: number, productId: number,
  productTypeId: number | null, quantity: number, unitCostCents: number, actorName: string) {
  integer(ticketId, 'Phiếu sửa chữa', 1);
  const qty = integer(quantity, 'Số lượng linh kiện', 1), cost = integer(unitCostCents, 'Giá vốn linh kiện');
  const additionalCost = integer(qty * cost, 'Chi phí linh kiện');
  const batch = new AtomicBatch(db);
  const ticket = await db.prepare('SELECT status, repair_cost_cents FROM repair_tickets WHERE id = ?')
    .bind(ticketId).first<{ status: string; repair_cost_cents: number }>();
  if (!ticket || ['COMPLETED','CANCELLED'].includes(ticket.status)) throw new Error('Phiếu sửa chữa không tồn tại hoặc đã kết thúc.');
  integer(ticket.repair_cost_cents + additionalCost, 'Tổng chi phí sửa chữa');
  await batch.assert('EXISTS(SELECT 1 FROM repair_tickets WHERE id = ? AND status = ? AND repair_cost_cents = ?)',
    [ticketId, ticket.status, ticket.repair_cost_cents], 'Phiếu sửa chữa vừa thay đổi.');
  const lines = await prepareStock(batch, [{ product_id: integer(productId, 'Linh kiện', 1),
    product_type_id: productTypeId == null ? null : integer(productTypeId, 'Phân loại', 1), product_unit_id: null,
    condition: 'NEW', quantity: qty, unit_price_cents: 0, discount_cents: 0 }]);
  const line = { ...lines[0], unit_cost_cents: cost };
  batch.add('INSERT INTO repair_items (repair_ticket_id, product_id, product_type_id, quantity, unit_cost_cents) VALUES (?, ?, ?, ?, ?)',
    ticketId, productId, line.product_type_id, qty, cost);
  writeStock(batch, line, '?', [ticketId], false,
    { type: 'REPAIR_USE', reference: 'repair_ticket', note: `Xuất linh kiện cho phiếu sửa ${ticketId}` });
  batch.add("UPDATE repair_tickets SET repair_cost_cents = repair_cost_cents + ?, updated_at = datetime('now') WHERE id = ?", additionalCost, ticketId);
  batch.add("INSERT INTO repair_events (repair_ticket_id, event_type, note, created_by) VALUES (?, 'REPLACEMENT_USED', ?, ?)",
    ticketId, `Thay thế linh kiện: ${line.product_name} (SL: ${qty})`, actorName);
  await batch.commit();
}
