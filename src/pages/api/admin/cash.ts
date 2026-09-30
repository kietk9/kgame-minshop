import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { recordManualCashTransaction } from '../../../features/kgame/cashbook.ts';
import { parseMoneyText } from '../../../features/kgame/posInput.ts';
export const prerender = false;
export const POST: APIRoute = async ({ request, redirect }) => {
  try {
    const form = await request.formData();
    await recordManualCashTransaction(env.DB, {
      request_id: String(form.get('request_id') || '') || undefined,
      flow_type: (form.get('flow_type') || 'IN') as 'IN'|'OUT',
      account_type: (form.get('account_type') || 'CASH') as 'CASH'|'BANK',
      amount_cents: parseMoneyText(form.get('amount')),
      category: (form.get('category') || 'OTHER') as 'OTHER'|'EXPENSE',
      bank_name: String(form.get('bank_name') || ''), recipient_name: String(form.get('recipient_name') || ''),
      note: String(form.get('note') || ''), created_by: 'Thủ quỹ',
    });
    return redirect('/admin/cash?success=created',303);
  } catch (err) {
    return redirect('/admin/cash?error=' + encodeURIComponent(err instanceof Error ? err.message : 'Lỗi ghi sổ quỹ'),303);
  }
};
