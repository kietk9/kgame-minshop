import { integer, object, requestKey, text } from './atomic.ts';

export interface PosItem {
  product_id: number;
  product_type_id: number | null;
  product_unit_id: number | null;
  condition: 'NEW' | 'QSD';
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
}

export interface PosPayment {
  amount_paid_cents: number;
  payment_method: 'CASH' | 'BANK' | 'CARD' | 'CREDIT';
  bank_name: string;
  reference_code: string;
  note: string;
  created_by: string;
}

export function parsePayment(value: unknown): PosPayment {
  const p = value == null ? {} : object(value);
  const method = p.payment_method ?? 'CASH';
  if (method !== 'CASH' && method !== 'BANK' && method !== 'CARD' && method !== 'CREDIT') throw new Error('Phương thức thanh toán không hợp lệ.');
  return { amount_paid_cents: integer(p.amount_paid_cents ?? 0, 'Tiền thanh toán'),
    payment_method: method, bank_name: text(p.bank_name), reference_code: text(p.reference_code),
    note: text(p.note), created_by: text(p.created_by, 'Thu ngân') };
}

export function parseMoneyText(value: unknown): number {
  const raw = text(value);
  if (!raw) return 0;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+)$/.test(raw)) throw new Error('Số tiền phải là số nguyên không âm.');
  return integer(Number(raw.replace(/[,.]/g, '')), 'Số tiền');
}

export function parseItem(value: unknown): PosItem {
  const item = object(value);
  const condition = item.condition ?? 'NEW';
  if (condition !== 'NEW' && condition !== 'QSD') throw new Error('Tình trạng hàng không hợp lệ.');
  const qty = integer(item.quantity ?? 1, 'Số lượng', 1);
  const price = integer(item.unit_price_cents, 'Giá bán');
  const discount = integer(item.discount_cents ?? 0, 'Chiết khấu dòng hàng');
  if (!Number.isSafeInteger(qty * price) || discount > qty * price) throw new Error('Tổng tiền dòng hàng hoặc chiết khấu không hợp lệ.');
  const unitId = item.product_unit_id == null ? null : integer(item.product_unit_id, 'Serial', 1);
  if (unitId && qty !== 1) throw new Error('Mỗi serial phải có số lượng một.');
  return { product_id: integer(item.product_id, 'Hàng hóa', 1),
    product_type_id: item.product_type_id == null ? null : integer(item.product_type_id, 'Phân loại', 1),
    product_unit_id: unitId, condition, quantity: qty, unit_price_cents: price, discount_cents: discount };
}

export function parsePosInput(value: unknown) {
  const input = object(value);
  const type = input.order_type ?? 'ORDER';
  if (type !== 'ORDER' && type !== 'PREORDER') throw new Error('Loại đơn không hợp lệ.');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) throw new Error('Đơn phải có từ 1 đến 100 dòng hàng.');
  const items = input.items.map(parseItem);
  const discount = integer(input.discount_cents ?? 0, 'Chiết khấu đơn');
  const shipping = integer(input.shipping_cents ?? 0, 'Phí giao hàng');
  const lineTotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents - item.discount_cents, 0);
  if (!Number.isSafeInteger(lineTotal) || discount > lineTotal) throw new Error('Chiết khấu vượt giá trị hàng hóa.');
  const total = integer(lineTotal - discount + shipping, 'Tổng tiền');
  const payment = parsePayment(input.payment);
  if (payment.amount_paid_cents > total) throw new Error('Tiền thanh toán vượt số tiền phải thu.');
  const rawShipment = input.shipment == null ? null : object(input.shipment);
  const carrier = rawShipment?.carrier ?? 'PICKUP';
  if (!['PICKUP', 'BUS', 'GHN'].includes(String(carrier))) throw new Error('Hình thức giao hàng không hợp lệ.');
  const shipment = rawShipment ? {
    carrier: String(carrier), delivery_partner_id: rawShipment.delivery_partner_id == null ? null : integer(rawShipment.delivery_partner_id, 'Đối tác giao hàng', 1),
    tracking_code: text(rawShipment.tracking_code), bus_station: text(rawShipment.bus_station), bus_plate: text(rawShipment.bus_plate),
    receiver_name: text(rawShipment.receiver_name), receiver_phone: text(rawShipment.receiver_phone), receiver_address: text(rawShipment.receiver_address),
    shipping_fee_cents: integer(rawShipment.shipping_fee_cents ?? 0, 'Phí vận chuyển'),
    shipping_payer: text(rawShipment.shipping_payer, 'BUYER_PAYS'), weight_grams: integer(rawShipment.weight_grams ?? 0, 'Khối lượng'),
    dimensions: text(rawShipment.dimensions),
  } : null;
  return { request_id: requestKey(input.request_id), order_type: type, items, payment, shipment,
    customer_id: input.customer_id == null ? null : integer(input.customer_id, 'Khách hàng', 1),
    customer_name: text(input.customer_name), customer_phone: text(input.customer_phone), customer_address: text(input.customer_address),
    discount_cents: discount, shipping_cents: shipping, amount_total_cents: total, note: text(input.note), created_by: text(input.created_by, 'Thu ngân') };
}
