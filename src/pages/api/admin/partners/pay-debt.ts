import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { payPartnerDebt } from '../../../../features/kgame/debtPayments.ts';
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    const result = await payPartnerDebt(env.DB, await request.json());
    return Response.json({ ...result, message: 'Đã ghi thanh toán và cập nhật công nợ.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi xử lý thanh toán';
    return Response.json({ success: false, error: message }, { status: /D1_ERROR|SQLITE_ERROR/.test(message) ? 500 : 400 });
  }
};
