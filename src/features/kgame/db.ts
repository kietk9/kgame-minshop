import { repairCustomerMatches, repairPaidExpression, repairDebtExpression, partnerRepairDebtExpression } from './repairDebt.ts';
import { recordCashTransaction } from './cashbook.ts';
// src/features/kgame/db.ts
import type { D1Database } from '@cloudflare/workers-types';
import type { KgameProductType, KgameProductUnit, KgameInventoryTransaction, KgameProgramCodeTimeline } from './types';

/** Lấy tất cả phân loại (Product Types) của 1 sản phẩm */
export async function getProductTypes(db: D1Database, productId: number): Promise<KgameProductType[]> {
  const { results } = await db
    .prepare('SELECT * FROM product_types WHERE product_id = ? ORDER BY sort_order ASC, id ASC')
    .bind(productId)
    .all<KgameProductType>();
  return results ?? [];
}

/** Lấy danh sách mã bộ thuộc 1 phân loại (Product Type) */
export async function getProductUnitsByType(db: D1Database, productTypeId: number): Promise<KgameProductUnit[]> {
  const { results } = await db
    .prepare(`
      SELECT pu.*, pt.name AS product_type_name, p.name AS product_name, p.product_code
      FROM product_units pu
      JOIN product_types pt ON pu.product_type_id = pt.id
      JOIN products p ON pt.product_id = p.id
      WHERE pu.product_type_id = ?
      ORDER BY pu.id DESC
    `)
    .bind(productTypeId)
    .all<KgameProductUnit>();
  return results ?? [];
}

/** Tra cứu Program Code 360: Tìm mã bộ và toàn bộ dòng thời gian lịch sử */
export async function lookupProgramCode360(
  db: D1Database,
  codeQuery: string
): Promise<KgameProgramCodeTimeline | null> {
  const cleanCode = codeQuery.trim();
  if (!cleanCode) return null;

  // 1. Tìm hồ sơ mã bộ
  const unit = await db
    .prepare(`
      SELECT 
        pu.*,
        pt.name AS product_type_name,
        pt.sale_price_cents,
        p.id AS product_id,
        p.name AS product_name,
        p.product_code,
        c.name AS category_name,
        CASE WHEN pu.owner_type = 'SUPPLIER' THEN supplier.name ELSE cust.name END AS owner_name,
        CASE WHEN pu.owner_type = 'SUPPLIER' THEN supplier.phone ELSE cust.phone END AS owner_phone
      FROM product_units pu
      JOIN product_types pt ON pu.product_type_id = pt.id
      JOIN products p ON pt.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN customers cust ON pu.owner_id = cust.id AND pu.owner_type = 'CUSTOMER'
      LEFT JOIN partners supplier ON pu.owner_id = supplier.id AND pu.owner_type = 'SUPPLIER'
      WHERE pu.program_code = ? OR pu.program_code LIKE ?
      LIMIT 1
    `)
    .bind(cleanCode, `%${cleanCode}%`)
    .first<KgameProductUnit>();

  if (!unit) return null;

  // 2. Lấy sổ kho liên quan đến mã bộ này
  const { results: transactions } = await db
    .prepare(`
      SELECT it.*, p.name AS product_name, pt.name AS product_type_name
      FROM inventory_transactions it
      JOIN products p ON it.product_id = p.id
      LEFT JOIN product_types pt ON it.product_type_id = pt.id
      WHERE it.product_unit_id = ?
      ORDER BY it.id ASC
    `)
    .bind(unit.id)
    .all<KgameInventoryTransaction>();

  // 3. Lấy các phiếu sửa chữa liên quan
  const { results: repairs } = await db
    .prepare(`
      SELECT rt.*, cust.name AS customer_name, cust.phone AS customer_phone
      FROM repair_tickets rt
      LEFT JOIN customers cust ON rt.customer_id = cust.id
      WHERE rt.product_unit_id = ?
      ORDER BY rt.id ASC
    `)
    .bind(unit.id)
    .all<any>();

  // 4. Lấy các đơn hàng liên quan
  const { results: orders } = await db
    .prepare(`
      SELECT o.*, ol.unit_price_cents, ol.line_total_cents, cust.name AS customer_name, cust.phone AS customer_phone
      FROM order_units ou
      JOIN order_lines ol ON ou.order_line_id = ol.id
      JOIN orders o ON ol.order_id = o.id
      LEFT JOIN customers cust ON o.customer_id = cust.id
      WHERE ou.product_unit_id = ?
      ORDER BY o.id ASC
    `)
    .bind(unit.id)
    .all<any>();

  // 5. Lấy các phiếu thu mua liên quan
  const { results: buybacks } = await db
    .prepare(`
      SELECT b.*, bi.purchase_price_cents, bi.condition, cust.name AS customer_name, cust.phone AS customer_phone
      FROM buyback_items bi
      JOIN buybacks b ON bi.buyback_id = b.id
      LEFT JOIN customers cust ON b.customer_id = cust.id
      WHERE bi.product_unit_id = ?
      ORDER BY b.id ASC
    `)
    .bind(unit.id)
    .all<any>();

  return {
    unit,
    transactions: transactions ?? [],
    repairs: repairs ?? [],
    orders: orders ?? [],
    buybacks: buybacks ?? [],
  };
}

/** Lấy danh sách tất cả mã bộ gần đây (để hiển thị bảng quản lý Program Codes) */
export async function listRecentProductUnits(
  db: D1Database,
  limit = 50,
  filterAvailability?: string
): Promise<KgameProductUnit[]> {
  let query = `
    SELECT 
      pu.*,
      pt.name AS product_type_name,
      p.name AS product_name,
      p.product_code,
      c.name AS category_name,
      CASE WHEN pu.owner_type = 'SUPPLIER' THEN supplier.name ELSE cust.name END AS owner_name
    FROM product_units pu
    JOIN product_types pt ON pu.product_type_id = pt.id
    JOIN products p ON pt.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN customers cust ON pu.owner_id = cust.id AND pu.owner_type = 'CUSTOMER'
      LEFT JOIN partners supplier ON pu.owner_id = supplier.id AND pu.owner_type = 'SUPPLIER'
  `;
  const params: any[] = [];
  if (filterAvailability) {
    query += ' WHERE pu.availability = ?';
    params.push(filterAvailability);
  }
  query += ' ORDER BY pu.id DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(query);
  const { results } = await (params.length === 2 ? stmt.bind(params[0], params[1]) : stmt.bind(params[0])).all<KgameProductUnit>();
  return results ?? [];
}

/** Lấy danh sách mã bộ gắn theo product_type_ids */
export async function getUnitsForTypes(db: D1Database, typeIds: number[]): Promise<Record<number, KgameProductUnit[]>> {
  if (typeIds.length === 0) return {};
  const placeholders = typeIds.map(() => '?').join(',');
  const { results } = await db
    .prepare(`
      SELECT pu.*, pt.name AS product_type_name
      FROM product_units pu
      JOIN product_types pt ON pu.product_type_id = pt.id
      WHERE pu.product_type_id IN (${placeholders})
      ORDER BY pu.id DESC
    `)
    .bind(...typeIds)
    .all<KgameProductUnit>();

  const map: Record<number, KgameProductUnit[]> = {};
  for (const u of results ?? []) {
    if (!map[u.product_type_id]) map[u.product_type_id] = [];
    map[u.product_type_id].push(u);
  }
  return map;
}

/** Tìm kiếm thông minh tổng hợp: Tên, Mã SP, Program Code, Version, Danh mục */
export async function searchKgameProducts(
  db: D1Database,
  params: {
    query?: string;
    categoryId?: number | null;
    trackingMode?: string | null;
    condition?: string | null;
    stockStatus?: string | null;
    brandId?: number | null;
    supplier?: string | null;
    status?: string | null;
    limit?: number;
    offset?: number;
  }
) {
  const q = params.query?.trim() ?? '';
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  // 1. Kiểm tra xem có khớp chính xác Program Code nào không
  let matchedUnit: KgameProductUnit | null = null;
  if (q) {
    matchedUnit = await db
      .prepare(`
        SELECT pu.*, pt.name AS product_type_name, p.name AS product_name, p.product_code
        FROM product_units pu
        JOIN product_types pt ON pu.product_type_id = pt.id
        JOIN products p ON pt.product_id = p.id
        WHERE pu.program_code = ? OR pu.program_code LIKE ?
        LIMIT 1
      `)
      .bind(q, `%${q}%`)
      .first<KgameProductUnit>();
  }

  // 2. Xây dựng câu query sản phẩm
  let whereClauses: string[] = ['1=1'];
  let bindParams: any[] = [];

  if (params.status === 'active') {
    whereClauses.push('p.active = 1');
  } else if (params.status === 'inactive') {
    whereClauses.push('p.active = 0');
  }

  if (q) {
    whereClauses.push(`(
      p.name LIKE ? 
      OR p.product_code LIKE ? 
      OR p.slug LIKE ?
      OR p.id IN (SELECT pt.product_id FROM product_types pt WHERE pt.name LIKE ? OR pt.code LIKE ?)
      OR p.id IN (SELECT pt.product_id FROM product_types pt JOIN product_units pu ON pu.product_type_id = pt.id WHERE pu.program_code LIKE ?)
    )`);
    const pattern = `%${q}%`;
    bindParams.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  if (params.categoryId) {
    // Đệ quy lấy tất cả danh mục con, cháu, chắt... của categoryId
    whereClauses.push(`p.category_id IN (
      WITH RECURSIVE cat_tree AS (
        SELECT id FROM categories WHERE id = ?
        UNION ALL
        SELECT c.id FROM categories c JOIN cat_tree ct ON c.parent_id = ct.id
      )
      SELECT id FROM cat_tree
    )`);
    bindParams.push(params.categoryId);
  }

  if (params.trackingMode) {
    whereClauses.push('p.tracking_mode = ?');
    bindParams.push(params.trackingMode);
  }

  if (params.condition === 'NEW') {
    whereClauses.push('(p.stock_new > 0 OR (p.stock > 0 AND (p.stock_used IS NULL OR p.stock_used = 0)))');
  } else if (params.condition === 'USED' || params.condition === 'QSD') {
    whereClauses.push('p.stock_used > 0');
  }

  if (params.stockStatus === 'IN_STOCK') {
    whereClauses.push('(COALESCE(p.stock_new, 0) + COALESCE(p.stock_used, 0) + COALESCE(p.stock, 0)) > 0');
  } else if (params.stockStatus === 'OUT_OF_STOCK') {
    whereClauses.push('(COALESCE(p.stock_new, 0) + COALESCE(p.stock_used, 0) + COALESCE(p.stock, 0)) <= 0');
  }

  if (params.brandId) {
    whereClauses.push('p.brand_id = ?');
    bindParams.push(params.brandId);
  }

  if (params.supplier) {
    whereClauses.push('p.default_manufacturer LIKE ?');
    bindParams.push(`%${params.supplier}%`);
  }

  const whereStr = whereClauses.join(' AND ');

  // Đếm tổng số
  const countStmt = db.prepare(`SELECT COUNT(*) AS total FROM products p WHERE ${whereStr}`);
  const countRes = await (bindParams.length > 0 ? countStmt.bind(...bindParams) : countStmt).first<{ total: number }>();
  const totalCount = countRes?.total ?? 0;

  // Lấy danh sách sản phẩm
  const listStmt = db.prepare(`
    SELECT p.*, c.name AS category_name, b.name AS brand_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands b ON p.brand_id = b.id
    WHERE ${whereStr}
    ORDER BY p.id DESC
    LIMIT ? OFFSET ?
  `);
  const listParams = [...bindParams, limit, offset];
  const { results: products } = await listStmt.bind(...listParams).all<any>();

  return {
    products: products ?? [],
    totalCount,
    matchedUnit,
  };
}

/** Lấy nhật ký biến động kho (Inventory Transactions - Append Only) */
export async function listInventoryTransactions(
  db: D1Database,
  options: {
    transactionType?: string;
    condition?: string;
    searchQuery?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const { transactionType, condition, searchQuery, limit = 50, offset = 0 } = options;

  let whereClauses: string[] = [];
  let params: any[] = [];

  if (transactionType) {
    whereClauses.push('it.transaction_type = ?');
    params.push(transactionType);
  }

  if (condition) {
    whereClauses.push('it.condition = ?');
    params.push(condition);
  }

  if (searchQuery) {
    whereClauses.push('(p.name LIKE ? OR p.product_code LIKE ? OR pu.program_code LIKE ?)');
    const q = `%${searchQuery}%`;
    params.push(q, q, q);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const query = `
    SELECT 
      it.*,
      p.name AS product_name,
      p.product_code,
      pt.name AS product_type_name,
      pu.program_code
    FROM inventory_transactions it
    JOIN products p ON it.product_id = p.id
    LEFT JOIN product_types pt ON it.product_type_id = pt.id
    LEFT JOIN product_units pu ON it.product_unit_id = pu.id
    ${whereSql}
    ORDER BY it.id DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  const { results } = await db.prepare(query).bind(...params).all<any>();
  return results ?? [];
}

/** Sinh mã phiếu sửa chữa tiếp theo: SC0001, SC0002... */
export async function getNextRepairTicketCode(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT ticket_code FROM repair_tickets WHERE ticket_code LIKE 'SC%' ORDER BY id DESC LIMIT 1")
    .first<{ ticket_code: string }>();

  if (!row?.ticket_code) return 'SC0001';
  const match = row.ticket_code.match(/^SC(\d+)$/);
  if (!match) return 'SC0001';
  const nextNum = parseInt(match[1], 10) + 1;
  return `SC${nextNum.toString().padStart(4, '0')}`;
}

export interface CreateRepairTicketInput {
  owner_type: 'CUSTOMER' | 'KGAME';
  customer_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  product_id?: number | null;
  product_type_id?: number | null;
  product_unit_id?: number | null;
  unidentified_product_name?: string | null;
  problem_reported: string;
  accessories_received?: string | null;
  diagnosis?: string | null;
  repair_location: 'INTERNAL' | 'EXTERNAL';
  external_partner?: string | null;
  sent_partner_at?: string | null;
  expected_receive_at?: string | null;
  repair_price_cents?: number;
  expected_return_at?: string | null;
  assigned_to?: string | null;
  note?: string | null;
  created_by?: string;
}

/** Tiếp nhận phiếu sửa chữa mới */
export async function createRepairTicket(db: D1Database, input: CreateRepairTicketInput): Promise<{ id: number; ticket_code: string }> {
  const ticketCode = await getNextRepairTicketCode(db);

  // 1. Xử lý khách hàng nếu là hàng khách
  let finalCustomerId = input.customer_id ?? null;
  if (input.owner_type === 'CUSTOMER') {
    if (finalCustomerId) {
      // Nếu đã chọn khách hàng và có địa chỉ mới, cập nhật địa chỉ nếu cần
      if (input.customer_address?.trim()) {
        await db
          .prepare("UPDATE customers SET address = ?, updated_at = datetime('now') WHERE id = ? AND (address IS NULL OR address = '')")
          .bind(input.customer_address.trim(), finalCustomerId)
          .run();
      }
    } else if (input.customer_phone || input.customer_name) {
      const cleanPhone = (input.customer_phone || '').trim();
      if (cleanPhone) {
        const existing = await db
          .prepare('SELECT id, address FROM customers WHERE phone = ? LIMIT 1')
          .bind(cleanPhone)
          .first<{ id: number; address: string }>();

        if (existing) {
          finalCustomerId = existing.id;
          if (input.customer_address?.trim() && !existing.address) {
            await db
              .prepare("UPDATE customers SET address = ?, updated_at = datetime('now') WHERE id = ?")
              .bind(input.customer_address.trim(), existing.id)
              .run();
          }
        } else {
          // Sinh mã khách hàng tự động: KH0001...
          const nextCodeRow = await db
            .prepare("SELECT customer_code FROM customers WHERE customer_code LIKE 'KH%' ORDER BY id DESC LIMIT 1")
            .first<{ customer_code: string }>();
          let nextCustCode = 'KH0001';
          if (nextCodeRow?.customer_code) {
            const m = nextCodeRow.customer_code.match(/^KH(\d+)$/);
            if (m) nextCustCode = `KH${(parseInt(m[1], 10) + 1).toString().padStart(4, '0')}`;
          }

          const ins = await db
            .prepare(`
              INSERT INTO customers (customer_code, name, phone, address, created_at, updated_at)
              VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            `)
            .bind(
              nextCustCode,
              input.customer_name?.trim() || 'Khách sửa chữa',
              cleanPhone,
              input.customer_address?.trim() || null
            )
            .run();
          finalCustomerId = Number(ins.meta.last_row_id);
        }
      }
    }
  }

  // 2. Chèn phiếu sửa chữa
  const insTicket = await db
    .prepare(`
      INSERT INTO repair_tickets (
        ticket_code, owner_type, customer_id, product_id, product_type_id, product_unit_id,
        unidentified_product_name, problem_reported, accessories_received, diagnosis,
        repair_location, external_partner, sent_partner_at, expected_receive_at,
        status, repair_cost_cents, repair_price_cents, expected_return_at, assigned_to, note,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        'RECEIVED', 0, ?, ?, ?, ?,
        datetime('now'), datetime('now')
      )
    `)
    .bind(
      ticketCode,
      input.owner_type,
      finalCustomerId,
      input.product_id ?? null,
      input.product_type_id ?? null,
      input.product_unit_id ?? null,
      input.unidentified_product_name?.trim() ?? null,
      input.problem_reported.trim(),
      input.accessories_received?.trim() ?? null,
      input.diagnosis?.trim() ?? null,
      input.repair_location,
      input.external_partner?.trim() ?? null,
      input.sent_partner_at ?? null,
      input.expected_receive_at ?? null,
      input.repair_price_cents ?? 0,
      input.expected_return_at ?? null,
      input.assigned_to?.trim() ?? null,
      input.note?.trim() ?? null
    )
    .run();

  const ticketId = Number(insTicket.meta.last_row_id);

  // 3. Ghi sự kiện tiếp nhận ban đầu
  await db
    .prepare(`
      INSERT INTO repair_events (repair_ticket_id, event_type, note, created_by, created_at)
      VALUES (?, 'RECEIVED', ?, ?, datetime('now'))
    `)
    .bind(
      ticketId,
      `Tiếp nhận máy: ${input.problem_reported.trim()}`,
      input.created_by ?? 'Hệ thống'
    )
    .run();

  // 4. Nếu có gắn mã bộ vật lý, cập nhật trạng thái khả dụng của mã bộ
  if (input.product_unit_id) {
    const newAvail = input.owner_type === 'CUSTOMER' ? 'REPAIR_CUSTOMER' : 'REPAIRING_INTERNAL';
    await db
      .prepare('UPDATE product_units SET availability = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(newAvail, input.product_unit_id)
      .run();
  }

  return { id: ticketId, ticket_code: ticketCode };
}

/** Danh sách phiếu sửa chữa kèm lọc & phân trang */
export async function listRepairTickets(
  db: D1Database,
  params: {
    status?: string;
    location?: string;
    ownerType?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }
) {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const whereClauses: string[] = ['1=1'];
  const bindParams: any[] = [];

  if (params.status && params.status !== 'ALL') {
    whereClauses.push('rt.status = ?');
    bindParams.push(params.status);
  }

  if (params.location && params.location !== 'ALL') {
    whereClauses.push('rt.repair_location = ?');
    bindParams.push(params.location);
  }

  if (params.ownerType && params.ownerType !== 'ALL') {
    whereClauses.push('rt.owner_type = ?');
    bindParams.push(params.ownerType);
  }

  if (params.search) {
    const term = `%${params.search.trim()}%`;
    whereClauses.push(`(
      rt.ticket_code LIKE ?
      OR rt.problem_reported LIKE ?
      OR rt.unidentified_product_name LIKE ?
      OR cust.name LIKE ?
      OR cust.phone LIKE ?
      OR pu.program_code LIKE ?
      OR p.name LIKE ?
    )`);
    bindParams.push(term, term, term, term, term, term, term);
  }

  const whereStr = whereClauses.join(' AND ');

  const countStmt = db.prepare(`
    SELECT COUNT(*) AS total
    FROM repair_tickets rt
    LEFT JOIN customers cust ON rt.customer_id = cust.id
    LEFT JOIN products p ON rt.product_id = p.id
    LEFT JOIN product_units pu ON rt.product_unit_id = pu.id
    WHERE ${whereStr}
  `);
  const countRes = await (bindParams.length > 0 ? countStmt.bind(...bindParams) : countStmt).first<{ total: number }>();
  const total = countRes?.total ?? 0;

  const query = `
    SELECT 
      rt.*,
      cust.name AS customer_name,
      cust.phone AS customer_phone,
      cust.address AS customer_address,
      cust.customer_code,
      p.name AS product_name,
      p.product_code,
      pt.name AS product_type_name,
      pu.program_code,
      pu.manufacturer_name AS unit_manufacturer,
      pu.is_self_produced AS unit_is_self_produced,
      pu.expiry_date AS unit_current_expiry_date,
      pu.expiry_days AS unit_current_expiry_days
    FROM repair_tickets rt
    LEFT JOIN customers cust ON rt.customer_id = cust.id
    LEFT JOIN products p ON rt.product_id = p.id
    LEFT JOIN product_types pt ON rt.product_type_id = pt.id
    LEFT JOIN product_units pu ON rt.product_unit_id = pu.id
    WHERE ${whereStr}
    ORDER BY rt.id DESC
    LIMIT ? OFFSET ?
  `;

  bindParams.push(limit, offset);
  const { results } = await db.prepare(query).bind(...bindParams).all<any>();

  return {
    tickets: results ?? [],
    total,
  };
}

/** Thống kê nhanh sửa chữa */
export async function getRepairStats(db: D1Database) {
  const stats = await db
    .prepare(`
      SELECT 
        COUNT(CASE WHEN status = 'RECEIVED' THEN 1 END) AS received_count,
        COUNT(CASE WHEN status IN ('DIAGNOSING', 'QUOTED', 'APPROVED', 'REPAIRING') AND repair_location = 'INTERNAL' THEN 1 END) AS internal_repair_count,
        COUNT(CASE WHEN status IN ('REPAIRING', 'SENT_TO_PARTNER') AND repair_location = 'EXTERNAL' THEN 1 END) AS partner_repair_count,
        COUNT(CASE WHEN status = 'TESTING' THEN 1 END) AS testing_count,
        COUNT(CASE WHEN status = 'READY_FOR_RETURN' THEN 1 END) AS ready_return_count,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed_count,
        COUNT(CASE WHEN repair_location = 'EXTERNAL' AND expected_receive_at < date('now') AND actual_received_at IS NULL AND status NOT IN ('COMPLETED', 'CANCELLED') THEN 1 END) AS partner_overdue_count
      FROM repair_tickets
    `)
    .first<{
      received_count: number;
      internal_repair_count: number;
      partner_repair_count: number;
      testing_count: number;
      ready_return_count: number;
      completed_count: number;
      partner_overdue_count: number;
    }>();

  return stats ?? {
    received_count: 0,
    internal_repair_count: 0,
    partner_repair_count: 0,
    testing_count: 0,
    ready_return_count: 0,
    completed_count: 0,
    partner_overdue_count: 0,
  };
}

/** Chi tiết phiếu sửa chữa kèm Events & Items */
export async function getRepairTicketById(db: D1Database, ticketId: number) {
  const ticket = await db
    .prepare(`
      SELECT 
        rt.*,
        cust.name AS customer_name,
        cust.phone AS customer_phone,
        cust.email AS customer_email,
        cust.address AS customer_address,
        cust.customer_code,
        p.name AS product_name,
        p.product_code,
        pt.name AS product_type_name,
        pu.program_code,
        pu.manufacturer_name AS unit_manufacturer,
        pu.is_self_produced AS unit_is_self_produced,
        pu.expiry_date AS unit_current_expiry_date,
        pu.expiry_days AS unit_current_expiry_days
      FROM repair_tickets rt
      LEFT JOIN customers cust ON rt.customer_id = cust.id
      LEFT JOIN products p ON rt.product_id = p.id
      LEFT JOIN product_types pt ON rt.product_type_id = pt.id
      LEFT JOIN product_units pu ON rt.product_unit_id = pu.id
      WHERE rt.id = ?
    `)
    .bind(ticketId)
    .first<any>();

  if (!ticket) return null;

  // Lấy các mốc sự kiện
  const { results: events } = await db
    .prepare('SELECT * FROM repair_events WHERE repair_ticket_id = ? ORDER BY id ASC')
    .bind(ticketId)
    .all<any>();

  // Lấy danh sách linh kiện thay thế đã xuất
  const { results: items } = await db
    .prepare(`
      SELECT 
        ri.*,
        p.name AS product_name,
        p.product_code,
        pt.name AS product_type_name
      FROM repair_items ri
      JOIN products p ON ri.product_id = p.id
      LEFT JOIN product_types pt ON ri.product_type_id = pt.id
      WHERE ri.repair_ticket_id = ?
      ORDER BY ri.id ASC
    `)
    .bind(ticketId)
    .all<any>();

  // Lấy các giao dịch sổ quỹ liên quan đến phiếu sửa này
  const { results: cashTransactions } = await db
    .prepare("SELECT * FROM cash_transactions WHERE reference_type = 'repair_ticket' AND reference_id = ? ORDER BY id ASC")
    .bind(ticketId)
    .all<any>();

  return {
    ticket,
    events: events ?? [],
    items: items ?? [],
    cashTransactions: cashTransactions ?? [],
  };
}

/** Cập nhật thông tin chẩn đoán, đối tác hoặc báo giá phiếu */
export async function updateRepairTicket(
  db: D1Database,
  ticketId: number,
  data: {
    diagnosis?: string;
    repair_location?: 'INTERNAL' | 'EXTERNAL';
    external_partner?: string;
    sent_partner_at?: string;
    expected_receive_at?: string;
    actual_received_at?: string;
    partner_cost_cents?: number;
    repair_price_cents?: number;
    expected_return_at?: string;
    assigned_to?: string;
    note?: string;
    actor_name?: string;
  }
) {
  const sets: string[] = ['updated_at = datetime(\'now\')'];
  const params: any[] = [];

  if (data.diagnosis !== undefined) {
    sets.push('diagnosis = ?');
    params.push(data.diagnosis);
  }
  if (data.repair_location !== undefined) {
    sets.push('repair_location = ?');
    params.push(data.repair_location);
  }
  if (data.external_partner !== undefined) {
    sets.push('external_partner = ?');
    params.push(data.external_partner);
  }
  if (data.sent_partner_at !== undefined) {
    sets.push('sent_partner_at = ?');
    params.push(data.sent_partner_at);
  }
  if (data.expected_receive_at !== undefined) {
    sets.push('expected_receive_at = ?');
    params.push(data.expected_receive_at);
  }
  if (data.actual_received_at !== undefined) {
    sets.push('actual_received_at = ?');
    params.push(data.actual_received_at);
  }
  if (data.partner_cost_cents !== undefined) {
    sets.push('partner_cost_cents = ?');
    params.push(data.partner_cost_cents);
  }
  if (data.repair_price_cents !== undefined) {
    sets.push('repair_price_cents = ?');
    params.push(data.repair_price_cents);
  }
  if (data.expected_return_at !== undefined) {
    sets.push('expected_return_at = ?');
    params.push(data.expected_return_at);
  }
  if (data.assigned_to !== undefined) {
    sets.push('assigned_to = ?');
    params.push(data.assigned_to);
  }
  if (data.note !== undefined) {
    sets.push('note = ?');
    params.push(data.note);
  }

  params.push(ticketId);
  await db.prepare(`UPDATE repair_tickets SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  await db
    .prepare(`
      INSERT INTO repair_events (repair_ticket_id, event_type, note, created_by, created_at)
      VALUES (?, 'UPDATED', 'Cập nhật thông tin xử lý', ?, datetime('now'))
    `)
    .bind(ticketId, data.actor_name ?? 'Kỹ thuật')
    .run();
}

/** Xuất linh kiện kho thay thế cho phiếu sửa chữa */
export { addRepairReplacementItem } from './repairStock.ts';

/** Chuyển đổi trạng thái phiếu sửa chữa & xử lý chu kỳ Key kỹ thuật */
export async function transitionRepairStatus(
  db: D1Database,
  ticketId: number,
  newStatus: string,
  eventNote: string,
  actorName: string,
  options?: {
    service_key?: boolean;
    new_expiry_date?: string;
    new_expiry_days?: number;
  }
) {
  const ticket = await db.prepare('SELECT * FROM repair_tickets WHERE id = ?').bind(ticketId).first<any>();
  if (!ticket) throw new Error('Không tìm thấy phiếu sửa chữa');

  const sets: string[] = ['status = ?', 'updated_at = datetime(\'now\')'];
  const params: any[] = [newStatus];

  if (newStatus === 'COMPLETED' || newStatus === 'READY_FOR_RETURN') {
    sets.push('returned_at = datetime(\'now\')');
  }

  // Xử lý gia hạn key bí mật nếu người dùng có quyền và thực hiện bảo trì chu kỳ
  if (options?.service_key && options?.new_expiry_date && ticket.product_unit_id) {
    sets.push('is_key_serviced = 1', 'new_expiry_date = ?');
    params.push(options.new_expiry_date);

    // Cập nhật vào product_units
    await db
      .prepare('UPDATE product_units SET expiry_date = ?, expiry_days = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(options.new_expiry_date, options.new_expiry_days ?? null, ticket.product_unit_id)
      .run();
  }

  params.push(ticketId);
  await db.prepare(`UPDATE repair_tickets SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  // Cập nhật trạng thái vật lý của mã bộ khi hoàn tất
  if (newStatus === 'COMPLETED' && ticket.product_unit_id) {
    if (ticket.owner_type === 'KGAME') {
      // Hàng KGAME sửa xong nhập lại kho sẵn sàng bán
      await db
        .prepare('UPDATE product_units SET availability = \'IN_STOCK\', updated_at = datetime(\'now\') WHERE id = ?')
        .bind(ticket.product_unit_id)
        .run();
    } else {
      // Hàng khách sửa xong trả khách
      await db
        .prepare('UPDATE product_units SET availability = \'SOLD\', updated_at = datetime(\'now\') WHERE id = ?')
        .bind(ticket.product_unit_id)
        .run();
    }
  }

  // Ghi nhận sự kiện
  await db
    .prepare(`
      INSERT INTO repair_events (repair_ticket_id, event_type, note, created_by, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `)
    .bind(ticketId, newStatus, eventNote || `Chuyển trạng thái sang ${newStatus}`, actorName)
    .run();
}

/** Sinh mã phiếu thu (PT0001) hoặc phiếu chi (PC0001) */
export async function getNextCashTransactionCode(db: D1Database, flowType: 'IN' | 'OUT'): Promise<string> {
  const prefix = flowType === 'IN' ? 'PT' : 'PC';
  const row = await db
    .prepare(`SELECT transaction_code FROM cash_transactions WHERE transaction_code LIKE '${prefix}%' ORDER BY id DESC LIMIT 1`)
    .first<{ transaction_code: string }>();

  if (!row?.transaction_code) return `${prefix}0001`;
  const match = row.transaction_code.match(/^[A-Z]{2}(\d+)$/);
  if (!match) return `${prefix}0001`;
  const nextNum = parseInt(match[1], 10) + 1;
  return `${prefix}${nextNum.toString().padStart(4, '0')}`;
}

export type { RecordCashTransactionInput } from './cashbook.ts';
export { recordCashTransaction } from './cashbook.ts';

/** Thống kê số dư Sổ Quỹ (Tiền mặt, Ngân hàng, Tổng thu/chi trong tháng) */
export async function getCashbookSummary(db: D1Database) {
  // 1. Số dư tiền mặt
  const cashRes = await db
    .prepare(`
      SELECT 
        SUM(CASE WHEN flow_type = 'IN' THEN amount_cents ELSE -amount_cents END) AS balance
      FROM cash_transactions
      WHERE account_type = 'CASH' AND (status IS NULL OR status != 'CANCELLED')
    `)
    .first<{ balance: number }>();

  // 2. Số dư ngân hàng
  const bankRes = await db
    .prepare(`
      SELECT 
        SUM(CASE WHEN flow_type = 'IN' THEN amount_cents ELSE -amount_cents END) AS balance
      FROM cash_transactions
      WHERE account_type = 'BANK' AND (status IS NULL OR status != 'CANCELLED')
    `)
    .first<{ balance: number }>();

  // 3. Tổng thu / chi trong tháng hiện tại
  const monthRes = await db
    .prepare(`
      SELECT 
        SUM(CASE WHEN flow_type = 'IN' THEN amount_cents ELSE 0 END) AS total_income,
        SUM(CASE WHEN flow_type = 'OUT' THEN amount_cents ELSE 0 END) AS total_expense
      FROM cash_transactions
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
        AND (status IS NULL OR status != 'CANCELLED')
    `)
    .first<{ total_income: number; total_expense: number }>();

  const cashBalance = cashRes?.balance ?? 0;
  const bankBalance = bankRes?.balance ?? 0;
  const totalIncomeMonth = monthRes?.total_income ?? 0;
  const totalExpenseMonth = monthRes?.total_expense ?? 0;

  return {
    cash_balance: cashBalance,
    bank_balance: bankBalance,
    total_balance: cashBalance + bankBalance,
    total_income_month: totalIncomeMonth,
    total_expense_month: totalExpenseMonth,
    net_profit_month: totalIncomeMonth - totalExpenseMonth,
  };
}

/** Lấy danh sách giao dịch Sổ Quỹ có lọc và phân trang */
export async function listCashTransactions(
  db: D1Database,
  params: {
    accountType?: string;
    flowType?: string;
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }
) {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const whereClauses: string[] = ['1=1'];
  const bindParams: any[] = [];

  if (params.accountType && params.accountType !== 'ALL') {
    whereClauses.push('account_type = ?');
    bindParams.push(params.accountType);
  }

  if (params.flowType && params.flowType !== 'ALL') {
    whereClauses.push('flow_type = ?');
    bindParams.push(params.flowType);
  }

  if (params.category && params.category !== 'ALL') {
    whereClauses.push('category = ?');
    bindParams.push(params.category);
  }

  if (params.search) {
    const term = `%${params.search.trim()}%`;
    whereClauses.push('(transaction_code LIKE ? OR note LIKE ? OR recipient_name LIKE ?)');
    bindParams.push(term, term, term);
  }

  const whereStr = whereClauses.join(' AND ');

  const countStmt = db.prepare(`SELECT COUNT(*) AS total FROM cash_transactions WHERE ${whereStr}`);
  const countRes = await (bindParams.length > 0 ? countStmt.bind(...bindParams) : countStmt).first<{ total: number }>();
  const total = countRes?.total ?? 0;

  const query = `
    SELECT *
    FROM cash_transactions
    WHERE ${whereStr}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  bindParams.push(limit, offset);
  const { results } = await db.prepare(query).bind(...bindParams).all<any>();

  return {
    transactions: results ?? [],
    total,
  };
}



// ==========================================
// CHẶNG 5: POS ORDERS & SALES TRANSACTIONS
// ==========================================

export async function getNextOrderCode(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT order_code FROM orders WHERE order_code LIKE 'ĐH%' ORDER BY id DESC LIMIT 1")
    .first<{ order_code: string }>();

  if (!row?.order_code) {
    return 'ĐH0001';
  }

  const match = row.order_code.match(/^ĐH(\d+)$/);
  if (!match) {
    return 'ĐH0001';
  }

  const num = parseInt(match[1], 10);
  const nextNum = isNaN(num) ? 1 : num + 1;
  return `ĐH${String(nextNum).padStart(4, '0')}`;
}

export { createPosOrder, addPosOrderPayment, fulfillPreorder } from './pos.ts';

export async function getPosOrderById(db: D1Database, orderId: number) {
  const order = await db
    .prepare(`
      SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
        (SELECT COALESCE(SUM(ce.amount_cents), 0) FROM customer_credit_entries ce WHERE ce.partner_id = c.id) AS customer_credit_cents,
        (SELECT COALESCE(SUM(ce.amount_cents), 0) FROM customer_credit_entries ce WHERE ce.reference_type = 'ORDER_CANCEL' AND ce.reference_id = o.id) AS credit_issued_cents
      FROM orders o
      LEFT JOIN partners c ON o.customer_id = c.id
      WHERE o.id = ?
      LIMIT 1
    `)
    .bind(orderId)
    .first<any>();

  if (!order) return null;

  // Order lines with attached units
  const { results: lines } = await db
    .prepare(`
      SELECT l.*, 
             COALESCE(l.product_name_snapshot, p.name, 'Sản phẩm') AS product_name,
             COALESCE(l.type_name_snapshot, pt.name, 'Tiêu chuẩn') AS product_type_name,
             COALESCE(p.product_code, 'SP') AS product_code,
             p.tracking_mode
      FROM order_lines l
      LEFT JOIN products p ON l.product_id = p.id
      LEFT JOIN product_types pt ON l.product_type_id = pt.id
      WHERE l.order_id = ?
      ORDER BY l.id ASC
    `)
    .bind(orderId)
    .all<any>();

  for (const line of lines || []) {
    const { results: units } = await db
      .prepare(`
        SELECT ou.id AS order_unit_id, u.id AS product_unit_id, u.program_code, u.condition, u.availability
        FROM order_units ou
        JOIN product_units u ON ou.product_unit_id = u.id
        WHERE ou.order_line_id = ?
      `)
      .bind(line.id)
      .all<any>();

    line.units = units || [];
  }

  // Payments
  const { results: payments } = await db
    .prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id ASC')
    .bind(orderId)
    .all<any>();

  // Cash transactions
  const { results: cashTxs } = await db
    .prepare("SELECT * FROM cash_transactions WHERE reference_type = 'ORDER' AND reference_id = ? ORDER BY id ASC")
    .bind(orderId)
    .all<any>();

  // Shipment
  const shipment = await db
    .prepare('SELECT * FROM shipments WHERE order_id = ? ORDER BY id DESC LIMIT 1')
    .bind(orderId)
    .first<any>();

  return {
    ...order,
    lines: lines || [],
    payments: payments || [],
    cash_transactions: cashTxs || [],
    shipment: shipment || null,
  };
}

export async function listPosOrders(
  db: D1Database,
  options: {
    orderType?: string;
    orderStatus?: string;
    paymentStatus?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const whereClauses: string[] = [];
  const bindParams: any[] = [];

  if (options.orderType === 'PREORDER') {
    whereClauses.push("o.order_type = 'PREORDER'");
  } else if (options.orderType === 'SALE') {
    whereClauses.push("(o.order_type != 'PREORDER' OR o.order_type IS NULL)");
  } else {
    whereClauses.push("(o.order_type = 'SALE' OR o.order_code IS NOT NULL)");
  }

  if (options.orderStatus) {
    whereClauses.push('o.order_status = ?');
    bindParams.push(options.orderStatus);
  }

  if (options.paymentStatus) {
    whereClauses.push('o.payment_status = ?');
    bindParams.push(options.paymentStatus);
  }

  if (options.search?.trim()) {
    const s = `%${options.search.trim()}%`;
    whereClauses.push(`(
      o.order_code LIKE ?
      OR c.name LIKE ?
      OR c.phone LIKE ?
      OR EXISTS (
        SELECT 1 FROM order_lines ol
        JOIN order_units ou ON ol.id = ou.order_line_id
        JOIN product_units pu ON ou.product_unit_id = pu.id
        WHERE ol.order_id = o.id AND pu.program_code LIKE ?
      )
    )`);
    bindParams.push(s, s, s, s);
  }

  const whereStr = whereClauses.join(' AND ');

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM orders o
    LEFT JOIN partners c ON o.customer_id = c.id
    WHERE ${whereStr}
  `;
  const countRes = await (bindParams.length > 0 ? db.prepare(countQuery).bind(...bindParams) : db.prepare(countQuery))
    .first<{ total: number }>();
  const total = countRes?.total ?? 0;

  const query = `
    SELECT 
      o.*,
      c.name AS customer_name,
      c.phone AS customer_phone,
      s.carrier,
      s.bus_station,
      s.bus_plate,
      (SELECT COUNT(*) FROM order_lines WHERE order_id = o.id) AS item_count
    FROM orders o
    LEFT JOIN partners c ON o.customer_id = c.id
    LEFT JOIN shipments s ON s.order_id = o.id
    WHERE ${whereStr}
    ORDER BY o.id DESC
    LIMIT ? OFFSET ?
  `;

  bindParams.push(limit, offset);
  const { results } = await db.prepare(query).bind(...bindParams).all<any>();

  return {
    orders: results || [],
    total,
  };
}

export { updatePosOrderStatus } from './orderStatus.ts';

// ==========================================
// CUSTOMER 360 & 3-TIER ADDRESS STANDARDIZATION
// ==========================================

export async function getNextCustomerCode(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT customer_code FROM customers WHERE customer_code LIKE 'KH%' ORDER BY id DESC LIMIT 1")
    .first<{ customer_code: string }>();

  if (!row?.customer_code) return 'KH0001';

  const match = row.customer_code.match(/^KH(\d+)$/);
  if (!match) return 'KH0001';

  const num = parseInt(match[1], 10);
  const nextNum = isNaN(num) ? 1 : num + 1;
  return `KH${String(nextNum).padStart(4, '0')}`;
}

export interface ListPartnersOptions {
  type?: 'ALL' | 'CUSTOMER' | 'SUPPLIER';
  search?: string;
  q?: string;
  hasDebt?: boolean;
  limit?: number;
  offset?: number;
}

export async function listPartners(db: D1Database, options: ListPartnersOptions = {}) {
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  const whereClauses: string[] = [];
  const bindParams: any[] = [];

  const type = options.type || 'ALL';
  if (type === 'CUSTOMER') {
    whereClauses.push('p.is_customer = 1');
  } else if (type === 'SUPPLIER') {
    whereClauses.push('p.is_supplier = 1');
  }

  const searchTerm = (options.q || options.search || '').trim();
  if (searchTerm) {
    whereClauses.push('(p.name LIKE ? OR p.phone LIKE ? OR p.partner_code LIKE ? OR p.email LIKE ?)');
    const s = `%${searchTerm}%`;
    bindParams.push(s, s, s, s);
  }

  const whereStr = whereClauses.length > 0 ? whereClauses.join(' AND ') : '1=1';

  const countQuery = `SELECT COUNT(*) as total FROM partners p WHERE ${whereStr}`;
  const countRes = await (bindParams.length > 0 ? db.prepare(countQuery).bind(...bindParams) : db.prepare(countQuery))
    .first<{ total: number }>();
  const total = countRes?.total ?? 0;

  const query = `
    SELECT 
      p.*,
      ${partnerRepairDebtExpression} AS repair_debt_cents,
      (SELECT COALESCE(SUM(ce.amount_cents), 0) FROM customer_credit_entries ce WHERE ce.partner_id = p.id) AS customer_credit_cents,
      p.partner_code AS customer_code,
      p.partner_code AS supplier_code,
      COALESCE((
        SELECT SUM(o.amount_total_cents - COALESCE(o.returned_amount_cents,0)) 
        FROM orders o 
        WHERE o.customer_id = p.id 
          AND (o.order_type = 'ORDER' OR (o.order_type = 'PREORDER' AND o.order_status = 'COMPLETED'))
          AND o.order_status != 'CANCELLED'
      ), 0) AS total_sales_cents,
      COALESCE((
        SELECT SUM(o.cod_amount_cents) 
        FROM orders o 
        WHERE o.customer_id = p.id 
          AND (o.order_type = 'ORDER' OR (o.order_type = 'PREORDER' AND o.order_status = 'COMPLETED'))
          AND o.order_status != 'CANCELLED'
      ), 0) AS receivable_debt_cents,
      COALESCE((
        SELECT SUM(o.cod_amount_cents) 
        FROM orders o 
        WHERE o.customer_id = p.id 
          AND (o.order_type = 'ORDER' OR (o.order_type = 'PREORDER' AND o.order_status = 'COMPLETED'))
          AND o.order_status != 'CANCELLED'
      ), 0) AS current_debt_cents,
      COALESCE((
        SELECT SUM(pr.total_amount_cents - COALESCE(pr.returned_amount_cents,0)) 
        FROM purchase_receipts pr 
        WHERE pr.supplier_id = p.id 
          AND pr.receipt_status != 'CANCELLED'
      ), 0) AS total_purchase_cents,
      COALESCE((SELECT SUM(ro.amount_cents-ro.settled_cents) FROM kgame_refund_obligations ro WHERE ro.source_type='PURCHASE' AND ro.partner_id=p.id),0) AS supplier_pending_refund_cents,
      COALESCE((
        SELECT SUM(pr.debt_amount_cents) 
        FROM purchase_receipts pr 
        WHERE pr.supplier_id = p.id 
          AND pr.receipt_status != 'CANCELLED'
      ), 0) AS payable_debt_cents,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = p.id) AS order_count,
      (SELECT COUNT(*) FROM purchase_receipts pr WHERE pr.supplier_id = p.id AND pr.receipt_status != 'CANCELLED') AS purchase_count,
      (SELECT COUNT(*) FROM repair_tickets rt WHERE rt.customer_id = p.id) AS repair_count
    FROM partners p
    WHERE ${whereStr}
    ORDER BY p.id DESC
    LIMIT ? OFFSET ?
  `;

  bindParams.push(limit, offset);
  const { results } = await db.prepare(query).bind(...bindParams).all<any>();

  let partners = (results || []).map((partner: any) => ({ ...partner,
    receivable_debt_cents: (partner.receivable_debt_cents || 0) + (partner.repair_debt_cents || 0),
    current_debt_cents: (partner.current_debt_cents || 0) + (partner.repair_debt_cents || 0),
  }));

  if (options.hasDebt) {
    if (type === 'SUPPLIER') {
      partners = partners.filter((p: any) => (p.payable_debt_cents || 0) > 0);
    } else {
      partners = partners.filter((p: any) => (p.receivable_debt_cents || 0) > 0 || (p.payable_debt_cents || 0) > 0);
    }
  }

  return {
    partners,
    customers: partners,
    total,
  };
}

export const listCustomers = (db: D1Database, options: any = {}) => listPartners(db, { ...options, type: 'CUSTOMER' });
export const listKgameCustomers = listCustomers;

export async function getPartnerDetailsWithHistory(db: D1Database, partnerId: number) {
  const partner = await db
    .prepare(`
      SELECT 
        p.*,
      ${partnerRepairDebtExpression} AS repair_debt_cents,
      (SELECT COALESCE(SUM(ce.amount_cents), 0) FROM customer_credit_entries ce WHERE ce.partner_id = p.id) AS customer_credit_cents,
        p.partner_code AS customer_code,
        p.partner_code AS supplier_code,
        COALESCE((
          SELECT SUM(o.amount_total_cents - COALESCE(o.returned_amount_cents,0)) 
          FROM orders o 
          WHERE o.customer_id = p.id 
            AND (o.order_type = 'ORDER' OR (o.order_type = 'PREORDER' AND o.order_status = 'COMPLETED'))
            AND o.order_status != 'CANCELLED'
        ), 0) AS total_sales_cents,
        COALESCE((
          SELECT SUM(o.paid_amount_cents) 
          FROM orders o 
          WHERE o.customer_id = p.id 
            AND o.order_status != 'CANCELLED'
        ), 0) AS total_paid_cents,
        COALESCE((
          SELECT SUM(o.cod_amount_cents) 
          FROM orders o 
          WHERE o.customer_id = p.id 
            AND (o.order_type = 'ORDER' OR (o.order_type = 'PREORDER' AND o.order_status = 'COMPLETED'))
            AND o.order_status != 'CANCELLED'
        ), 0) AS receivable_debt_cents,
        COALESCE((
          SELECT SUM(o.cod_amount_cents) 
          FROM orders o 
          WHERE o.customer_id = p.id 
            AND (o.order_type = 'ORDER' OR (o.order_type = 'PREORDER' AND o.order_status = 'COMPLETED'))
            AND o.order_status != 'CANCELLED'
        ), 0) AS current_debt_cents,
        COALESCE((
          SELECT SUM(pr.total_amount_cents - COALESCE(pr.returned_amount_cents,0)) 
          FROM purchase_receipts pr 
          WHERE pr.supplier_id = p.id 
            AND pr.receipt_status != 'CANCELLED'
        ), 0) AS total_purchase_cents,
      COALESCE((SELECT SUM(ro.amount_cents-ro.settled_cents) FROM kgame_refund_obligations ro WHERE ro.source_type='PURCHASE' AND ro.partner_id=p.id),0) AS supplier_pending_refund_cents,
        COALESCE((
          SELECT SUM(pr.debt_amount_cents) 
          FROM purchase_receipts pr 
          WHERE pr.supplier_id = p.id 
            AND pr.receipt_status != 'CANCELLED'
        ), 0) AS payable_debt_cents
      FROM partners p
      WHERE p.id = ?
      LIMIT 1
    `)
    .bind(partnerId)
    .first<any>();

  if (!partner) return null;
  partner.receivable_debt_cents += partner.repair_debt_cents || 0;
  partner.current_debt_cents += partner.repair_debt_cents || 0;

  // 1. Orders (Bán hàng & Đặt hàng)
  const { results: orders } = await db
    .prepare(`
      SELECT o.*, s.carrier, s.bus_station
      FROM orders o
      LEFT JOIN shipments s ON s.order_id = o.id
      WHERE o.customer_id = ?
      ORDER BY o.id DESC LIMIT 25
    `)
    .bind(partnerId)
    .all<any>();

  // 2. Repairs (Sửa chữa)
  const { results: repairs } = await db
    .prepare(`
      SELECT rt.*, ${repairPaidExpression} AS paid_amount_cents, ${repairDebtExpression} AS debt_amount_cents, pu.program_code
      FROM repair_tickets rt
      LEFT JOIN product_units pu ON rt.product_unit_id = pu.id
      WHERE rt.customer_id = ? AND ${repairCustomerMatches}
      ORDER BY rt.id DESC LIMIT 25
    `)
    .bind(partnerId)
    .all<any>();

  // 3. Purchases (Nhập hàng từ đối tác)
  const { results: purchases } = await db
    .prepare(`
      SELECT pr.*
      FROM purchase_receipts pr
      WHERE pr.supplier_id = ?
      ORDER BY pr.id DESC LIMIT 25
    `)
    .bind(partnerId)
    .all<any>();

  // 4. Cash transactions (Sổ Quỹ liên quan)
  const { results: cashTxs } = await db
    .prepare(`
      SELECT ct.*
      FROM cash_transactions ct
      WHERE ((UPPER(ct.reference_type) = 'ORDER' AND ct.reference_id IN (SELECT id FROM orders WHERE customer_id = ?))
         OR (LOWER(ct.reference_type) IN ('repair','repair_ticket') AND ct.reference_id IN (SELECT rt.id FROM repair_tickets rt WHERE rt.customer_id = ? AND ${repairCustomerMatches}))
         OR (LOWER(ct.reference_type) = 'purchase_receipt' AND ct.reference_id IN (SELECT id FROM purchase_receipts WHERE supplier_id = ?)))
        AND (ct.status IS NULL OR ct.status != 'CANCELLED')
      ORDER BY ct.id DESC LIMIT 25
    `)
    .bind(partnerId, partnerId, partnerId)
    .all<any>();

  const { results: creditEntries } = await db.prepare('SELECT * FROM customer_credit_entries WHERE partner_id = ? ORDER BY id DESC LIMIT 25').bind(partnerId).all<any>();

  return {
    credit_entries: creditEntries || [],
    partner,
    customer: partner,
    orders: orders || [],
    repairs: repairs || [],
    purchases: purchases || [],
    receipts: purchases || [],
    cash_transactions: cashTxs || [],
    cashTransactions: cashTxs || [],
  };
}

export const getCustomerDetailsWithHistory = getPartnerDetailsWithHistory;

export async function savePartner(
  db: D1Database,
  data: {
    id?: number | null;
    name: string;
    phone?: string | null;
    email?: string | null;
    tax_code?: string | null;
    note?: string | null;
    province?: string | null;
    ward?: string | null;
    address_detail?: string | null;
    is_customer?: boolean;
    is_supplier?: boolean;
  }
) {
  const fullAddress = [data.address_detail?.trim(), data.ward?.trim(), data.province?.trim()]
    .filter(Boolean)
    .join(', ');

  const isCust = data.is_customer !== false ? 1 : 0;
  const isSupp = data.is_supplier ? 1 : 0;

  if (data.id) {
    await db
      .prepare(`
        UPDATE partners
        SET name = ?, phone = ?, email = ?, tax_code = ?, note = ?,
            province = ?, ward = ?, address_detail = ?, address = ?,
            is_customer = ?, is_supplier = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(
        data.name.trim(),
        data.phone?.trim() || null,
        data.email?.trim() || null,
        data.tax_code?.trim() || null,
        data.note?.trim() || null,
        data.province?.trim() || null,
        data.ward?.trim() || null,
        data.address_detail?.trim() || null,
        fullAddress || null,
        isCust,
        isSupp,
        data.id
      )
      .run();

    return { id: data.id, partner_code: '', customer_code: '' };
  } else {
    // Check trùng số điện thoại
    if (data.phone?.trim()) {
      const existing = await db
        .prepare('SELECT id, partner_code, is_customer, is_supplier FROM partners WHERE phone = ? LIMIT 1')
        .bind(data.phone.trim())
        .first<any>();

      if (existing) {
        // Tự động kích hoạt thêm role nếu có
        let updated = false;
        let newCust = existing.is_customer;
        let newSupp = existing.is_supplier;
        if (isCust && !existing.is_customer) { newCust = 1; updated = true; }
        if (isSupp && !existing.is_supplier) { newSupp = 1; updated = true; }

        if (updated) {
          await db
            .prepare('UPDATE partners SET is_customer = ?, is_supplier = ?, updated_at = datetime(\'now\') WHERE id = ?')
            .bind(newCust, newSupp, existing.id)
            .run();
        }

        return { id: existing.id, partner_code: existing.partner_code, existed: true };
      }
    }

    // Sinh mã đối tác: KH... (nếu chỉ là khách), NCC... (nếu chỉ là NCC), hoặc DT... (nếu cả 2)
    let prefix = 'DT';
    if (isCust && !isSupp) prefix = 'KH';
    else if (isSupp && !isCust) prefix = 'NCC';

    const lastRow = await db
      .prepare(`SELECT partner_code FROM partners WHERE partner_code LIKE ? ORDER BY id DESC LIMIT 1`)
      .bind(`${prefix}%`)
      .first<{ partner_code: string }>();

    let nextNum = 1;
    if (lastRow?.partner_code) {
      const m = lastRow.partner_code.match(new RegExp(`^${prefix}(\\d+)$`));
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    const partnerCode = `${prefix}${nextNum.toString().padStart(4, '0')}`;

    const ins = await db
      .prepare(`
        INSERT INTO partners (
          partner_code, name, phone, email, tax_code, note,
          province, ward, address_detail, address,
          is_customer, is_supplier,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          datetime('now'), datetime('now')
        )
      `)
      .bind(
        partnerCode,
        data.name.trim(),
        data.phone?.trim() || null,
        data.email?.trim() || null,
        data.tax_code?.trim() || null,
        data.note?.trim() || null,
        data.province?.trim() || null,
        data.ward?.trim() || null,
        data.address_detail?.trim() || null,
        fullAddress || null,
        isCust,
        isSupp
      )
      .run();

    return { id: ins.meta.last_row_id, partner_code: partnerCode, customer_code: partnerCode };
  }
}

export const saveCustomer = (db: D1Database, data: any) => savePartner(db, { ...data, is_customer: true });

/** -------------------------------------------------------------
 * PHÂN HỆ THU MUA MÁY CŨ & LINH KIỆN CŨ (BUYBACK)
 * ------------------------------------------------------------- */

export async function getNextBuybackCode(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT buyback_code FROM buybacks WHERE buyback_code LIKE 'TM%' ORDER BY id DESC LIMIT 1")
    .first<{ buyback_code: string }>();

  if (!row?.buyback_code) return 'TM0001';
  const match = row.buyback_code.match(/^TM(\d+)$/);
  if (!match) return 'TM0001';
  const num = parseInt(match[1], 10);
  const nextNum = isNaN(num) ? 1 : num + 1;
  return `TM${String(nextNum).padStart(4, '0')}`;
}

export interface BuybackListItem {
  id: number;
  buyback_code: string;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  customer_code: string;
  total_amount_cents: number;
  paid_amount_cents: number;
  status: string;
  note: string | null;
  payment_method: string | null;
  bank_account: string | null;
  cash_transaction_id: number | null;
  cash_transaction_code: string | null;
  created_at: string;
  item_count: number;
  total_quantity: number;
}

export async function getBuybacksList(
  db: D1Database,
  filter?: { search?: string; status?: string }
): Promise<BuybackListItem[]> {
  let whereClauses: string[] = ['1=1'];
  const binds: any[] = [];

  if (filter?.status && filter.status !== 'ALL') {
    whereClauses.push('b.status = ?');
    binds.push(filter.status);
  }

  if (filter?.search) {
    const s = `%${filter.search.trim()}%`;
    whereClauses.push('(b.buyback_code LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR b.note LIKE ?)');
    binds.push(s, s, s, s);
  }

  const query = `
    SELECT 
      b.id,
      b.buyback_code,
      b.customer_id,
      c.name AS customer_name,
      c.phone AS customer_phone,
      c.customer_code,
      b.total_amount_cents,
      b.paid_amount_cents,
      b.status,
      b.note,
      b.payment_method,
      b.bank_account,
      b.cash_transaction_id,
      ct.transaction_code AS cash_transaction_code,
      b.created_at,
      COUNT(bi.id) AS item_count,
      COALESCE(SUM(bi.quantity), 0) AS total_quantity
    FROM buybacks b
    LEFT JOIN customers c ON b.customer_id = c.id
    LEFT JOIN cash_transactions ct ON b.cash_transaction_id = ct.id
    LEFT JOIN buyback_items bi ON b.id = bi.buyback_id
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY b.id
    ORDER BY b.id DESC
  `;

  const stmt = db.prepare(query);
  const res = binds.length > 0 ? await stmt.bind(...binds).all<BuybackListItem>() : await stmt.all<BuybackListItem>();
  return res.results || [];
}

export async function getBuybackKpi(db: D1Database) {
  const row = await db
    .prepare(`
      SELECT 
        COUNT(b.id) AS total_buybacks,
        COALESCE(SUM(CASE WHEN b.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed_count,
        COALESCE(SUM(b.total_amount_cents), 0) AS total_spent_cents,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', b.created_at) = strftime('%Y-%m', 'now') THEN b.total_amount_cents ELSE 0 END), 0) AS month_spent_cents,
        (SELECT COUNT(id) FROM buyback_items) AS total_items_count
      FROM buybacks b
    `)
    .first<{
      total_buybacks: number;
      completed_count: number;
      total_spent_cents: number;
      month_spent_cents: number;
      total_items_count: number;
    }>();

  return row || {
    total_buybacks: 0,
    completed_count: 0,
    total_spent_cents: 0,
    month_spent_cents: 0,
    total_items_count: 0
  };
}

export async function getBuybackById(db: D1Database, id: number) {
  const buyback = await db
    .prepare(`
      SELECT 
        b.*,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        c.address AS customer_address,
        c.customer_code,
        ct.transaction_code AS cash_transaction_code,
        ct.account_type AS cash_account_type
      FROM buybacks b
      LEFT JOIN customers c ON b.customer_id = c.id
      LEFT JOIN cash_transactions ct ON b.cash_transaction_id = ct.id
      WHERE b.id = ?
      LIMIT 1
    `)
    .bind(id)
    .first<any>();

  if (!buyback) return null;

  const { results: items } = await db
    .prepare(`
      SELECT 
        bi.*,
        p.name AS product_name,
        p.product_code,
        p.tracking_mode,
        pt.name AS type_name,
        pu.program_code
      FROM buyback_items bi
      JOIN products p ON bi.product_id = p.id
      LEFT JOIN product_types pt ON bi.product_type_id = pt.id
      LEFT JOIN product_units pu ON bi.product_unit_id = pu.id
      WHERE bi.buyback_id = ?
      ORDER BY bi.id ASC
    `)
    .bind(id)
    .all<any>();

  return {
    ...buyback,
    items: items || []
  };
}

export interface CreateBuybackInput {
  customer_id?: number;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  payment_method: 'CASH' | 'BANK';
  bank_account?: string;
  note?: string;
  items: Array<{
    product_id: number;
    product_type_id: number;
    product_unit_id?: number | null;
    program_code?: string | null;
    condition: 'QSD';
    condition_note?: string;
    quantity: number;
    purchase_price_cents: number;
  }>;
}

export async function createBuyback(
  db: D1Database,
  input: CreateBuybackInput
): Promise<{ id: number; buyback_code: string; cash_code?: string }> {
  let customerId = input.customer_id ?? null;
  let customerName = input.customer_name?.trim() || '';
  let customerPhone = input.customer_phone?.trim() || '';
  let customerAddress = input.customer_address?.trim() || '';

  // 1. Tự động liên kết / tạo khách hàng nếu cần
  if (!customerId && (customerName || customerPhone)) {
    if (customerPhone) {
      const existing = await db
        .prepare('SELECT id, name, address FROM customers WHERE phone = ? LIMIT 1')
        .bind(customerPhone)
        .first<{ id: number; name: string; address: string | null }>();

      if (existing) {
        customerId = existing.id;
        if (!existing.address && customerAddress) {
          await db.prepare('UPDATE customers SET address = ? WHERE id = ?').bind(customerAddress, existing.id).run();
        }
      } else {
        const custCode = await getNextCustomerCode(db);
        const ins = await db
          .prepare('INSERT INTO customers (customer_code, name, phone, address, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))')
          .bind(custCode, customerName || 'Khách bán thanh lý', customerPhone, customerAddress || null)
          .run();
        customerId = ins.meta.last_row_id;
      }
    } else {
      const custCode = await getNextCustomerCode(db);
      const ins = await db
        .prepare('INSERT INTO customers (customer_code, name, phone, address, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))')
        .bind(custCode, customerName || 'Khách bán thanh lý', null, customerAddress || null)
        .run();
      customerId = ins.meta.last_row_id;
    }
  }

  // 2. Tính tổng tiền chi thu mua
  let totalAmountCents = 0;
  for (const it of input.items) {
    totalAmountCents += (it.quantity || 1) * (it.purchase_price_cents || 0);
  }

  const buybackCode = await getNextBuybackCode(db);

  // 3. Tạo phiếu thu mua
  const resBuyback = await db
    .prepare(`
      INSERT INTO buybacks (
        buyback_code, customer_id, total_amount_cents, paid_amount_cents,
        payment_method, bank_account, status, note, created_by, created_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, 'COMPLETED', ?, 'Kỹ thuật Kgame', datetime('now')
      )
    `)
    .bind(
      buybackCode,
      customerId,
      totalAmountCents,
      totalAmountCents,
      input.payment_method,
      input.bank_account || null,
      input.note || null
    )
    .run();

  const buybackId = resBuyback.meta.last_row_id;

  // 4. Xử lý từng món hàng thu mua:
  for (const it of input.items) {
    let unitId = it.product_unit_id ?? null;

    // Nếu là máy có mã bộ nhưng chưa có trong DB (khách mua từ nguồn ngoài mang đến)
    if (!unitId && it.program_code && it.program_code.trim()) {
      const pCode = it.program_code.trim();
      // Kiểm tra xem mã này đã tồn tại chưa
      const existingUnit = await db
        .prepare('SELECT id FROM product_units WHERE program_code = ? LIMIT 1')
        .bind(pCode)
        .first<{ id: number }>();

      if (existingUnit) {
        unitId = existingUnit.id;
        await db
          .prepare("UPDATE product_units SET availability = 'IN_STOCK', condition = 'QSD', updated_at = datetime('now') WHERE id = ?")
          .bind(unitId)
          .run();
      } else {
        const insUnit = await db
          .prepare(`
            INSERT INTO product_units (
              product_type_id, program_code, availability, condition,
              is_self_produced, note, created_at, updated_at
            ) VALUES (
              ?, ?, 'IN_STOCK', 'QSD',
              0, ?, datetime('now'), datetime('now')
            )
          `)
          .bind(it.product_type_id, pCode, it.condition_note || 'Thu mua máy cũ từ khách')
          .run();
        unitId = insUnit.meta.last_row_id;
      }
    } else if (unitId) {
      // Mã bộ đã từng có trong DB (máy Kgame từng bán): chuyển lại về kho IN_STOCK
      await db
        .prepare("UPDATE product_units SET availability = 'IN_STOCK', condition = 'QSD', updated_at = datetime('now') WHERE id = ?")
        .bind(unitId)
        .run();
    }

    // Ghi vào buyback_items
    await db
      .prepare(`
        INSERT INTO buyback_items (
          buyback_id, product_id, product_type_id, product_unit_id,
          quantity, condition, condition_note, purchase_price_cents
        ) VALUES (
          ?, ?, ?, ?,
          ?, 'QSD', ?, ?
        )
      `)
      .bind(
        buybackId,
        it.product_id,
        it.product_type_id,
        unitId,
        it.quantity || 1,
        it.condition_note || null,
        it.purchase_price_cents
      )
      .run();

    // Cập nhật Sổ kho thực tế (Append-Only)
    await db
      .prepare(`
        INSERT INTO inventory_transactions (
          product_id, product_type_id, product_unit_id, condition, quantity,
          transaction_type, reference_type, reference_id, unit_cost_cents, note, created_at
        ) VALUES (
          ?, ?, ?, 'QSD', ?,
          'BUYBACK', 'buyback', ?, ?, ?, datetime('now')
        )
      `)
      .bind(
        it.product_id,
        it.product_type_id,
        unitId,
        it.quantity || 1,
        buybackId,
        it.purchase_price_cents,
        it.condition_note || `Thu mua hàng cũ phiếu ${buybackCode}`
      )
      .run();

    // Nếu là hàng số lượng (Linh kiện / Phụ kiện không gắn mã bộ), tăng tồn kho QSD
    if (!unitId && it.product_type_id) {
      await db
        .prepare('UPDATE product_types SET cached_stock_used = cached_stock_used + ? WHERE id = ?')
        .bind(it.quantity || 1, it.product_type_id)
        .run();
    }
  }

  // 5. Tự động sinh Phiếu Chi Sổ Quỹ (Cashbook)
  let cashCode: string | undefined = undefined;
  if (totalAmountCents > 0) {
    const cashRes = await recordCashTransaction(db, {
      flow_type: 'OUT',
      account_type: input.payment_method,
      amount_cents: totalAmountCents,
      category: 'BUYBACK',
      reference_type: 'buyback',
      reference_id: buybackId,
      bank_name: input.bank_account || null,
      recipient_name: customerName || 'Khách thanh lý',
      note: `Chi tiền thu mua máy cũ phiếu ${buybackCode}${input.note ? ' - ' + input.note : ''}`,
      created_by: 'Kỹ thuật Kgame'
    });

    cashCode = cashRes.transaction_code;

    await db
      .prepare('UPDATE buybacks SET cash_transaction_id = ? WHERE id = ?')
      .bind(cashRes.id, buybackId)
      .run();
  }

  return {
    id: buybackId,
    buyback_code: buybackCode,
    cash_code: cashCode
  };
}

/** -------------------------------------------------------------
 * PHÂN HỆ NHẬP HÀNG (PURCHASES / GOODS RECEIPTS) CHUẨN KIOTVIET
 * ------------------------------------------------------------- */

export async function getNextPurchaseReceiptCode(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT receipt_code FROM purchase_receipts WHERE receipt_code LIKE 'PN%' ORDER BY id DESC LIMIT 1")
    .first<{ receipt_code: string }>();

  if (!row?.receipt_code) return 'PN0001';
  const match = row.receipt_code.match(/^PN(\d+)$/);
  if (!match) return 'PN0001';
  const num = parseInt(match[1], 10);
  const nextNum = isNaN(num) ? 1 : num + 1;
  return `PN${String(nextNum).padStart(4, '0')}`;
}

export interface PurchaseReceiptListItem {
  id: number;
  receipt_code: string;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_phone: string | null;
  supplier_code: string | null;
  pending_refund_cents: number;
  total_amount_cents: number;
  paid_amount_cents: number;
  debt_amount_cents: number;
  discount_cents: number;
  extra_fee_cents: number;
  extra_fee_category: string | null;
  other_fee_cents: number;
  other_fee_category: string | null;
  invoice_number: string | null;
  order_receipt_code: string | null;
  receipt_status: string;
  payment_method: string | null;
  bank_name: string | null;
  cash_transaction_id: number | null;
  cash_transaction_code: string | null;
  note: string | null;
  created_at: string;
  completed_at: string | null;
  item_count: number;
  total_quantity: number;
}

export async function listPurchaseReceipts(
  db: D1Database,
  filter?: { search?: string; status?: string }
): Promise<PurchaseReceiptListItem[]> {
  let whereClauses: string[] = ['1=1'];
  const binds: any[] = [];

  if (filter?.status && filter.status !== 'ALL') {
    whereClauses.push('pr.receipt_status = ?');
    binds.push(filter.status);
  }

  if (filter?.search) {
    const s = `%${filter.search.trim()}%`;
    whereClauses.push('(pr.receipt_code LIKE ? OR s.name LIKE ? OR s.phone LIKE ? OR s.partner_code LIKE ? OR pr.note LIKE ? OR pr.order_receipt_code LIKE ? OR pr.invoice_number LIKE ?)');
    binds.push(s, s, s, s, s, s, s);
  }

  const query = `
    SELECT 
      pr.id,
      pr.receipt_code,
      pr.supplier_id,
      COALESCE(s.name, 'Nhà cung cấp lẻ') AS supplier_name,
      s.phone AS supplier_phone,
      s.partner_code AS supplier_code,
      COALESCE((SELECT amount_cents-settled_cents FROM kgame_refund_obligations WHERE source_type='PURCHASE' AND source_id=pr.id),0) AS pending_refund_cents,
      pr.total_amount_cents,
      pr.paid_amount_cents,
      pr.debt_amount_cents,
      pr.discount_cents,
      pr.extra_fee_cents,
      pr.extra_fee_category,
      pr.other_fee_cents,
      pr.other_fee_category,
      pr.invoice_number,
      pr.order_receipt_code,
      pr.receipt_status,
      pr.payment_method,
      pr.bank_name,
      pr.cash_transaction_id,
      ct.transaction_code AS cash_transaction_code,
      pr.note,
      pr.created_at,
      pr.completed_at,
      COUNT(pi.id) AS item_count,
      COALESCE(SUM(pi.quantity), 0) AS total_quantity
    FROM purchase_receipts pr
    LEFT JOIN partners s ON pr.supplier_id = s.id
    LEFT JOIN cash_transactions ct ON pr.cash_transaction_id = ct.id
    LEFT JOIN purchase_items pi ON pr.id = pi.receipt_code_id
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY pr.id
    ORDER BY pr.id DESC
  `;

  const stmt = db.prepare(query);
  const res = binds.length > 0 ? await stmt.bind(...binds).all<PurchaseReceiptListItem>() : await stmt.all<PurchaseReceiptListItem>();
  return res.results || [];
}

export async function getPurchaseKpi(db: D1Database) {
  const row = await db
    .prepare(`
      SELECT 
        COUNT(CASE WHEN pr.receipt_status != 'CANCELLED' THEN 1 END) AS total_receipts,
        COUNT(CASE WHEN pr.receipt_status = 'CANCELLED' THEN 1 END) AS cancelled_receipts,
        COUNT(CASE WHEN pr.receipt_status = 'DRAFT' THEN 1 END) AS draft_receipts,
        COUNT(CASE WHEN pr.receipt_status = 'COMPLETED' THEN 1 END) AS completed_receipts,
        COALESCE(SUM(CASE WHEN pr.receipt_status = 'COMPLETED' THEN pr.total_amount_cents ELSE 0 END), 0) AS total_spent_cents,
        COALESCE(SUM(CASE WHEN pr.receipt_status != 'CANCELLED' THEN pr.debt_amount_cents ELSE 0 END), 0) AS total_debt_cents,
        COALESCE(SUM(CASE WHEN pr.receipt_status = 'COMPLETED' AND strftime('%Y-%m', pr.created_at) = strftime('%Y-%m', 'now') THEN pr.total_amount_cents ELSE 0 END), 0) AS month_spent_cents,
        (SELECT COALESCE(SUM(pi.quantity), 0) FROM purchase_items pi JOIN purchase_receipts pr2 ON pi.receipt_code_id = pr2.id WHERE pr2.receipt_status = 'COMPLETED') AS total_items_count
      FROM purchase_receipts pr
    `)
    .first<{
      total_receipts: number;
      cancelled_receipts: number;
      draft_receipts: number;
      completed_receipts: number;
      total_spent_cents: number;
      total_debt_cents: number;
      month_spent_cents: number;
      total_items_count: number;
    }>();

  return row || {
    total_receipts: 0,
    cancelled_receipts: 0,
    draft_receipts: 0,
    completed_receipts: 0,
    total_spent_cents: 0,
    total_debt_cents: 0,
    month_spent_cents: 0,
    total_items_count: 0
  };
}

export async function getPurchaseReceiptById(db: D1Database, id: number) {
  const receipt = await db
    .prepare(`
      SELECT 
        pr.*,
        s.name AS supplier_name,
        s.phone AS supplier_phone,
        s.address AS supplier_address,
        s.partner_code AS supplier_code,
        ct.transaction_code AS cash_transaction_code,
        ct.account_type AS cash_account_type
      FROM purchase_receipts pr
      LEFT JOIN partners s ON pr.supplier_id = s.id
      LEFT JOIN cash_transactions ct ON pr.cash_transaction_id = ct.id
      WHERE pr.id = ?
      LIMIT 1
    `)
    .bind(id)
    .first<any>();

  if (!receipt) return null;

  const { results: items } = await db
    .prepare(`
      SELECT 
        pi.*,
        p.name AS product_name,
        p.product_code,
        p.has_serial,
        p.tracking_mode,
        p.unit_name,
        pt.name AS type_name,
        pu.program_code AS unit_program_code
      FROM purchase_items pi
      JOIN products p ON pi.product_id = p.id
      LEFT JOIN product_types pt ON pi.product_type_id = pt.id
      LEFT JOIN product_units pu ON pi.product_unit_id = pu.id
      WHERE pi.receipt_code_id = ?
      ORDER BY pi.id ASC
    `)
    .bind(id)
    .all<any>();

  const { results: cashTransactions } = await db
    .prepare(`
      SELECT * FROM cash_transactions 
      WHERE (reference_type = 'purchase_receipt' OR reference_type = 'purchase_receipt_other_fee' OR reference_type = 'purchase_receipt_cancelled')
        AND reference_id = ?
      ORDER BY id ASC
    `)
    .bind(id)
    .all<any>();

  return {
    ...receipt,
    items: items || [],
    cash_transactions: cashTransactions || []
  };
}

export interface CreatePurchaseReceiptInput {
  created_by?: string;
  request_id?: string;
  id?: number | null; // Cho phép sửa phiếu nếu có id
  supplier_id?: number | null;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  supplier_address?: string | null;
  discount_cents?: number;
  extra_fee_cents?: number;
  extra_fee_category?: string | null;
  other_fee_cents?: number;
  other_fee_category?: string | null;
  other_fee_note?: string | null;
  invoice_number?: string | null;
  order_receipt_code?: string | null;
  paid_amount_cents: number;
  payment_method: 'CASH' | 'BANK' | 'DEBT';
  bank_name?: string | null;
  note?: string | null;
  receipt_status?: 'COMPLETED' | 'DRAFT';
  items: Array<{
    id?: number;
    product_id: number;
    product_type_id?: number | null;
    condition: 'NEW' | 'QSD';
    program_code?: string | null;
    quantity: number;
    unit_cost_cents: number;
    discount_cents?: number;
    item_note?: string | null;
  }>;
}

export { createPurchaseReceipt } from './purchaseCreate.ts';

/** Chuyển phiếu tạm (Đặt hàng nhập) sang Hoàn thành & Nhập kho */
export { completePurchaseReceipt } from './purchaseCompletion.ts';

/** Hủy phiếu nhập hàng: Hoàn nguyên trừ tồn kho và hủy phiếu chi sổ quỹ */
export { cancelPurchaseReceipt } from './purchaseCancellation.ts';

/** Cập nhật / Sửa phiếu nhập hàng (Hoàn nguyên tồn cũ, áp dụng dữ liệu mới) */
export { updatePurchaseReceipt } from './purchaseUpdate.ts';

/** ==============================
 * PHÂN HỆ QUẢN LÝ THƯƠNG HIỆU (BRANDS)
 * ============================== */

export async function listBrands(db: D1Database) {
  const { results: brands } = await db
    .prepare(`
      SELECT 
        b.*,
        COUNT(p.id) AS product_count
      FROM brands b
      LEFT JOIN products p ON (p.brand_id = b.id OR p.brand = b.name)
      GROUP BY b.id
      ORDER BY b.name ASC
    `)
    .all<any>();

  return brands || [];
}

export async function createBrand(db: D1Database, name: string, description?: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Tên thương hiệu không được để trống');

  const existing = await db
    .prepare('SELECT id FROM brands WHERE LOWER(name) = LOWER(?) LIMIT 1')
    .bind(trimmed)
    .first<{ id: number }>();

  if (existing) {
    return { id: existing.id, name: trimmed, is_existing: true };
  }

  const ins = await db
    .prepare(`
      INSERT INTO brands (name, description, created_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `)
    .bind(trimmed, description?.trim() || null)
    .run();

  return {
    id: ins.meta.last_row_id,
    name: trimmed,
    is_existing: false
  };
}

export async function updateBrand(db: D1Database, id: number, name: string, description?: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Tên thương hiệu không được để trống');

  await db
    .prepare(`
      UPDATE brands
      SET name = ?, description = ?, updated_at = datetime('now')
      WHERE id = ?
    `)
    .bind(trimmed, description?.trim() || null, id)
    .run();

  // Cập nhật text snapshot trong products
  await db
    .prepare('UPDATE products SET brand = ? WHERE brand_id = ?')
    .bind(trimmed, id)
    .run();

  return { success: true };
}

export async function deleteBrand(db: D1Database, id: number) {
  await db
    .prepare('UPDATE products SET brand_id = NULL WHERE brand_id = ?')
    .bind(id)
    .run();

  await db
    .prepare('DELETE FROM brands WHERE id = ?')
    .bind(id)
    .run();

  return { success: true };
}

/** ==============================
 * PHÂN HỆ XUẤT DÙNG NỘI BỘ & XUẤT HỦY
 * ============================== */

export interface StockOutboundInput {
  outbound_type: 'INTERNAL_USE' | 'DISPOSAL';
  reason: string;
  created_by?: string;
  items: Array<{
    product_id: number;
    product_type_id?: number | null;
    product_unit_id?: number | null;
    condition?: 'NEW' | 'QSD';
    quantity: number;
    note?: string;
  }>;
}

export { createStockOutboundReceipt } from './stockOutbound.ts';

/** Chuyển đổi trạng thái Đang kinh doanh <-> Ngưng kinh doanh (Chuẩn KiotViet) */
export async function toggleProductActive(db: D1Database, productId: number): Promise<{ active: boolean }> {
  const prod = await db.prepare('SELECT active FROM products WHERE id = ?').bind(productId).first<{ active: number }>();
  if (!prod) throw new Error(`Không tìm thấy sản phẩm #${productId}`);
  const newActive = prod.active === 1 ? 0 : 1;
  await db
    .prepare("UPDATE products SET active = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(newActive, productId)
    .run();
  return { active: newActive === 1 };
}

/** Xóa sản phẩm an toàn: Kiểm tra toàn bộ ràng buộc đơn hàng, kho, bảo hành */
export async function deleteProductSafe(db: D1Database, productId: number): Promise<{ success: boolean }> {
  // 1. Kiểm tra đơn hàng
  const hasOrder = await db.prepare('SELECT id FROM order_lines WHERE product_id = ? LIMIT 1').bind(productId).first();
  if (hasOrder) {
    throw new Error('Hàng hóa đã phát sinh trong đơn hàng (bán/đặt), không thể xóa vĩnh viễn! Vui lòng chọn "Ngưng kinh doanh" để ẩn sản phẩm.');
  }

  // 2. Kiểm tra giao dịch kho
  const hasInv = await db.prepare('SELECT id FROM inventory_transactions WHERE product_id = ? LIMIT 1').bind(productId).first();
  if (hasInv) {
    throw new Error('Hàng hóa đã có lịch sử xuất/nhập kho, không thể xóa vĩnh viễn! Vui lòng chọn "Ngưng kinh doanh" để ẩn sản phẩm.');
  }

  // 3. Kiểm tra phiếu sửa chữa/bảo hành
  const hasRepair = await db.prepare('SELECT id FROM repair_items WHERE product_id = ? LIMIT 1').bind(productId).first();
  if (hasRepair) {
    throw new Error('Hàng hóa đã được tiếp nhận trong phiếu sửa chữa/bảo hành! Vui lòng chọn "Ngưng kinh doanh" để ẩn sản phẩm.');
  }

  // 4. Kiểm tra mã bộ còn trong kho
  const hasUnits = await db.prepare("SELECT id FROM product_units WHERE product_id = ? AND availability != 'DISPOSED' LIMIT 1").bind(productId).first();
  if (hasUnits) {
    throw new Error('Hàng hóa đang có mã bộ / Serial trong hệ thống! Vui lòng chọn "Ngưng kinh doanh" để ẩn sản phẩm.');
  }

  // Xóa an toàn khi là sản phẩm mới tạo nhầm chưa từng phát sinh giao dịch
  await db.batch([
    db.prepare('DELETE FROM product_categories WHERE product_id = ?').bind(productId),
    db.prepare('DELETE FROM product_images WHERE product_id = ?').bind(productId),
    db.prepare('DELETE FROM product_units WHERE product_id = ?').bind(productId),
    db.prepare('DELETE FROM product_types WHERE product_id = ?').bind(productId),
    db.prepare('DELETE FROM products WHERE id = ?').bind(productId),
  ]);

  return { success: true };
}
