import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { listPartners, getPartnerDetailsWithHistory, savePartner } from '../../../features/kgame/db';

export const prerender = false;

// GET: Lấy danh sách đối tác theo bộ lọc (ALL, CUSTOMER, SUPPLIER) hoặc chi tiết 1 đối tác
export const GET: APIRoute = async ({ url }) => {
  const idParam = url.searchParams.get('id');
  if (idParam) {
    try {
      const details = await getPartnerDetailsWithHistory(env.DB, Number(idParam));
      if (!details) {
        return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy đối tác' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, data: details }), {
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

  const type = (url.searchParams.get('type') as any) || 'ALL';
  const search = url.searchParams.get('q') || url.searchParams.get('search') || '';
  const hasDebt = url.searchParams.get('debt') === '1';

  try {
    const { partners, total } = await listPartners(env.DB, {
      type,
      search,
      hasDebt,
      limit: 100,
    });

    return new Response(JSON.stringify({ success: true, partners, total }), {
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

// POST: Tạo hoặc sửa Đối Tác (Dùng chung cho cả Khách Hàng và Nhà Cung Cấp)
export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const data = (await request.json()) as any;

      if (!data.name?.trim()) {
        return new Response(JSON.stringify({ success: false, error: 'Tên đối tác là bắt buộc' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const res = await savePartner(env.DB, {
        id: data.id ? Number(data.id) : undefined,
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        tax_code: data.tax_code || null,
        province: data.province || null,
        ward: data.ward || null,
        address_detail: data.address_detail || data.address || null,
        note: data.note || null,
        is_customer: data.is_customer !== undefined ? Boolean(data.is_customer) : true,
        is_supplier: Boolean(data.is_supplier),
      });

      return new Response(JSON.stringify({ success: true, data: res }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error('Lỗi API Partners:', err);
      return new Response(JSON.stringify({ success: false, error: err.message || 'Lỗi lưu thông tin đối tác' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Xử lý Form submit chuẩn
  try {
    const formData = await request.formData();
    const id = formData.get('id') ? Number(formData.get('id')) : undefined;
    const name = String(formData.get('name') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const tax_code = String(formData.get('tax_code') || '').trim();
    const province = String(formData.get('province') || '').trim();
    const ward = String(formData.get('ward') || '').trim();
    const address_detail = String(formData.get('address_detail') || '').trim();
    const note = String(formData.get('note') || '').trim();
    const is_customer = formData.get('is_customer') === 'on' || formData.get('is_customer') === '1' || formData.get('is_customer') === 'true';
    const is_supplier = formData.get('is_supplier') === 'on' || formData.get('is_supplier') === '1' || formData.get('is_supplier') === 'true';
    const redirectUrl = String(formData.get('redirect_url') || '/admin/partners');

    if (!name) {
      return redirect(`${redirectUrl}?error=${encodeURIComponent('Vui lòng nhập tên đối tác')}`, 303);
    }

    await savePartner(env.DB, {
      id,
      name,
      phone: phone || null,
      email: email || null,
      tax_code: tax_code || null,
      province: province || null,
      ward: ward || null,
      address_detail: address_detail || null,
      note: note || null,
      is_customer,
      is_supplier,
    });

    return redirect(`${redirectUrl}?success=${id ? 'updated' : 'created'}`, 303);
  } catch (err: any) {
    console.error('Lỗi Form Partners:', err);
    return redirect(`/admin/partners?error=${encodeURIComponent(err.message || 'Lỗi xử lý đối tác')}`, 303);
  }
};
