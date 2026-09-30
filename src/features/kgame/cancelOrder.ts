import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, integer } from './atomic.ts';
import { writeCustomerCredit } from './credit.ts';

interface CancelOrderRow { id: number; order_code: string; order_status: string; status: string; order_type: string;
  customer_id: number | null; amount_total_cents: number; paid_amount_cents: number }
interface Movement { product_id: number; product_type_id: number | null; product_unit_id: number | null; condition: string; net: number }

export async function cancelOrder(db: D1Database, orderId: number, reason = 'Hủy đơn hàng',
  options: { customer_id?: number; return_confirmed?: boolean; created_by?: string; refund_mode?: 'PENDING' | 'CREDIT'; require_unfulfilled?: boolean } = {}) {
  integer(orderId, 'Đơn hàng', 1);
  const order = await db.prepare('SELECT * FROM orders WHERE id = ? AND order_code IS NOT NULL').bind(orderId).first<CancelOrderRow>();
  if (!order) throw new Error('Không tìm thấy đơn hàng POS.');
  if (order.order_status === 'CANCELLED') return { success: true, message: 'Đơn đã hủy; không ghi hoàn kho hoặc số dư lần nữa.' };
  try {
  await db.prepare('SELECT returned_amount_cents FROM orders WHERE id=?').bind(orderId).first<{returned_amount_cents:number}>().then(row=>{if(row?.returned_amount_cents)throw new Error('Đơn đã trả hàng không được hủy; tiếp tục xử lý từ phiếu trả.');});
  const paid = integer(order.paid_amount_cents, 'Tiền đã thu');
  integer(order.amount_total_cents, 'Tổng tiền đơn');
  if (paid > order.amount_total_cents) throw new Error('Đơn có tiền thu vượt tổng; cần rà soát trước khi hủy.');
  const customerId = order.customer_id ?? options.customer_id ?? null;
  if (options.customer_id && order.customer_id && options.customer_id !== order.customer_id) throw new Error('Số dư phải chuyển cho đúng khách của đơn.');
  if (paid && !customerId) throw new Error('Vui lòng chọn khách nhận số dư trước khi hủy đơn khách lẻ đã thu tiền.');
  const movements = await db.prepare(`SELECT product_id, product_type_id, product_unit_id, condition, SUM(quantity) AS net
    FROM inventory_transactions WHERE UPPER(reference_type) = 'ORDER' AND reference_id = ?
    AND transaction_type IN ('SALE', 'CANCEL', 'SALE_REVERSE', 'CUSTOMER_RETURN')
    GROUP BY product_id, product_type_id, product_unit_id, condition HAVING SUM(quantity) < 0`)
    .bind(orderId).all<Movement>();
  const shipments = await db.prepare('SELECT status FROM shipments WHERE order_id = ?').bind(orderId).all<{ status: string }>();
  const handedOut = order.order_status === 'COMPLETED' || order.order_status === 'DELIVERING' || shipments.results.some(s => ['SHIPPED','DELIVERED'].includes(s.status));
  if (options.require_unfulfilled && handedOut) throw new Error('Hàng đã giao hoặc đang giao: cần lập phiếu trả hàng, không hủy đơn để tự hoàn kho.');
  if (movements.results.length && handedOut && options.return_confirmed !== true) throw new Error('Hàng đã giao hoặc đang giao. Cần xác nhận đã nhận lại hàng trước khi hoàn kho.');
  const batch = new AtomicBatch(db);
  await batch.assert('NOT EXISTS(SELECT 1 FROM customer_returns WHERE order_id=?)',[orderId],'Đơn đã có phiếu trả hàng, không thể hủy.');
  if(options.require_unfulfilled)await batch.assert("NOT EXISTS(SELECT 1 FROM shipments WHERE order_id=? AND status IN ('SHIPPED','DELIVERED'))",[orderId],'Hàng vừa chuyển giao; cần lập trả hàng.');
  await batch.assert(`EXISTS(SELECT 1 FROM orders WHERE id = ? AND order_status = ? AND status = ? AND order_type = ?
    AND paid_amount_cents = ? AND amount_total_cents = ? AND customer_id IS ?)`,
  [orderId, order.order_status, order.status, order.order_type, paid, order.amount_total_cents, order.customer_id], 'Đơn vừa thay đổi.');
  const journal = await db.prepare("SELECT COUNT(*) AS n FROM inventory_transactions WHERE UPPER(reference_type) = 'ORDER' AND reference_id = ?")
    .bind(orderId).first<{ n: number }>();
  await batch.assert("(SELECT COUNT(*) FROM inventory_transactions WHERE UPPER(reference_type) = 'ORDER' AND reference_id = ?) = ?",
    [orderId, journal!.n], 'Thẻ kho của đơn vừa thay đổi.');
  let credited = 0;
  if (paid) {
    await batch.assert("(SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE order_id = ? AND status = 'CONFIRMED') = ?",
      [orderId, paid], 'Lịch sử thanh toán đang lệch tiền đã thu. Cần rà soát trước khi chuyển số dư.');
    const creditPaid = (await db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS n FROM payments WHERE order_id=? AND status='CONFIRMED' AND payment_method='CREDIT'").bind(orderId).first<{n:number}>())!.n;
    integer(creditPaid,'Tiền đã dùng số dư');
    if(creditPaid>paid)throw new Error('Lịch sử số dư không khớp.');
    await batch.assert("(SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE order_id=? AND status='CONFIRMED' AND payment_method='CREDIT')=?",[orderId,creditPaid],'Thanh toán số dư vừa thay đổi.');
    const pending = options.refund_mode === 'PENDING';
    if(pending){
      await batch.assert('EXISTS(SELECT 1 FROM partners WHERE id=? AND is_customer=1)',[customerId],'Khách nhận hoàn không hợp lệ.');
      if(creditPaid)await batch.assert("(SELECT -COALESCE(SUM(amount_cents),0) FROM customer_credit_entries WHERE partner_id=? AND reference_type='ORDER_PAYMENT' AND reference_id=?)=?",[customerId,orderId,creditPaid],'Lịch sử sử dụng số dư đang lệch.');
      await batch.assert("(SELECT COALESCE(SUM(CASE WHEN flow_type='IN' THEN amount_cents ELSE -amount_cents END),0) FROM cash_transactions WHERE UPPER(reference_type)='ORDER' AND reference_id=? AND category IN ('ORDER_PAYMENT','REFUND') AND COALESCE(status,'ACTIVE')!='CANCELLED')=?",[orderId,paid-creditPaid],'Sổ quỹ không khớp tiền thực thu của đơn.');
      await batch.assert('EXISTS(SELECT 1 FROM orders WHERE id=? AND refunded_cents=0)',[orderId],'Đơn đã có khoản hoàn; cần đối chiếu.');
      if(paid>creditPaid)batch.add("INSERT INTO kgame_refund_obligations(source_type,source_id,partner_id,flow_type,amount_cents,reason) VALUES('ORDER',?,?,'OUT',?,?)",orderId,customerId,paid-creditPaid,reason);
    }
    const credit = pending ? creditPaid : paid;
    credited = credit;
    if(credit)await writeCustomerCredit(batch, customerId!, credit, 'ORDER_CANCEL', '?', [orderId], `cancel:${orderId}`,
      `Hoàn số dư đơn ${order.order_code}: ${reason}`, options.created_by || 'Thu ngân');
  }
  for (const movement of movements.results) {
    const qty = integer(-movement.net, 'Số lượng hoàn kho', 1);
    if (!['NEW','QSD'].includes(movement.condition)) throw new Error('Tình trạng trong thẻ kho không hợp lệ.');
    if (movement.product_unit_id) {
      if (qty !== 1) throw new Error('Thẻ kho serial đang lệch; không thể tự hoàn.');
      await batch.assert(`EXISTS(SELECT 1 FROM product_units WHERE id = ? AND availability = 'SOLD' AND product_type_id IS ? AND condition = ?)
        AND (SELECT reference_id FROM inventory_transactions WHERE product_unit_id = ? AND transaction_type = 'SALE' ORDER BY id DESC LIMIT 1) = ?`,
      [movement.product_unit_id, movement.product_type_id, movement.condition, movement.product_unit_id, orderId], 'Serial đã được xử lý ở chứng từ khác; không thể tự hoàn kho.');
      batch.add("UPDATE product_units SET availability = 'IN_STOCK', owner_type = 'KGAME', owner_id = NULL, updated_at = datetime('now') WHERE id = ?", movement.product_unit_id);
    }
    const productCol = movement.condition === 'QSD' ? 'stock_used' : 'stock_new';
    const typeCol = movement.condition === 'QSD' ? 'cached_stock_used' : 'cached_stock_new';
    await batch.assert('EXISTS(SELECT 1 FROM products WHERE id = ?)', [movement.product_id], 'Hàng hóa không còn tồn tại.');
    batch.add(`UPDATE products SET ${productCol} = ${productCol} + ?, stock = stock + ? WHERE id = ?`, qty, qty, movement.product_id);
    if (movement.product_type_id) {
      await batch.assert('EXISTS(SELECT 1 FROM product_types WHERE id = ? AND product_id = ?)',
        [movement.product_type_id, movement.product_id], 'Phân loại trong thẻ kho không hợp lệ.');
      batch.add(`UPDATE product_types SET ${typeCol} = ${typeCol} + ?, updated_at = datetime('now') WHERE id = ?`, qty, movement.product_type_id);
    }
    batch.add(`INSERT INTO inventory_transactions (product_id, product_type_id, product_unit_id, condition, quantity,
      transaction_type, reference_type, reference_id, location_id, note, created_by)
      VALUES (?, ?, ?, ?, ?, 'SALE_REVERSE', 'ORDER', ?, 'MAIN', ?, ?)`, movement.product_id, movement.product_type_id,
    movement.product_unit_id, movement.condition, qty, orderId, `Hoàn lượng thực tế đã xuất của ${order.order_code}: ${reason}`, options.created_by || 'Thu ngân');
  }
  // Reserved preorders have no physical stock movement to reverse.
  batch.add(`UPDATE product_units SET availability = 'IN_STOCK', updated_at = datetime('now') WHERE availability = 'RESERVED'
    AND id IN (SELECT ou.product_unit_id FROM order_units ou JOIN order_lines ol ON ol.id = ou.order_line_id WHERE ol.order_id = ?)
    AND NOT EXISTS(SELECT 1 FROM order_units ou JOIN order_lines ol ON ol.id = ou.order_line_id JOIN orders o ON o.id = ol.order_id
      WHERE ou.product_unit_id = product_units.id AND o.id != ? AND o.order_type = 'PREORDER' AND o.order_status NOT IN ('CANCELLED','COMPLETED'))`, orderId, orderId);
  batch.add("UPDATE orders SET order_status = 'CANCELLED', status = 'cancelled', cod_amount_cents = 0, customer_id = ?, cancelled_at = datetime('now'), cancel_reason = ?, updated_at = datetime('now') WHERE id = ?",
    customerId, reason, orderId);
  batch.add("UPDATE shipments SET cod_amount_cents = 0, status = CASE WHEN status IN ('SHIPPED','DELIVERED') THEN 'RETURNED' ELSE 'CANCELLED' END, updated_at = datetime('now') WHERE order_id = ?", orderId);
  await batch.commit();
  return { success: true, message: `Đã hủy ${order.order_code}; hoàn lượng đã xuất${paid ? (options.refund_mode === 'PENDING' ? ' và ghi khoản cần hoàn' : ' và chuyển tiền thành số dư khách') : ''}.`, customer_credit_cents: credited };
  } catch (err) {
    const current = await db.prepare('SELECT order_status FROM orders WHERE id = ?').bind(orderId).first<{ order_status: string }>();
    if (current?.order_status === 'CANCELLED') return { success: true, message: 'Đơn đã được hủy bởi thao tác trước.' };
    throw err;
  }
}
