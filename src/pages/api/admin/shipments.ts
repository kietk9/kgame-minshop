import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as any;
    const action = body.action || 'update_status';

    if (action === 'update_status') {
      const id = Number(body.id);
      const status = String(body.status || 'SHIPPING');

      await env.DB.prepare(`
        UPDATE shipments 
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(status, id).run();

      return new Response(JSON.stringify({ success: true, message: 'Cập nhật trạng thái thành công' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'bulk_update_status') {
      const ids = Array.isArray(body.ids) ? body.ids.map((i: any) => Number(i)).filter((i: number) => !isNaN(i)) : [];
      const status = String(body.status || 'SHIPPING');

      if (ids.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Chưa chọn vận đơn nào' }), { status: 400 });
      }

      const placeholders = ids.map(() => '?').join(',');
      await env.DB.prepare(`
        UPDATE shipments 
        SET status = ?, updated_at = datetime('now')
        WHERE id IN (${placeholders})
      `).bind(status, ...ids).run();

      return new Response(JSON.stringify({ success: true, count: ids.length, message: `Đã cập nhật ${ids.length} vận đơn` }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'update_details') {
      const id = Number(body.id);
      const trackingCode = body.tracking_code ? String(body.tracking_code).trim() : null;
      const busStation = body.bus_station ? String(body.bus_station).trim() : null;
      const busPlate = body.bus_plate ? String(body.bus_plate).trim() : null;
      const shippingFee = body.shipping_fee_cents ? Number(body.shipping_fee_cents) : 0;
      const shippingPayer = body.shipping_payer || 'BUYER_PAYS';

      await env.DB.prepare(`
        UPDATE shipments
        SET tracking_code = ?, bus_station = ?, bus_plate = ?, shipping_fee_cents = ?, shipping_payer = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(trackingCode, busStation, busPlate, shippingFee, shippingPayer, id).run();

      return new Response(JSON.stringify({ success: true, message: 'Cập nhật chi tiết vận đơn thành công' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Hành động không hợp lệ' }), { status: 400 });
  } catch (err: any) {
    console.error('API Shipments Error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Lỗi xử lý vận đơn' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
