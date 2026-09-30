import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, integer } from './atomic.ts';
import { cancelOrder } from './cancelOrder.ts';

export function allowedOrderStatuses(type: string, current: string): string[] {
  if (current === 'CANCELLED') return [];
  if (type === 'PREORDER') return ['PENDING','PROCESSING'].filter(status => status !== current);
  if (current === 'COMPLETED') return [];
  if (current === 'DELIVERING') return ['COMPLETED'];
  if (current === 'PENDING') return ['PROCESSING','DELIVERING','COMPLETED'];
  if (current === 'PROCESSING') return ['DELIVERING','COMPLETED'];
  return [];
}

export async function updatePosOrderStatus(db: D1Database, orderId: number, newStatus: string,
  options: { customer_id?: number; return_confirmed?: boolean; created_by?: string; refund_mode?: 'PENDING' | 'CREDIT'; require_unfulfilled?: boolean } = {}) {
  integer(orderId, 'Đơn hàng', 1);
  if (newStatus === 'CANCELLED') return cancelOrder(db, orderId, 'Hủy đơn từ trang quản trị', options);
  const order = await db.prepare('SELECT order_type, order_status, status FROM orders WHERE id = ? AND order_code IS NOT NULL')
    .bind(orderId).first<{ order_type: string; order_status: string; status: string }>();
  if (!order) throw new Error('Không tìm thấy đơn POS.');
  if (newStatus === order.order_status) return { success: true };
  if (!allowedOrderStatuses(order.order_type, order.order_status).includes(newStatus)) {
    throw new Error(order.order_type === 'PREORDER'
      ? 'Đơn đặt trước phải dùng thao tác xuất bán để hoàn tất, không đổi trạng thái trực tiếp.'
      : 'Không được chuyển trạng thái này hoặc mở lại đơn đã kết thúc.');
  }
  const batch = new AtomicBatch(db);
  await batch.assert('EXISTS(SELECT 1 FROM orders WHERE id = ? AND order_type = ? AND order_status = ? AND status = ?)',
    [orderId, order.order_type, order.order_status, order.status], 'Trạng thái đơn vừa thay đổi.');
  batch.add("UPDATE orders SET order_status = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
    newStatus, newStatus === 'COMPLETED' ? 'completed' : newStatus === 'PENDING' ? 'pending' : 'processing', orderId);
  if (order.order_type !== 'PREORDER') {
    await batch.assert("EXISTS(SELECT 1 FROM inventory_transactions WHERE UPPER(reference_type) = 'ORDER' AND reference_id = ? AND transaction_type = 'SALE')",
      [orderId], 'Đơn chưa có chứng từ xuất kho. Cần rà soát trước khi đánh dấu đã giao.');
    batch.add(`UPDATE shipments SET status = ?, updated_at = datetime('now') WHERE order_id = ? AND status NOT IN ('RETURNED','CANCELLED')`,
      newStatus === 'COMPLETED' ? 'DELIVERED' : newStatus === 'DELIVERING' ? 'SHIPPED' : 'PENDING', orderId);
  }
  await batch.commit();
  return { success: true };
}
