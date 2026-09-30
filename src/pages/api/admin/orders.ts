import type { APIRoute } from 'astro';
import { posAuthority } from '../../../features/auth/permissions';
import { adminActor } from '../../../features/auth/staffPolicy';
import { env } from 'cloudflare:workers';
import { parseMoneyText } from '../../../features/kgame/posInput.ts';
import { createPosOrder, addPosOrderPayment, updatePosOrderStatus, fulfillPreorder } from '../../../features/kgame/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const authority = posAuthority(locals.adminPrincipal);
  const actor = adminActor(locals.adminPrincipal);
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const data = (await request.json()) as any;
      data.created_by = actor;
      data.payment = {...data.payment, created_by: actor};
      const action = data.action || 'create';

      if (action === 'create') {
        const res = await createPosOrder(env.DB, data, authority);
        return new Response(JSON.stringify({ success: true, ...res }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (action === 'add_payment') {
        const res = await addPosOrderPayment(env.DB, data, authority);
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (action === 'fulfill_preorder') {
        const res = await fulfillPreorder(env.DB, Number(data.order_id), data.payment, data.request_id, data.items, authority);
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (action === 'update_status') {
        const res = await updatePosOrderStatus(env.DB, data.order_id, data.status, { customer_id: data.credit_customer_id, require_unfulfilled: true, refund_mode: 'PENDING', return_confirmed: data.return_confirmed === true, created_by: data.created_by });
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'Hành động không hợp lệ' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      console.error('API Orders Error:', err);
      return new Response(JSON.stringify({ success: false, error: err.message || 'Lỗi xử lý đơn hàng' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // FormData handling
  const form = await request.formData();
  const action = String(form.get('action') || 'create');

  try {
    if (action === 'create') {
      const payloadStr = String(form.get('order_payload') || '');
      if (!payloadStr) {
        return redirect('/admin/orders/new?error=' + encodeURIComponent('Thiếu dữ liệu đơn hàng'), 303);
      }
      const data = JSON.parse(payloadStr);
      data.created_by = actor;
      data.payment = {...data.payment, created_by: actor};
      const res = await createPosOrder(env.DB, data, authority);
      return redirect(`/admin/orders/${res.id}?success=created`, 303);
    }

    if (action === 'add_payment') {
      const orderId = Number(form.get('order_id'));
      const rawAmount = form.get('amount_paid');
      const amountPaid = parseMoneyText(rawAmount);
      const paymentMethod = (form.get('payment_method') as 'CASH' | 'BANK') || 'CASH';
      const bankName = String(form.get('bank_name') || '').trim() || undefined;
      const note = String(form.get('note') || '').trim() || undefined;

      if (!amountPaid || amountPaid <= 0) {
        return redirect(`/admin/orders/${orderId}?error=` + encodeURIComponent('Vui lòng nhập số tiền thu hợp lệ'), 303);
      }

      await addPosOrderPayment(env.DB, {
        order_id: orderId,
        request_id: String(form.get('request_id') || '') || undefined,
        amount_paid_cents: amountPaid,
        payment_method: paymentMethod,
        bank_name: bankName,
        note: note,
        created_by: actor,
      }, authority);

      return redirect(`/admin/orders/${orderId}?success=payment_added`, 303);
    }

    if (action === 'fulfill_preorder') {
      const orderId = Number(form.get('order_id'));
      const rawRemaining = form.get('amount_paid');
      const amountPaid = parseMoneyText(rawRemaining);
      const paymentMethod = (form.get('payment_method') as 'CASH' | 'BANK') || 'CASH';
      const note = String(form.get('note') || '').trim() || undefined;

      await fulfillPreorder(env.DB, orderId, {
        amount_paid_cents: amountPaid,
        payment_method: paymentMethod,
        note,
        created_by: actor,
      }, String(form.get('request_id') || '') || undefined, undefined, authority);
      return redirect(`/admin/orders/${orderId}?success=fulfilled`, 303);
    }

    if (action === 'update_status') {
      const orderId = Number(form.get('order_id'));
      const newStatus = String(form.get('order_status') || 'PROCESSING');
      await updatePosOrderStatus(env.DB, orderId, newStatus, { customer_id: form.get('credit_customer_id') ? Number(form.get('credit_customer_id')) : undefined, require_unfulfilled: true, refund_mode: 'PENDING', return_confirmed: form.get('return_confirmed') === 'on', created_by: actor });
      return redirect(`/admin/orders/${orderId}?success=status_updated`, 303);
    }

    return redirect('/admin/orders', 303);
  } catch (err: any) {
    console.error('Lỗi xử lý Form Orders:', err);
    const orderId = form.get('order_id');
    const targetUrl = orderId ? `/admin/orders/${orderId}` : '/admin/orders/new';
    return redirect(`${targetUrl}?error=` + encodeURIComponent(err.message || 'Lỗi thao tác'), 303);
  }
};
