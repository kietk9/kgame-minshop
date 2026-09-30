export interface PosAuthority { price:boolean; discount:boolean; debt:boolean; credit:boolean }
import type { D1Database } from '@cloudflare/workers-types';
import { generatePublicId } from '../ids/publicId.ts';
import { AtomicBatch, commitOperation, executeOperation, fingerprint, integer, object, requestKey } from './atomic.ts';
import { parseItem, parsePayment, parsePosInput, type PosPayment } from './posInput.ts';
import { prepareStock, writeStock } from './posStock.ts';
import { writeCustomerCredit } from './credit.ts';

interface Customer { id: number; name: string; phone: string | null; address: string | null }
interface Order { id: number; order_code: string; order_type: string; order_status: string; status: string;
  amount_total_cents: number; paid_amount_cents: number; customer_id: number | null; returned_amount_cents:number; returned_credit_cents:number; refunded_cents:number }
interface CreateResult { id: number; order_code: string }
interface PaymentResult { success: boolean; new_paid: number; payment_status: string; pt_code: string }
interface FulfillResult { success: boolean; order_id: number; order_code: string; paid_amount_cents: number; payment_status: string }

export function paymentStatus(total: number, paid: number) { return paid === total ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID'; }

function addReceipt(batch: AtomicBatch, key: string, hash: string, kind: string, ref: string, values: unknown[], resultSql: string, resultValues: unknown[]) {
  batch.add(`INSERT INTO kgame_operations (operation_key, kind, payload_hash, order_id, result_json)
    VALUES (?, ?, ?, ${ref}, ${resultSql})`, key, kind, hash, ...values, ...resultValues);
}

async function writePayment(batch: AtomicBatch, key: string, ref: string, values: unknown[], payment: PosPayment, paymentType: string, recipient: string, customerId: number | null) {
  if (!payment.amount_paid_cents) return;
  if (payment.payment_method === 'CREDIT') {
    if (!customerId) throw new Error('Thanh toán bằng số dư phải chọn khách hàng.');
    await writeCustomerCredit(batch, customerId, -payment.amount_paid_cents, 'ORDER_PAYMENT', ref, values, key,
      'Dùng số dư khách thanh toán đơn hàng', payment.created_by);
  }
  batch.add(`INSERT INTO payments (order_id, amount_cents, payment_method, payment_type, reference_code, status, note, created_by, operation_key)
    VALUES (${ref}, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?)`, ...values, payment.amount_paid_cents, payment.payment_method,
  paymentType, payment.reference_code || null, payment.note || null, payment.created_by, key);
  if (payment.payment_method === 'CREDIT') return; // No new cash movement.
  batch.add(`INSERT INTO cash_transactions (transaction_code, flow_type, account_type, category, amount_cents, reference_type,
    reference_id, bank_name, recipient_name, note, created_by, operation_key)
    VALUES ((SELECT 'PT' || printf('%04d', COALESCE(MAX(CAST(substr(transaction_code, 3) AS INTEGER)), 0) + 1)
      FROM cash_transactions WHERE transaction_code LIKE 'PT%'), 'IN', ?, 'ORDER_PAYMENT', ?, 'ORDER', ${ref}, ?, ?, ?, ?, ?)`,
  payment.payment_method === 'CASH' ? 'CASH' : 'BANK', payment.amount_paid_cents, ...values, payment.bank_name || null, recipient,
  payment.note || 'Thu tiền đơn hàng', payment.created_by, key);
}

async function resolveCustomer(batch: AtomicBatch, input: ReturnType<typeof parsePosInput>): Promise<Customer | null> {
  let customer: Customer | null = null;
  if (input.customer_id) {
    customer = await batch.db.prepare('SELECT id, name, phone, address FROM partners WHERE id = ? AND is_customer = 1')
      .bind(input.customer_id).first<Customer>();
    if (!customer) throw new Error('Khách hàng không tồn tại hoặc không được dùng làm khách hàng.');
  } else if (input.customer_phone) {
    const matches = await batch.db.prepare('SELECT id, name, phone, address FROM partners WHERE phone = ? AND is_customer = 1 LIMIT 2')
      .bind(input.customer_phone).all<Customer>();
    if (matches.results.length > 1) throw new Error('Có nhiều khách trùng số điện thoại. Vui lòng chọn đúng khách hàng.');
    customer = matches.results[0] ?? null;
    if (!customer) {
      const next = await batch.db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM partners').first<{ id: number }>();
      customer = { id: next!.id, name: input.customer_name || 'Khách hàng', phone: input.customer_phone, address: input.customer_address };
      await batch.assert('NOT EXISTS(SELECT 1 FROM partners WHERE phone = ? AND is_customer = 1)', [customer.phone], 'Khách hàng vừa được tạo. Vui lòng chọn lại.');
      batch.add(`INSERT INTO partners (id, partner_code, name, phone, address, is_customer, is_supplier)
        VALUES (?, (SELECT 'KH' || printf('%04d', COALESCE(MAX(CAST(substr(partner_code, 3) AS INTEGER)), 0) + 1)
          FROM partners WHERE partner_code LIKE 'KH%'), ?, ?, ?, 1, 0)`, customer.id, customer.name, customer.phone, customer.address);
      return customer;
    }
  }
  if (customer) {
    await batch.assert('EXISTS(SELECT 1 FROM partners WHERE id = ? AND is_customer = 1)', [customer.id], 'Khách hàng vừa thay đổi.');
  }
  if (!customer && input.payment.amount_paid_cents < input.amount_total_cents) throw new Error('Đơn chưa trả đủ tiền phải có khách hàng xác định.');
  return customer;
}

export async function createPosOrder(db: D1Database, raw: unknown, authority?: PosAuthority): Promise<CreateResult> {
  const input = parsePosInput(raw);
  if(authority){
    if(!authority.discount && (input.discount_cents || input.items.some(i=>i.discount_cents))) throw new Error('Bạn chưa được cấp quyền giảm giá.');
    if(!authority.credit && input.payment.payment_method==='CREDIT' && input.payment.amount_paid_cents) throw new Error('Bạn chưa được cấp quyền dùng số dư khách.');
    if(!authority.debt && input.order_type!=='PREORDER' && input.payment.amount_paid_cents<input.amount_total_cents) throw new Error('Bạn chưa được cấp quyền xuất bán còn nợ.');
  }
  const key = `create:${input.request_id}`, hash = await fingerprint(input);
  return executeOperation<CreateResult>(db, key, hash, async () => {
  const batch = new AtomicBatch(db);
  const customer = await resolveCustomer(batch, input);
  const preorder = input.order_type === 'PREORDER';
  const lines = await prepareStock(batch, input.items, { preorder, requireCatalogPrice: authority ? !authority.price : false });
  if (input.shipment?.delivery_partner_id) {
    await batch.assert('EXISTS(SELECT 1 FROM delivery_partners WHERE id = ?)', [input.shipment.delivery_partner_id], 'Đối tác giao hàng không tồn tại.');
  }
  const publicId = generatePublicId('order'), ref = '(SELECT id FROM orders WHERE public_id = ?)';
  const paid = input.payment.amount_paid_cents, total = input.amount_total_cents;
  const status = preorder ? 'PENDING' : (!input.shipment || input.shipment.carrier === 'PICKUP') ? 'COMPLETED' : 'PROCESSING';
  batch.add(`INSERT INTO orders (public_id, order_code, customer_id, order_type, order_status, payment_status,
    amount_total_cents, paid_amount_cents, cod_amount_cents, discount_cents, shipping_cents, currency, status, note, created_by, updated_at)
    VALUES (?, (SELECT 'ĐH' || printf('%04d', COALESCE(MAX(CAST(substr(order_code, 3) AS INTEGER)), 0) + 1)
      FROM orders WHERE order_code LIKE 'ĐH%'), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'vnd', ?, ?, ?, datetime('now'))`,
  publicId, customer?.id ?? null, input.order_type, status, paymentStatus(total, paid), total, paid, total - paid,
  input.discount_cents, input.shipping_cents, preorder ? 'pending' : status === 'COMPLETED' ? 'completed' : 'processing', input.note || null, input.created_by);
  for (const line of lines) {
    batch.add(`INSERT INTO order_lines (order_id, product_id, product_type_id, product_name_snapshot, type_name_snapshot,
      condition, quantity, unit_price_cents, discount_cents, line_total_cents, unit_cost_cents)
      VALUES (${ref}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, publicId, line.product_id, line.product_type_id, line.product_name, line.type_name,
    line.condition, line.quantity, line.unit_price_cents, line.discount_cents,
    line.quantity * line.unit_price_cents - line.discount_cents, preorder ? 0 : line.unit_cost_cents);
    if (line.product_unit_id) {
      // This statement follows its line insert inside the batch, before the next
      // line is inserted. The private order identity prevents cross-order links.
      batch.add(`INSERT INTO order_units (order_line_id, product_unit_id)
        VALUES ((SELECT id FROM order_lines WHERE order_id = ${ref} ORDER BY id DESC LIMIT 1), ?)`, publicId, line.product_unit_id);
    }
    writeStock(batch, line, ref, [publicId], preorder);
  }
  await writePayment(batch, key, ref, [publicId], { ...input.payment, created_by: input.created_by },
    preorder ? 'DEPOSIT' : paid === total ? 'FULL' : 'DEPOSIT', customer?.name || 'Khách lẻ', customer?.id ?? null);
  const shipment = input.shipment;
  if (shipment) {
    batch.add(`INSERT INTO shipments (order_id, delivery_partner_id, carrier, tracking_code, cod_amount_cents, bus_station, bus_plate,
      receiver_name, receiver_phone, receiver_address, shipping_fee_cents, shipping_payer, weight_grams, dimensions, status)
      VALUES (${ref}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, publicId, shipment.delivery_partner_id, shipment.carrier,
    shipment.tracking_code || null, total - paid, shipment.bus_station || null, shipment.bus_plate || null,
    shipment.receiver_name || customer?.name || input.customer_name, shipment.receiver_phone || customer?.phone || input.customer_phone,
    shipment.receiver_address || customer?.address || input.customer_address, shipment.shipping_fee_cents, shipment.shipping_payer,
    shipment.weight_grams, shipment.dimensions || null, shipment.carrier === 'PICKUP' && !preorder ? 'DELIVERED' : 'PENDING');
  }
  addReceipt(batch, key, hash, 'CREATE_ORDER', ref, [publicId],
    `(SELECT json_object('id', id, 'order_code', order_code) FROM orders WHERE public_id = ?)`, [publicId]);
  return commitOperation<CreateResult>(batch, key, hash);
  });
}

async function readOrder(batch: AtomicBatch, id: number) {
  integer(id, 'Đơn hàng', 1);
  const order = await batch.db.prepare('SELECT * FROM orders WHERE id = ? AND order_code IS NOT NULL').bind(id).first<Order>();
  if (!order) throw new Error('Không tìm thấy đơn hàng POS.');
  integer(order.amount_total_cents, 'Tổng tiền đơn');
  integer(order.paid_amount_cents, 'Tiền đã thu');
  if (order.paid_amount_cents > order.amount_total_cents) throw new Error('Đơn đang có tiền đã thu vượt tổng. Cần rà soát trước khi xử lý.');
  if (order.order_status === 'CANCELLED' || order.status === 'cancelled') throw new Error('Đơn đã hủy không được thu thêm hoặc xuất bán.');
  await batch.assert(`EXISTS(SELECT 1 FROM orders WHERE id = ? AND order_code IS NOT NULL
    AND order_type = ? AND order_status = ? AND status = ? AND amount_total_cents = ? AND paid_amount_cents = ? AND customer_id IS ? AND returned_amount_cents=? AND returned_credit_cents=? AND refunded_cents=?)`,
  [id, order.order_type, order.order_status, order.status, order.amount_total_cents, order.paid_amount_cents, order.customer_id,order.returned_amount_cents,order.returned_credit_cents,order.refunded_cents], 'Đơn hàng vừa thay đổi.');
  return order;
}

async function paymentCustomer(batch: AtomicBatch, order: Order, remaining: number) {
  if (!order.customer_id) {
    if (remaining) throw new Error('Đơn còn tiền chưa trả phải có khách hàng xác định.');
    return 'Khách lẻ';
  }
  const customer = await batch.db.prepare('SELECT name FROM partners WHERE id = ? AND is_customer = 1').bind(order.customer_id).first<{ name: string }>();
  if (!customer) throw new Error('Khách hàng của đơn không còn hợp lệ.');
  await batch.assert('EXISTS(SELECT 1 FROM partners WHERE id = ? AND is_customer = 1)', [order.customer_id], 'Khách hàng vừa thay đổi.');
  return customer.name;
}

export async function planPosOrderPayment(batch: AtomicBatch, id: number, payment: PosPayment, key: string, expectedCustomerId?: number) {
  const order = await readOrder(batch, id);
  if (expectedCustomerId !== undefined) {
    if (order.customer_id !== expectedCustomerId) throw new Error('Đơn không thuộc khách hàng đã chọn.');
    await batch.assert('EXISTS(SELECT 1 FROM orders WHERE id = ? AND customer_id = ?)', [id, expectedCustomerId], 'Khách của đơn vừa thay đổi.');
  }
  await batch.assert("(SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE order_id = ? AND status = 'CONFIRMED') = ?", [id, order.paid_amount_cents], 'Lịch sử thanh toán đang lệch tiền đã thu. Cần rà soát trước khi thu thêm.');
  const collectible=integer(order.amount_total_cents-order.returned_amount_cents+order.refunded_cents+order.returned_credit_cents,'Nghĩa vụ còn lại');
  const paid = integer(order.paid_amount_cents + payment.amount_paid_cents, 'Tổng tiền đã thu');
  if (paid > collectible) throw new Error('Tiền thu thêm vượt số tiền còn phải thu.');
  const status = paymentStatus(collectible, paid);
  const recipient = await paymentCustomer(batch, order, collectible - paid);
  batch.add("UPDATE orders SET paid_amount_cents = ?, cod_amount_cents = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ?",
    paid, collectible - paid, status, id);
  batch.add('UPDATE shipments SET cod_amount_cents = ?, updated_at = datetime(\'now\') WHERE order_id = ? AND status NOT IN (\'RETURNED\', \'FAILED\')', collectible - paid, id);
  await writePayment(batch, key, '?', [id], payment, status === 'PAID' ? 'REMAINDER' : 'DEPOSIT', recipient, order.customer_id);
  return { paid, status };
}

export async function addPosOrderPayment(db: D1Database, raw: unknown, authority?: PosAuthority): Promise<PaymentResult> {
  const input = object(raw), id = integer(input.order_id, 'Đơn hàng', 1), payment = parsePayment(input);
  if(authority && !authority.credit && payment.payment_method==='CREDIT') throw new Error('Bạn chưa được cấp quyền dùng số dư khách.');
  if (!payment.amount_paid_cents) throw new Error('Tiền thu thêm phải lớn hơn không.');
  const key = `payment:${requestKey(input.request_id)}`, hash = await fingerprint({ id, payment });
  return executeOperation<PaymentResult>(db, key, hash, async () => {
  const batch = new AtomicBatch(db);
  const { paid, status } = await planPosOrderPayment(batch, id, payment, key);
  addReceipt(batch, key, hash, 'ADD_PAYMENT', '?', [id],
    `json_object('success', json('true'), 'new_paid', ?, 'payment_status', ?,
      'pt_code', COALESCE((SELECT transaction_code FROM cash_transactions WHERE operation_key = ?),
        (SELECT entry_code FROM customer_credit_entries WHERE operation_key = ?)))`, [paid, status, key, key]);
  return commitOperation<PaymentResult>(batch, key, hash);
  });
}

export async function fulfillPreorder(db: D1Database, orderId: number, rawPayment?: unknown, rawRequestId?: unknown, rawItems?: unknown, authority?: PosAuthority): Promise<FulfillResult> {
  const id = integer(orderId, 'Đơn hàng', 1), payment = parsePayment(rawPayment);
  if(authority && !authority.credit && payment.payment_method==='CREDIT' && payment.amount_paid_cents) throw new Error('Bạn chưa được cấp quyền dùng số dư khách.');
  const key = `fulfill:${requestKey(rawRequestId)}`, hash = await fingerprint({ id, payment, items: rawItems ?? null });
  return executeOperation<FulfillResult>(db, key, hash, async () => {
  const batch = new AtomicBatch(db), order = await readOrder(batch, id);
  if (order.order_type !== 'PREORDER' || order.order_status === 'COMPLETED' || order.status === 'completed') throw new Error('Chỉ được xuất một lần cho đơn đặt trước chưa hủy.');
  const paid = integer(order.paid_amount_cents + payment.amount_paid_cents, 'Tổng tiền đã thu');
  if(authority && !authority.debt && paid<order.amount_total_cents) throw new Error('Bạn chưa được cấp quyền xuất bán còn nợ.');
  if (paid > order.amount_total_cents) throw new Error('Tiền thanh toán vượt số tiền còn phải thu.');
  const rows = await db.prepare('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id').bind(id).all<Record<string, unknown>>();
  if (!rows.results.length) throw new Error('Đơn đặt trước không có hàng hóa.');
  const items = [];
  const assignments = new Map<number, ReturnType<typeof parseItem>>();
  if (rawItems !== undefined) {
    if (!Array.isArray(rawItems) || rawItems.length !== rows.results.length) throw new Error('Hàng trên đơn đặt trước đã thay đổi. Không được thêm hoặc bớt hàng khi xuất bán.');
    for (const raw of rawItems) {
      const value = object(raw), lineId = integer(value.order_line_id, 'Dòng đặt trước', 1);
      if (assignments.has(lineId)) throw new Error('Dòng đặt trước bị lặp.');
      assignments.set(lineId, parseItem(value));
    }
  }
  for (const line of rows.results) {
    await batch.assert(`EXISTS(SELECT 1 FROM order_lines WHERE id = ? AND order_id = ? AND product_id = ? AND product_type_id IS ?
      AND condition = ? AND quantity = ? AND unit_price_cents = ? AND discount_cents = ?)`,
      [line.id, id, line.product_id, line.product_type_id, line.condition, line.quantity, line.unit_price_cents, line.discount_cents], 'Dòng đặt trước vừa thay đổi.');
    const units = await db.prepare('SELECT product_unit_id FROM order_units WHERE order_line_id = ?').bind(line.id).all<{ product_unit_id: number }>();
    if (units.results.length > 1) throw new Error('Dòng đơn cũ có nhiều serial. Cần tách từng serial trước khi xuất bán.');
    const previousId = units.results[0]?.product_unit_id ?? null;
    await batch.assert('(SELECT COUNT(*) FROM order_units WHERE order_line_id = ?) = ? AND (? IS NULL OR EXISTS(SELECT 1 FROM order_units WHERE order_line_id = ? AND product_unit_id = ?))',
      [line.id, units.results.length, previousId, line.id, previousId], 'Serial của dòng đặt trước vừa thay đổi.');
    const item = assignments.get(Number(line.id)) ?? parseItem({ ...line, product_unit_id: previousId });
    if (rawItems !== undefined && !assignments.has(Number(line.id))) throw new Error('Dòng hàng không thuộc đơn đặt trước.');
    for (const field of ['product_id','product_type_id','condition','quantity','unit_price_cents','discount_cents'] as const) {
      if (item[field] !== line[field]) throw new Error('Không được đổi hàng, số lượng hoặc giá khi xuất đơn đã đặt. Cần sửa đơn trước.');
    }
    if (item.product_unit_id !== previousId) {
      if (previousId) {
        await batch.assert("EXISTS(SELECT 1 FROM product_units WHERE id = ? AND owner_type = 'KGAME' AND availability IN ('RESERVED','IN_STOCK') AND NOT EXISTS(SELECT 1 FROM order_units ou JOIN order_lines ol ON ol.id = ou.order_line_id JOIN orders o ON o.id = ol.order_id WHERE ou.product_unit_id = product_units.id AND o.id != ? AND o.order_type = 'PREORDER' AND o.order_status NOT IN ('CANCELLED','COMPLETED')))",
          [previousId, id], 'Serial đặt trước cũ đã được xử lý ở chứng từ khác.');
        batch.add("UPDATE product_units SET availability = 'IN_STOCK', updated_at = datetime('now') WHERE id = ? AND availability = 'RESERVED'", previousId);
      }
      batch.add('DELETE FROM order_units WHERE order_line_id = ?', line.id);
      if (item.product_unit_id) batch.add('INSERT INTO order_units (order_line_id, product_unit_id) VALUES (?, ?)', line.id, item.product_unit_id);
    }
    items.push(item);
  }
  const lines = await prepareStock(batch, items, { fulfillOrderId: id, allowUnlinkedUnits: rawItems !== undefined });
  const recipient = await paymentCustomer(batch, order, order.amount_total_cents - paid);
  lines.forEach((line, index) => {
    batch.add('UPDATE order_lines SET unit_cost_cents = ? WHERE id = ? AND order_id = ?', line.unit_cost_cents, rows.results[index].id, id);
    writeStock(batch, line, '?', [id]);
  });
  const status = paymentStatus(order.amount_total_cents, paid);
  await writePayment(batch, key, '?', [id], payment, 'REMAINDER', recipient, order.customer_id);
  batch.add(`UPDATE orders SET order_type = 'ORDER', order_status = 'COMPLETED', status = 'completed', paid_amount_cents = ?,
    cod_amount_cents = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ?`, paid, order.amount_total_cents - paid, status, id);
  batch.add("UPDATE shipments SET cod_amount_cents = ?, status = CASE WHEN carrier = 'PICKUP' THEN 'DELIVERED' ELSE status END, updated_at = datetime('now') WHERE order_id = ?", order.amount_total_cents - paid, id);
  addReceipt(batch, key, hash, 'FULFILL_PREORDER', '?', [id],
    `json_object('success', json('true'), 'order_id', ?, 'order_code', ?, 'paid_amount_cents', ?, 'payment_status', ?)`, [id, order.order_code, paid, status]);
  return commitOperation<FulfillResult>(batch, key, hash);
  });
}
