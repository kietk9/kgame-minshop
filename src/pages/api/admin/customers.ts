import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { saveCustomer, getCustomerDetailsWithHistory } from '../../../features/kgame/db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const customerId = Number(url.searchParams.get('id'));
  if (!customerId) {
    return new Response(JSON.stringify({ error: 'Missing customer id' }), { status: 400 });
  }

  try {
    const data = await getCustomerDetailsWithHistory(env.DB, customerId);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const data = (await request.json()) as any;
      const res = await saveCustomer(env.DB, data);
      return new Response(JSON.stringify({ success: true, ...res }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
    }
  }

  // FormData
  const form = await request.formData();
  const idStr = form.get('id');
  const id = idStr ? Number(idStr) : null;
  const name = String(form.get('name') || '').trim();
  const phone = String(form.get('phone') || '').trim();
  const province = String(form.get('province') || '').trim() || null;
  const ward = String(form.get('ward') || '').trim() || null;
  const addressDetail = String(form.get('address_detail') || '').trim() || null;
  const note = String(form.get('note') || '').trim() || null;

  if (!name || !phone) {
    return redirect('/admin/customers?error=' + encodeURIComponent('Vui lòng nhập họ tên và số điện thoại'), 303);
  }

  try {
    await saveCustomer(env.DB, {
      id,
      name,
      phone,
      province,
      ward,
      address_detail: addressDetail,
      note,
    });

    return redirect('/admin/customers?success=' + (id ? 'updated' : 'created'), 303);
  } catch (err: any) {
    return redirect('/admin/customers?error=' + encodeURIComponent(err.message || 'Lỗi lưu khách hàng'), 303);
  }
};
