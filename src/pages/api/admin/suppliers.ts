import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

// GET: Lấy danh sách nhà cung cấp hoặc danh mục chi phí nhập hàng
export const GET: APIRoute = async ({ url }) => {
  const type = url.searchParams.get('type');
  
  if (type === 'categories') {
    try {
      const { results: categories } = await env.DB
        .prepare('SELECT id, name, category_type, is_default FROM purchase_expense_categories ORDER BY category_type ASC, id ASC')
        .all<any>();
      return new Response(JSON.stringify({ success: true, categories: categories || [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const { results: suppliers } = await env.DB
      .prepare(`
        SELECT 
          s.id, s.supplier_code, s.name, s.phone, s.address, s.province, s.ward, s.address_detail, s.note, s.created_at,
          COALESCE((SELECT SUM(pr.total_amount_cents) FROM purchase_receipts pr WHERE pr.supplier_id = s.id AND pr.receipt_status != 'CANCELLED'), 0) AS total_purchase_cents,
          COALESCE((SELECT SUM(pr.debt_amount_cents) FROM purchase_receipts pr WHERE pr.supplier_id = s.id AND pr.receipt_status != 'CANCELLED'), 0) AS current_debt_cents,
          (SELECT COUNT(*) FROM purchase_receipts pr WHERE pr.supplier_id = s.id AND pr.receipt_status != 'CANCELLED') AS receipt_count
        FROM suppliers s 
        ORDER BY s.id DESC
      `)
      .all<any>();
    return new Response(JSON.stringify({ success: true, suppliers: suppliers || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST: Tạo/sửa nhà cung cấp HOẶC tạo mới danh mục chi phí nhập hàng
export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json() as any;

    // 1. Tạo danh mục chi phí nhập hàng mới
    if (data.action === 'create_category') {
      const catName = data.name?.trim();
      const catType = data.category_type === 'NCC' ? 'NCC' : 'OTHER';
      if (!catName) {
        return new Response(JSON.stringify({ success: false, error: 'Tên danh mục chi phí là bắt buộc' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await env.DB
        .prepare('INSERT OR IGNORE INTO purchase_expense_categories (name, category_type) VALUES (?, ?)')
        .bind(catName, catType)
        .run();

      const newCat = await env.DB
        .prepare('SELECT id, name, category_type FROM purchase_expense_categories WHERE name = ? LIMIT 1')
        .bind(catName)
        .first<any>();

      return new Response(JSON.stringify({ success: true, data: newCat }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Tạo hoặc sửa Nhà Cung Cấp (Chuẩn 100% như Khách hàng)
    const name = data.name?.trim();
    if (!name) {
      return new Response(JSON.stringify({ success: false, error: 'Tên nhà cung cấp là bắt buộc' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const phone = data.phone?.trim() || null;
    const province = data.province?.trim() || null;
    const ward = data.ward?.trim() || null;
    const addressDetail = data.address_detail?.trim() || null;
    const fullAddress = [addressDetail, ward, province].filter(Boolean).join(', ') || data.address?.trim() || null;
    const note = data.note?.trim() || null;
    const id = data.id ? Number(data.id) : null;

    if (id) {
      // Cập nhật NCC
      await env.DB
        .prepare(`
          UPDATE suppliers
          SET name = ?, phone = ?, province = ?, ward = ?, address_detail = ?, address = ?, note = ?
          WHERE id = ?
        `)
        .bind(name, phone, province, ward, addressDetail, fullAddress, note, id)
        .run();

      return new Response(JSON.stringify({
        success: true,
        data: { id, name, phone, address: fullAddress, province, ward, address_detail: addressDetail, note }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Kiểm tra trùng SĐT khi tạo mới
    if (phone) {
      const existing = await env.DB
        .prepare('SELECT id, supplier_code, name, phone, address, province, ward, address_detail FROM suppliers WHERE phone = ? LIMIT 1')
        .bind(phone)
        .first<any>();
      if (existing) {
        return new Response(JSON.stringify({
          success: true,
          data: existing,
          existed: true,
          message: 'Nhà cung cấp với số điện thoại này đã tồn tại'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Sinh mã NCC
    const lastRow = await env.DB
      .prepare("SELECT supplier_code FROM suppliers WHERE supplier_code LIKE 'NCC%' ORDER BY id DESC LIMIT 1")
      .first<{ supplier_code: string }>();
    let nextNum = 1;
    if (lastRow?.supplier_code) {
      const m = lastRow.supplier_code.match(/^NCC(\d+)$/);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    const supplierCode = `NCC${nextNum.toString().padStart(4, '0')}`;

    const ins = await env.DB
      .prepare(`
        INSERT INTO suppliers (supplier_code, name, phone, province, ward, address_detail, address, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .bind(supplierCode, name, phone, province, ward, addressDetail, fullAddress, note)
      .run();

    const newId = ins.meta.last_row_id;
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: newId,
        supplier_code: supplierCode,
        name,
        phone,
        address: fullAddress,
        province,
        ward,
        address_detail: addressDetail
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Lỗi xử lý nhà cung cấp:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Lỗi xử lý nhà cung cấp' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
