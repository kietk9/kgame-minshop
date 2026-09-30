import { adminActor } from '../../../../features/auth/staffPolicy';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createStockOutboundReceipt } from '../../../../features/kgame/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const contentType = request.headers.get('content-type') || '';

  // 1. JSON
  if (contentType.includes('application/json')) {
    try {
      const data = (await request.json()) as any;
      const res = await createStockOutboundReceipt(env.DB, {...data,created_by:adminActor(locals.adminPrincipal)});
      return new Response(JSON.stringify(res), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 2. FormData
  try {
    const form = await request.formData();
    const payloadStr = String(form.get('payload') || '');
    if (!payloadStr) {
      return redirect('/admin/inventory/outbound/new?error=' + encodeURIComponent('Thiếu dữ liệu phiếu xuất kho'), 303);
    }
    const data = JSON.parse(payloadStr);
    await createStockOutboundReceipt(env.DB, {...data,created_by:adminActor(locals.adminPrincipal)});
    return redirect('/admin/inventory?success=outbound_created', 303);
  } catch (err: any) {
    return redirect('/admin/inventory/outbound/new?error=' + encodeURIComponent(err.message), 303);
  }
};
