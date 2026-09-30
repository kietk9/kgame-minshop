import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

// Sinh mã sản phẩm tiếp theo (SP000331...)
async function getNextProductCode(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT product_code FROM products WHERE product_code LIKE 'SP%' ORDER BY id DESC LIMIT 1")
    .first<{ product_code: string }>();

  if (!row?.product_code) return 'SP000100';
  const match = row.product_code.match(/^SP(\d+)$/);
  if (!match) return 'SP000100';
  const nextNum = parseInt(match[1], 10) + 1;
  return `SP${nextNum.toString().padStart(6, '0')}`;
}

// GET /api/admin/quick-product?check_name=...&exclude_id=...
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const checkName = url.searchParams.get('check_name')?.trim();
  const excludeId = url.searchParams.get('exclude_id');

  if (checkName) {
    let query = 'SELECT id, product_code, name, price_cents, price_used_cents, cost_price_cents, cost_price_used_cents, stock_new, stock_used, stock, unit_name, has_serial FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))';
    const params: any[] = [checkName];
    if (excludeId) {
      query += ' AND id != ?';
      params.push(Number(excludeId));
    }
    query += ' LIMIT 1';

    const row = await env.DB.prepare(query).bind(...params).first<any>();
    return new Response(JSON.stringify({ exists: !!row, product: row || null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json() as any;

    const editId = data.id ? Number(data.id) : null;
    const name = data.name?.trim();
    if (!name) {
      return new Response(JSON.stringify({ success: false, error: 'Tên hàng hóa là bắt buộc' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Kiểm tra trùng tên khi tạo mới
    if (!editId) {
      const duplicate = await env.DB
        .prepare('SELECT id, product_code, name FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1')
        .bind(name)
        .first<any>();

      if (duplicate) {
        return new Response(JSON.stringify({
          success: false,
          error: `Hàng hóa "${duplicate.name}" đã tồn tại trong hệ thống (Mã: ${duplicate.product_code}). Vui lòng bấm vào thông báo để mở sản phẩm đã có hoặc đặt tên phân biệt!`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    let productCode = data.product_code?.trim();
    if (!productCode) {
      if (!editId) {
        productCode = await getNextProductCode(env.DB);
      }
    }

    const barcode = data.barcode?.trim() || null;
    const categoryId = data.category_id ? Number(data.category_id) : null;
    const brand = data.brand?.trim() || null;
    let brandId: number | null = null;
    if (brand) {
      const bRow = await env.DB
        .prepare('SELECT id FROM brands WHERE LOWER(name) = LOWER(?) LIMIT 1')
        .bind(brand)
        .first<{ id: number }>();
      if (bRow) {
        brandId = bRow.id;
      }
    }
    const unitName = data.unit_name?.trim() || 'Cái';

    const initialCondition = data.initial_condition || (Number(data.price_used_cents) > 0 && !Number(data.price_cents) ? 'QSD' : 'NEW');
    let salePrice = Number(data.price_cents) || 0;
    let costPrice = Number(data.cost_price_cents) || 0;
    let usedPrice = Number(data.price_used_cents) || 0;
    let usedCost = Number(data.cost_price_used_cents) || 0;

    if (initialCondition === 'QSD') {
      if (!usedPrice && salePrice) {
        usedPrice = salePrice;
        salePrice = 0;
      }
      if (!usedCost && costPrice) {
        usedCost = costPrice;
        costPrice = 0;
      }
    }

    const hasSerial = Number(data.has_serial) === 1 ? 1 : 0;
    const trackingMode = hasSerial ? 'CODE' : 'QUANTITY';

    // Xử lý Serials ban đầu nếu có
    const rawSerials: { code: string; condition: string }[] = Array.isArray(data.serials) ? data.serials : [];
    const validSerials: { code: string; condition: 'NEW' | 'QSD' }[] = [];
    const seenCodes = new Set<string>();

    for (const item of rawSerials) {
      const code = item.code?.trim();
      if (code && !seenCodes.has(code.toLowerCase())) {
        seenCodes.add(code.toLowerCase());
        validSerials.push({
          code,
          condition: item.condition === 'QSD' ? 'QSD' : 'NEW'
        });
      }
    }

    const description = data.description?.trim() || null;
    const invoiceNote = data.invoice_note?.trim() || null;
    const warrantyInfo = data.warranty_info ? JSON.stringify(data.warranty_info) : null;

    // Tính mốc bảo hành tháng chính nếu có
    let warrantyMonths = 0;
    if (data.warranty_info?.warranties && Array.isArray(data.warranty_info.warranties)) {
      for (const w of data.warranty_info.warranties) {
        const d = Number(w.duration) || 0;
        if (w.unit === 'nam') warrantyMonths = Math.max(warrantyMonths, d * 12);
        else if (w.unit === 'thang') warrantyMonths = Math.max(warrantyMonths, d);
      }
    }

    // ==========================================
    // TRƯỜNG HỢP: CẬP NHẬT / SỬA HÀNG HÓA
    // ==========================================
    if (editId) {
      const existing = await env.DB
        .prepare('SELECT * FROM products WHERE id = ?')
        .bind(editId)
        .first<any>();

      if (!existing) {
        return new Response(JSON.stringify({ success: false, error: 'Hàng hóa không tồn tại' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await env.DB
        .prepare(`
          UPDATE products SET
            name = ?,
            product_code = COALESCE(?, product_code),
            barcode = ?,
            category_id = ?,
            brand = ?,
            brand_id = ?,
            unit_name = ?,
            price_cents = ?,
            cost_price_cents = ?,
            price_used_cents = ?,
            cost_price_used_cents = ?,
            has_serial = ?,
            tracking_mode = ?,
            description = ?,
            invoice_note = ?,
            note = ?,
            warranty_info = ?,
            warranty_period_months = ?
          WHERE id = ?
        `)
        .bind(
          name,
          productCode,
          barcode,
          categoryId,
          brand,
          brandId,
          unitName,
          salePrice,
          costPrice,
          usedPrice,
          usedCost,
          hasSerial,
          trackingMode,
          description,
          invoiceNote,
          invoiceNote,
          warrantyInfo,
          warrantyMonths,
          editId
        )
        .run();

      // Cập nhật giá cho default product_type
      await env.DB
        .prepare(`
          UPDATE product_types SET
            sale_price_cents = ?,
            cost_price_cents = ?,
            updated_at = datetime('now')
          WHERE product_id = ?
        `)
        .bind(salePrice, costPrice, editId)
        .run();

      // Nếu có nhập thêm mã bộ mới trong lúc sửa
      if (hasSerial && validSerials.length > 0) {
        const typeRow = await env.DB
          .prepare('SELECT id FROM product_types WHERE product_id = ? ORDER BY id ASC LIMIT 1')
          .bind(editId)
          .first<{ id: number }>();

        const mainTypeId = typeRow?.id;
        if (mainTypeId) {
          for (const item of validSerials) {
            const exists = await env.DB
              .prepare('SELECT id FROM product_units WHERE program_code = ? LIMIT 1')
              .bind(item.code)
              .first();

            if (!exists) {
              const uIns = await env.DB
                .prepare(`
                  INSERT INTO product_units (
                    product_type_id, program_code, condition, availability, owner_type,
                    cost_price_cents, target_sale_price_cents, location_id, note,
                    is_self_produced, manufacturer_name, created_at, updated_at
                  ) VALUES (
                    ?, ?, ?, 'IN_STOCK', 'KGAME',
                    ?, ?, 'KHO_CHINH', 'Bổ sung khi sửa hàng hóa',
                    1, 'Tôi sản xuất', datetime('now'), datetime('now')
                  )
                `)
                .bind(mainTypeId, item.code, item.condition, costPrice, salePrice)
                .run();

              await env.DB
                .prepare(`
                  INSERT INTO inventory_transactions (
                    product_id, product_type_id, product_unit_id, condition,
                    quantity, transaction_type, reference_type, reference_id,
                    unit_cost_cents, location_id, note, created_by, created_at
                  ) VALUES (
                    ?, ?, ?, ?,
                    1, 'INITIAL', 'manual', ?,
                    ?, 'KHO_CHINH', 'Bổ sung mã bộ', 'ADMIN', datetime('now')
                  )
                `)
                .bind(editId, mainTypeId, uIns.meta.last_row_id, item.condition, editId, costPrice)
                .run();
            }
          }
        }
      }

      // Đồng bộ lại tồn kho thực tế của mã bộ nếu là hàng serial
      if (hasSerial) {
        const countRow = await env.DB
          .prepare(`
            SELECT 
              SUM(CASE WHEN condition = 'NEW' THEN 1 ELSE 0 END) AS stock_new,
              SUM(CASE WHEN condition = 'QSD' THEN 1 ELSE 0 END) AS stock_used,
              COUNT(*) AS total_stock
            FROM product_units
            WHERE product_type_id IN (SELECT id FROM product_types WHERE product_id = ?)
              AND availability = 'IN_STOCK'
          `)
          .bind(editId)
          .first<any>();

        const realStockNew = countRow?.stock_new || 0;
        const realStockUsed = countRow?.stock_used || 0;
        const realTotalStock = countRow?.total_stock || 0;

        await env.DB
          .prepare(`
            UPDATE products SET
              stock_new = ?,
              stock_used = ?,
              stock = ?
            WHERE id = ?
          `)
          .bind(realStockNew, realStockUsed, realTotalStock, editId)
          .run();

        await env.DB
          .prepare(`
            UPDATE product_types SET
              cached_stock_new = ?,
              cached_stock_used = ?
            WHERE product_id = ?
          `)
          .bind(realStockNew, realStockUsed, editId)
          .run();
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Đã cập nhật hàng hóa thành công',
        data: {
          id: editId,
          name,
          product_code: productCode || existing.product_code,
          barcode: barcode || undefined,
          has_serial: hasSerial,
          price_cents: salePrice,
          price_used_cents: usedPrice,
          cost_price_cents: costPrice,
          cost_price_used_cents: usedCost,
          unit_name: unitName
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // TRƯỜNG HỢP: TẠO MỚI HÀNG HÓA
    // ==========================================
    let stockNew = 0;
    let stockUsed = 0;
    let totalStock = 0;

    if (hasSerial) {
      stockNew = validSerials.filter(s => s.condition === 'NEW').length;
      stockUsed = validSerials.filter(s => s.condition === 'QSD').length;
      totalStock = stockNew + stockUsed;
    } else {
      if (initialCondition === 'QSD') {
        stockUsed = Number(data.stock_used || data.stock) || 0;
        stockNew = 0;
      } else if (initialCondition === 'BOTH') {
        stockNew = Number(data.stock_new) || 0;
        stockUsed = Number(data.stock_used) || 0;
      } else {
        stockNew = Number(data.stock_new || data.stock) || 0;
        stockUsed = 0;
      }
      totalStock = stockNew + stockUsed;
    }

    // 1. Insert product
    const ins = await env.DB
      .prepare(`
        INSERT INTO products (
          name, product_code, barcode, category_id, brand, brand_id, unit_name,
          price_cents, price_used_cents, cost_price_cents, cost_price_used_cents,
          stock, stock_new, stock_used, has_serial, tracking_mode,
          description, note, invoice_note, warranty_info, warranty_period_months,
          active, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          1, datetime('now')
        )
      `)
      .bind(
        name, productCode, barcode, categoryId, brand, brandId, unitName,
        salePrice, usedPrice, costPrice, usedCost,
        totalStock, stockNew, stockUsed, hasSerial, trackingMode,
        description, invoiceNote, invoiceNote, warrantyInfo, warrantyMonths
      )
      .run();

    const productId = ins.meta.last_row_id;
    let mainTypeId: number | null = null;

    // 2. Xử lý các thuộc tính / phiên bản biến thể (nếu có)
    const variants = Array.isArray(data.variants) ? data.variants : [];
    if (variants.length > 0) {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        if (!v.name || !v.name.trim()) continue;
        const vIns = await env.DB
          .prepare(`
            INSERT INTO product_types (
              product_id, name, tracking_mode, sale_price_cents, cost_price_cents,
              cached_stock_new, cached_stock_used, is_active, created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?,
              ?, ?, 1, datetime('now'), datetime('now')
            )
          `)
          .bind(
            productId,
            v.name.trim(),
            trackingMode,
            Number(v.sale_price_cents) || salePrice,
            Number(v.cost_price_cents) || costPrice,
            i === 0 ? stockNew : 0,
            i === 0 ? stockUsed : 0
          )
          .run();

        if (i === 0) {
          mainTypeId = vIns.meta.last_row_id;
        }
      }
    } else {
      // Nếu là sản phẩm đơn lẻ thông thường (không có biến thể), tự tạo 1 default product_type
      const defIns = await env.DB
        .prepare(`
          INSERT INTO product_types (
            product_id, name, tracking_mode, sale_price_cents, cost_price_cents,
            cached_stock_new, cached_stock_used, is_active, created_at, updated_at
          ) VALUES (
            ?, 'Tiêu chuẩn', ?, ?, ?,
            ?, ?, 1, datetime('now'), datetime('now')
          )
        `)
        .bind(productId, trackingMode, salePrice, costPrice, stockNew, stockUsed)
        .run();

      mainTypeId = defIns.meta.last_row_id;
    }

    // 3. Xử lý lưu các mã bộ Serial vào product_units và inventory_transactions
    if (hasSerial && validSerials.length > 0 && mainTypeId) {
      for (const item of validSerials) {
        const existingUnit = await env.DB
          .prepare('SELECT id FROM product_units WHERE program_code = ? LIMIT 1')
          .bind(item.code)
          .first();

        if (existingUnit) {
          continue; // Bỏ qua mã đã trùng
        }

        const unitIns = await env.DB
          .prepare(`
            INSERT INTO product_units (
              product_type_id, program_code, condition, availability, owner_type,
              cost_price_cents, target_sale_price_cents, location_id, note,
              is_self_produced, manufacturer_name, created_at, updated_at
            ) VALUES (
              ?, ?, ?, 'IN_STOCK', 'KGAME',
              ?, ?, 'KHO_CHINH', 'Khởi tạo tồn kho ban đầu',
              1, 'Tôi sản xuất', datetime('now'), datetime('now')
            )
          `)
          .bind(
            mainTypeId,
            item.code,
            item.condition,
            costPrice,
            salePrice
          )
          .run();

        const unitId = unitIns.meta.last_row_id;

        await env.DB
          .prepare(`
            INSERT INTO inventory_transactions (
              product_id, product_type_id, product_unit_id, condition,
              quantity, transaction_type, reference_type, reference_id,
              unit_cost_cents, location_id, note, created_by, created_at
            ) VALUES (
              ?, ?, ?, ?,
              1, 'INITIAL', 'manual', ?,
              ?, 'KHO_CHINH', 'Khởi tạo mã bộ ban đầu', 'ADMIN', datetime('now')
            )
          `)
          .bind(
            productId,
            mainTypeId,
            unitId,
            item.condition,
            productId,
            costPrice
          )
          .run();
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        id: productId,
        name,
        product_code: productCode,
        barcode: barcode || undefined,
        has_serial: hasSerial,
        price_cents: salePrice,
        price_used_cents: usedPrice,
        cost_price_cents: costPrice,
        cost_price_used_cents: usedCost,
        stock_new: stockNew,
        stock_used: stockUsed,
        stock: totalStock,
        unit_name: unitName
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Lỗi API QuickProduct:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Lỗi xử lý hàng hóa' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
