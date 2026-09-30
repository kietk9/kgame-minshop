import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as any;
    const action = body.action || 'create';

    if (action === 'create') {
      const name = String(body.name || '').trim();
      if (!name) {
        return new Response(JSON.stringify({ success: false, error: 'Tên đối tác là bắt buộc' }), { status: 400 });
      }

      // Tự sinh mã đối tác nếu không có
      let partnerCode = String(body.partner_code || '').trim().toUpperCase();
      if (!partnerCode) {
        const last = await env.DB.prepare('SELECT id FROM delivery_partners ORDER BY id DESC LIMIT 1').first<{ id: number }>();
        const nextId = (last?.id || 0) + 1;
        partnerCode = 'DTGH' + String(nextId).padStart(3, '0');
      }

      const partnerType = body.partner_type || 'BUS';
      const phone = body.phone ? String(body.phone).trim() : null;
      const address = body.address ? String(body.address).trim() : null;
      const contactPerson = body.contact_person ? String(body.contact_person).trim() : null;
      const note = body.note ? String(body.note).trim() : null;

      const res = await env.DB.prepare(`
        INSERT INTO delivery_partners (
          partner_code, name, partner_type, phone, address, contact_person, note, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', datetime('now'), datetime('now'))
      `).bind(partnerCode, name, partnerType, phone, address, contactPerson, note).run();

      return new Response(JSON.stringify({
        success: true,
        id: res.meta.last_row_id,
        partner_code: partnerCode,
        message: 'Thêm đối tác thành công'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'update') {
      const id = Number(body.id);
      const name = String(body.name || '').trim();
      if (!id || !name) {
        return new Response(JSON.stringify({ success: false, error: 'Thiếu ID hoặc Tên đối tác' }), { status: 400 });
      }

      const partnerType = body.partner_type || 'BUS';
      const phone = body.phone ? String(body.phone).trim() : null;
      const address = body.address ? String(body.address).trim() : null;
      const contactPerson = body.contact_person ? String(body.contact_person).trim() : null;
      const note = body.note ? String(body.note).trim() : null;

      await env.DB.prepare(`
        UPDATE delivery_partners
        SET name = ?, partner_type = ?, phone = ?, address = ?, contact_person = ?, note = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(name, partnerType, phone, address, contactPerson, note, id).run();

      return new Response(JSON.stringify({ success: true, message: 'Cập nhật thành công' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'toggle_status') {
      const id = Number(body.id);
      const current = await env.DB.prepare('SELECT status FROM delivery_partners WHERE id = ?').bind(id).first<{ status: string }>();
      if (!current) {
        return new Response(JSON.stringify({ success: false, error: 'Đối tác không tồn tại' }), { status: 404 });
      }

      const newStatus = current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await env.DB.prepare('UPDATE delivery_partners SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind(newStatus, id).run();

      return new Response(JSON.stringify({ success: true, status: newStatus }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Hành động không hợp lệ' }), { status: 400 });
  } catch (err: any) {
    console.error('API delivery-partners Error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Lỗi xử lý đối tác giao hàng' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
