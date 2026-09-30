import { adminActor } from '../../../features/auth/staffPolicy';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createPurchaseReceipt, completePurchaseReceipt, cancelPurchaseReceipt, updatePurchaseReceipt } from '../../../features/kgame/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const data = (await request.json()) as any;
      data.created_by=adminActor(locals.adminPrincipal);
      const id = Number(data.receipt_id || data.receiptId || data.id);

      if (data.action === 'complete') {
        const res = await completePurchaseReceipt(env.DB, id, data);
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (data.action === 'cancel') {
        const res = await cancelPurchaseReceipt(env.DB, id, data.cancel_reason);
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (data.action === 'update' || id) {
        const res = await updatePurchaseReceipt(env.DB, id, data);
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const res = await createPurchaseReceipt(env.DB, data);
      return new Response(JSON.stringify({ success: true, ...res }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error('API Purchases JSON Error:', err);
      return new Response(JSON.stringify({ success: false, error: err.message || 'Lỗi xử lý phiếu nhập hàng' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // FormData handling
  const form = await request.formData();
  try {
    const payloadStr = String(form.get('purchase_payload') || '');
    if (!payloadStr) {
      return redirect('/admin/purchases/new?error=' + encodeURIComponent('Thiếu dữ liệu phiếu nhập hàng'), 303);
    }
    const data = JSON.parse(payloadStr);
    data.created_by=adminActor(locals.adminPrincipal);
      const id = Number(data.receipt_id || data.receiptId || data.id);
    if (data.action === 'update' || id) {
      await updatePurchaseReceipt(env.DB, id, data);
      return redirect(`/admin/purchases/${id}?success=updated`, 303);
    }
    const res = await createPurchaseReceipt(env.DB, data);
    return redirect(`/admin/purchases/${res.id}?success=created`, 303);
  } catch (err: any) {
    console.error('Lỗi xử lý Form Purchases:', err);
    return redirect('/admin/purchases/new?error=' + encodeURIComponent(err.message || 'Lỗi lưu phiếu nhập hàng'), 303);
  }
};
