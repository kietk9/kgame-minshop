import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createBuyback } from '../../../features/kgame/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const data = (await request.json()) as any;
      const res = await createBuyback(env.DB, data);
      return new Response(JSON.stringify({ success: true, ...res }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error('API Buybacks JSON Error:', err);
      return new Response(JSON.stringify({ success: false, error: err.message || 'Lỗi xử lý phiếu thu mua' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // FormData handling
  const form = await request.formData();
  try {
    const payloadStr = String(form.get('buyback_payload') || '');
    if (!payloadStr) {
      return redirect('/admin/buybacks/new?error=' + encodeURIComponent('Thiếu dữ liệu phiếu thu mua'), 303);
    }
    const data = JSON.parse(payloadStr);
    const res = await createBuyback(env.DB, data);
    return redirect(`/admin/buybacks/${res.id}?success=created`, 303);
  } catch (err: any) {
    console.error('Lỗi xử lý Form Buybacks:', err);
    return redirect('/admin/buybacks/new?error=' + encodeURIComponent(err.message || 'Lỗi lưu phiếu thu mua'), 303);
  }
};
