import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createRepairTicket, type CreateRepairTicketInput } from '../../../features/kgame/db';

export const prerender = false;

const fail = (msg: string) => `/admin/repairs/new?error=${encodeURIComponent(msg)}`;

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as any;
      const ownerType = (body.owner_type as 'CUSTOMER' | 'KGAME') || 'CUSTOMER';
      const customerId = body.customer_id ? Number(body.customer_id) : null;
      const customerName = String(body.customer_name ?? '').trim();
      const customerPhone = String(body.customer_phone ?? '').trim();
      const customerAddress = String(body.customer_address ?? '').trim();

      const programCodeInput = String(body.program_code ?? '').trim();
      let productId = body.product_id ? Number(body.product_id) : null;
      let productTypeId = body.product_type_id ? Number(body.product_type_id) : null;
      let productUnitId: number | null = null;
      const unidentifiedName = String(body.unidentified_product_name ?? '').trim();

      if (programCodeInput) {
        const matchedUnit = await env.DB.prepare(`
          SELECT pu.id, pu.product_type_id, pt.product_id
          FROM product_units pu
          JOIN product_types pt ON pu.product_type_id = pt.id
          WHERE pu.program_code = ?
          LIMIT 1
        `)
          .bind(programCodeInput)
          .first<{ id: number; product_type_id: number; product_id: number }>();

        if (matchedUnit) {
          productUnitId = matchedUnit.id;
          productTypeId = matchedUnit.product_type_id;
          productId = matchedUnit.product_id;
        }
      }

      const problemReported = String(body.problem_reported ?? '').trim();
      if (!problemReported) {
        return new Response(JSON.stringify({ success: false, error: 'Vui lòng nhập hiện tượng / lỗi máy' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const input: CreateRepairTicketInput = {
        owner_type: ownerType,
        customer_id: customerId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: customerAddress || undefined,
        product_id: productId,
        product_type_id: productTypeId,
        product_unit_id: productUnitId,
        unidentified_product_name: unidentifiedName || null,
        problem_reported: problemReported,
        accessories_received: body.accessories_received?.trim() || null,
        diagnosis: body.diagnosis?.trim() || null,
        repair_location: (body.repair_location as 'INTERNAL' | 'EXTERNAL') || 'INTERNAL',
        external_partner: body.external_partner?.trim() || null,
        sent_partner_at: body.sent_partner_at?.trim() || null,
        expected_receive_at: body.expected_receive_at?.trim() || null,
        repair_price_cents: Number(body.repair_price_cents || 0),
        expected_return_at: body.expected_return_at?.trim() || null,
        assigned_to: body.assigned_to?.trim() || 'Kỹ thuật xưởng',
        note: body.note?.trim() || null,
        created_by: body.created_by || 'Thu ngân POS',
      };

      const res = await createRepairTicket(env.DB, input);
      return new Response(JSON.stringify({ success: true, id: res.id, ticket_code: res.ticket_code }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error('API repairs JSON Error:', err);
      return new Response(JSON.stringify({ success: false, error: err.message || 'Lỗi khi tạo phiếu sửa chữa' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const form = await request.formData();

  const ownerType = (form.get('owner_type') as 'CUSTOMER' | 'KGAME') || 'CUSTOMER';
  const customerId = form.get('customer_id') ? Number(form.get('customer_id')) : null;
  const customerName = String(form.get('customer_name') ?? '').trim();
  const customerPhone = String(form.get('customer_phone') ?? '').trim();
  const customerAddress = String(form.get('customer_address') ?? '').trim();

  const programCodeInput = String(form.get('program_code') ?? '').trim();
  let productId = form.get('product_id') ? Number(form.get('product_id')) : null;
  let productTypeId = form.get('product_type_id') ? Number(form.get('product_type_id')) : null;
  let productUnitId: number | null = null;
  const unidentifiedName = String(form.get('unidentified_product_name') ?? '').trim();

  // 1. Nếu có nhập mã bộ Program Code, tra cứu mã bộ
  if (programCodeInput) {
    const matchedUnit = await env.DB.prepare(`
      SELECT pu.id, pu.product_type_id, pt.product_id
      FROM product_units pu
      JOIN product_types pt ON pu.product_type_id = pt.id
      WHERE pu.program_code = ?
      LIMIT 1
    `)
      .bind(programCodeInput)
      .first<{ id: number; product_type_id: number; product_id: number }>();

    if (matchedUnit) {
      productUnitId = matchedUnit.id;
      productTypeId = matchedUnit.product_type_id;
      productId = matchedUnit.product_id;
    }
  }

  const problemReported = String(form.get('problem_reported') ?? '').trim();
  if (!problemReported) {
    return redirect(fail('Vui lòng nhập hiện tượng / lỗi máy.'), 303);
  }

  const accessoriesReceived = String(form.get('accessories_received') ?? '').trim();
  const diagnosis = String(form.get('diagnosis') ?? '').trim();
  const repairLocation = (form.get('repair_location') as 'INTERNAL' | 'EXTERNAL') || 'INTERNAL';
  const externalPartner = String(form.get('external_partner') ?? '').trim();
  const sentPartnerAt = String(form.get('sent_partner_at') ?? '').trim() || null;
  const expectedReceiveAt = String(form.get('expected_receive_at') ?? '').trim() || null;

  const rawPrice = form.get('repair_price');
  const repairPriceCents = rawPrice ? Math.round(Number(String(rawPrice).replace(/\D/g, ''))) : 0;

  const expectedReturnAt = String(form.get('expected_return_at') ?? '').trim() || null;
  const assignedTo = String(form.get('assigned_to') ?? '').trim() || null;
  const note = String(form.get('note') ?? '').trim() || null;

  try {
    const input: CreateRepairTicketInput = {
      owner_type: ownerType,
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: customerAddress || undefined,
      product_id: productId,
      product_type_id: productTypeId,
      product_unit_id: productUnitId,
      unidentified_product_name: unidentifiedName || null,
      problem_reported: problemReported,
      accessories_received: accessoriesReceived || null,
      diagnosis: diagnosis || null,
      repair_location: repairLocation,
      external_partner: externalPartner || null,
      sent_partner_at: sentPartnerAt,
      expected_receive_at: expectedReceiveAt,
      repair_price_cents: repairPriceCents,
      expected_return_at: expectedReturnAt,
      assigned_to: assignedTo,
      note: note || null,
      created_by: 'Kỹ thuật viên',
    };

    const res = await createRepairTicket(env.DB, input);
    return redirect(`/admin/repairs/${res.id}?success=created`, 303);
  } catch (err: any) {
    console.error('Lỗi tiếp nhận sửa chữa:', err);
    return redirect(fail(err.message || 'Lỗi khi tạo phiếu sửa chữa.'), 303);
  }
};
