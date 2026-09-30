import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

const fail = (msg: string) => `/admin/production/new?error=${encodeURIComponent(msg)}`;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();

  const outputProductId = Number(form.get('output_product_id'));
  const outputProductTypeId = Number(form.get('output_product_type_id'));
  const programCode = String(form.get('program_code') ?? '').trim();
  const expiryDaysRaw = form.get('expiry_days');
  const expiryDays = expiryDaysRaw ? Number(expiryDaysRaw) : 400;
  const note = String(form.get('note') ?? '').trim() || 'Lắp ráp thành phẩm';

  if (!outputProductId || !outputProductTypeId) {
    return redirect(fail('Vui lòng chọn mặt hàng và phiên bản cần sản xuất.'), 303);
  }

  if (!programCode) {
    return redirect(fail('Mã bộ xuất xưởng (Program Code) là bắt buộc.'), 303);
  }

  // 1. Kiểm tra trùng Program Code
  const existingUnit = await env.DB.prepare('SELECT id FROM product_units WHERE program_code = ?')
    .bind(programCode)
    .first();
  if (existingUnit) {
    return redirect(fail(`Mã Program Code '${programCode}' đã tồn tại trong hệ thống! Vui lòng chọn mã khác.`), 303);
  }

  // 2. Lấy thông tin thành phẩm
  const outputProduct = await env.DB.prepare('SELECT * FROM products WHERE id = ?')
    .bind(outputProductId)
    .first<any>();
  const outputType = await env.DB.prepare('SELECT * FROM product_types WHERE id = ?')
    .bind(outputProductTypeId)
    .first<any>();

  if (!outputProduct || !outputType) {
    return redirect(fail('Mặt hàng hoặc phiên bản không tồn tại.'), 303);
  }

  // 3. Phân tích danh sách linh kiện đầu vào
  const inputProductIds = form.getAll('input_product_id[]').map(Number).filter(Boolean);
  const inputQuantities = form.getAll('input_quantity[]').map(Number);

  if (inputProductIds.length === 0) {
    return redirect(fail('Vui lòng chọn ít nhất 1 linh kiện đầu vào để lắp ráp.'), 303);
  }

  // 4. Kiểm tra tồn kho từng linh kiện
  let totalBOMCost = 0;
  const componentsToConsume: { product: any; qty: number }[] = [];

  for (let i = 0; i < inputProductIds.length; i++) {
    const compId = inputProductIds[i];
    const qty = inputQuantities[i] || 1;

    const comp = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(compId).first<any>();
    if (!comp) continue;

    if (comp.stock < qty) {
      return redirect(fail(`Linh kiện '${comp.name}' trong kho chỉ còn ${comp.stock} cái, không đủ để xuất ${qty} cái.`), 303);
    }

    // Giá vốn linh kiện
    const compCost = comp.price_cents ? Math.round(comp.price_cents * 0.6) : 0;
    totalBOMCost += compCost * qty;
    componentsToConsume.push({ product: comp, qty });
  }

  // 5. Sinh mã lệnh sản xuất (SX0001...)
  const countRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM production_orders').first<{ cnt: number }>();
  const seq = (countRow?.cnt ?? 0) + 1;
  const productionCode = `SX${String(seq).padStart(4, '0')}`;

  // 6. Tính ngày hết hạn nếu là hàng Tôi sản xuất
  const isSelf = !outputProduct.default_manufacturer || outputProduct.default_manufacturer === 'Tôi sản xuất';
  let finalExpiryDate: string | null = null;
  let finalExpiryDays: number | null = null;

  if (isSelf && expiryDays > 0) {
    finalExpiryDays = expiryDays;
    const d = new Date();
    d.setDate(d.getDate() + expiryDays);
    finalExpiryDate = d.toISOString().split('T')[0];
  }

  // 7. Thực hiện quy trình sản xuất (Tạo lệnh, Trừ kho linh kiện, Cấp mã bộ, Nhập kho thành phẩm)
  // Tạo lệnh sản xuất
  const orderRes = await env.DB.prepare(`
    INSERT INTO production_orders (
      production_code, output_product_id, output_product_type_id, quantity, status, created_by, completed_at
    ) VALUES (?, ?, ?, 1, 'COMPLETED', 'Admin', datetime('now'))
    RETURNING id
  `).bind(productionCode, outputProductId, outputProductTypeId).first<{ id: number }>();

  const orderId = orderRes!.id;

  // Trừ kho từng linh kiện và ghi sổ kho PRODUCTION_USE
  for (const item of componentsToConsume) {
    // Trừ kho products
    await env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ?')
      .bind(item.qty, item.product.id)
      .run();

    // Trừ kho product_types nếu có
    await env.DB.prepare('UPDATE product_types SET cached_stock_new = cached_stock_new - ? WHERE product_id = ?')
      .bind(item.qty, item.product.id)
      .run();

    // Lưu vào production_inputs
    await env.DB.prepare(`
      INSERT INTO production_inputs (production_order_id, product_id, quantity, unit_cost_cents)
      VALUES (?, ?, ?, ?)
    `).bind(orderId, item.product.id, item.qty, item.product.price_cents ?? 0).run();

    // Ghi nhật ký sổ kho: PRODUCTION_USE (-qty)
    await env.DB.prepare(`
      INSERT INTO inventory_transactions (
        product_id, condition, quantity, transaction_type, reference_type, reference_id, note
      ) VALUES (?, 'NEW', ?, 'PRODUCTION_USE', 'production_order', ?, ?)
    `).bind(
      item.product.id,
      -item.qty,
      orderId,
      `Xuất linh kiện ráp cho lệnh sản xuất ${productionCode} (${outputProduct.name})`
    ).run();
  }

  // Tạo mã bộ Program Code mới cho thành phẩm
  const unitRes = await env.DB.prepare(`
    INSERT INTO product_units (
      product_type_id, program_code, condition, availability, owner_type,
      is_self_produced, manufacturer_name, expiry_days, expiry_date,
      cost_price_cents, target_sale_price_cents, note
    ) VALUES (?, ?, 'NEW', 'IN_STOCK', 'KGAME', ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `).bind(
    outputProductTypeId,
    programCode,
    isSelf ? 1 : 0,
    outputProduct.default_manufacturer ?? 'Tôi sản xuất',
    finalExpiryDays,
    finalExpiryDate,
    totalBOMCost,
    outputType.sale_price_cents,
    note
  ).first<{ id: number }>();

  const unitId = unitRes!.id;

  // Lưu vào production_outputs
  await env.DB.prepare(`
    INSERT INTO production_outputs (
      production_order_id, product_unit_id, quantity, unit_cost_cents, expiry_days, expiry_date
    ) VALUES (?, ?, 1, ?, ?, ?)
  `).bind(orderId, unitId, totalBOMCost, finalExpiryDays, finalExpiryDate).run();

  // Tăng tồn kho thành phẩm
  await env.DB.prepare('UPDATE product_types SET cached_stock_new = cached_stock_new + 1 WHERE id = ?')
    .bind(outputProductTypeId)
    .run();

  await env.DB.prepare('UPDATE products SET stock = stock + 1 WHERE id = ?')
    .bind(outputProductId)
    .run();

  // Ghi nhật ký sổ kho: PRODUCTION_OUT (+1)
  await env.DB.prepare(`
    INSERT INTO inventory_transactions (
      product_id, product_type_id, product_unit_id, condition, quantity, transaction_type, reference_type, reference_id, unit_cost_cents, note
    ) VALUES (?, ?, ?, 'NEW', 1, 'PRODUCTION_OUT', 'production_order', ?, ?, ?)
  `).bind(
    outputProductId,
    outputProductTypeId,
    unitId,
    orderId,
    totalBOMCost,
    `Nhập thành phẩm từ lệnh sản xuất ${productionCode} (Mã bộ: ${programCode})`
  ).run();

  return redirect('/admin/production', 303);
};
