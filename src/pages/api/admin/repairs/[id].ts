import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  updateRepairTicket,
  addRepairReplacementItem,
  transitionRepairStatus,
  recordCashTransaction,
  getRepairTicketById,
} from '../../../../features/kgame/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const ticketId = Number(params.id);
  if (!ticketId) {
    return new Response('Mã phiếu không hợp lệ', { status: 400 });
  }

  const form = await request.formData();
  const action = String(form.get('action') ?? 'update_details');
  const returnUrl = `/admin/repairs/${ticketId}`;

  try {
    if (action === 'update_details') {
      const diagnosis = String(form.get('diagnosis') ?? '');
      const repairLocation = form.get('repair_location') as 'INTERNAL' | 'EXTERNAL';
      const externalPartner = String(form.get('external_partner') ?? '');
      const sentPartnerAt = String(form.get('sent_partner_at') ?? '') || undefined;
      const expectedReceiveAt = String(form.get('expected_receive_at') ?? '') || undefined;
      const actualReceivedAt = String(form.get('actual_received_at') ?? '') || undefined;

      const rawPartnerCost = form.get('partner_cost');
      const partnerCostCents = rawPartnerCost ? Math.round(Number(String(rawPartnerCost).replace(/\D/g, ''))) : 0;

      const rawRepairPrice = form.get('repair_price');
      const repairPriceCents = rawRepairPrice ? Math.round(Number(String(rawRepairPrice).replace(/\D/g, ''))) : 0;

      const expectedReturnAt = String(form.get('expected_return_at') ?? '') || undefined;
      const assignedTo = String(form.get('assigned_to') ?? '');
      const note = String(form.get('note') ?? '');

      await updateRepairTicket(env.DB, ticketId, {
        diagnosis,
        repair_location: repairLocation,
        external_partner: externalPartner,
        sent_partner_at: sentPartnerAt,
        expected_receive_at: expectedReceiveAt,
        actual_received_at: actualReceivedAt,
        partner_cost_cents: partnerCostCents,
        repair_price_cents: repairPriceCents,
        expected_return_at: expectedReturnAt,
        assigned_to: assignedTo,
        note,
        actor_name: 'Kỹ thuật viên',
      });

      return redirect(`${returnUrl}?success=updated`, 303);
    }

    if (action === 'add_item') {
      const productId = Number(form.get('product_id'));
      const productTypeId = form.get('product_type_id') ? Number(form.get('product_type_id')) : null;
      const quantity = Number(form.get('quantity') ?? 1);
      const rawCost = form.get('unit_cost');
      const unitCostCents = rawCost ? Math.round(Number(String(rawCost).replace(/\D/g, ''))) : 0;

      if (!productId) {
        return redirect(`${returnUrl}?error=${encodeURIComponent('Vui lòng chọn linh kiện thay thế')}`, 303);
      }

      await addRepairReplacementItem(
        env.DB,
        ticketId,
        productId,
        productTypeId,
        quantity,
        unitCostCents,
        'Kỹ thuật viên'
      );

      return redirect(`${returnUrl}?success=item_added`, 303);
    }

    if (action === 'transition_status') {
      const newStatus = String(form.get('new_status') ?? '');
      const eventNote = String(form.get('event_note') ?? '');
      const serviceKey = form.get('service_key') === 'on' || form.get('service_key') === '1';
      const newExpiryDate = String(form.get('new_expiry_date') ?? '') || undefined;
      const newExpiryDays = form.get('new_expiry_days') ? Number(form.get('new_expiry_days')) : undefined;

      if (!newStatus) {
        return redirect(`${returnUrl}?error=${encodeURIComponent('Trạng thái không hợp lệ')}`, 303);
      }

      await transitionRepairStatus(
        env.DB,
        ticketId,
        newStatus,
        eventNote,
        'Kỹ thuật viên',
        {
          service_key: serviceKey,
          new_expiry_date: newExpiryDate,
          new_expiry_days: newExpiryDays,
        }
      );

      return redirect(`${returnUrl}?success=status_changed`, 303);
    }

    if (action === 'settle_payment') {
      const rawPaid = form.get('amount_paid');
      const amountPaid = rawPaid ? Math.round(Number(String(rawPaid).replace(/\D/g, ''))) : 0;
      const accountType = (form.get('account_type') as 'CASH' | 'BANK') || 'CASH';
      const bankName = String(form.get('bank_name') ?? '').trim();
      const customerNote = String(form.get('payment_note') ?? '').trim();

      // Lấy thông tin phiếu để biết khách hàng và mã phiếu
      const ticketData = await getRepairTicketById(env.DB, ticketId);
      const t = ticketData?.ticket;
      if (!t) throw new Error('Không tìm thấy phiếu sửa chữa');

      // 1. Ghi nhận Phiếu Thu từ khách hàng vào Sổ Quỹ
      if (amountPaid > 0) {
        await recordCashTransaction(env.DB, {
          flow_type: 'IN',
          account_type: accountType,
          amount_cents: amountPaid,
          category: 'REPAIR_FEE',
          reference_type: 'repair_ticket',
          reference_id: ticketId,
          bank_name: accountType === 'BANK' ? (bankName || 'Ngân hàng') : null,
          recipient_name: t.customer_name || 'Khách hàng',
          note: customerNote || `Thu tiền sửa chữa phiếu ${t.ticket_code} (${t.product_name || t.unidentified_product_name || 'Thiết bị'})`,
          created_by: 'Thu ngân',
        });
      }

      // 2. Nếu có chi phí đối tác và chọn chi trả ngay
      const payPartner = form.get('pay_partner') === '1' || form.get('pay_partner') === 'on';
      const rawPartnerPay = form.get('partner_amount');
      const partnerAmount = rawPartnerPay ? Math.round(Number(String(rawPartnerPay).replace(/\D/g, ''))) : (t.partner_cost_cents || 0);
      const partnerAccountType = (form.get('partner_account_type') as 'CASH' | 'BANK') || 'CASH';

      if (payPartner && partnerAmount > 0) {
        await recordCashTransaction(env.DB, {
          flow_type: 'OUT',
          account_type: partnerAccountType,
          amount_cents: partnerAmount,
          category: 'REPAIR_FEE',
          reference_type: 'repair_ticket',
          reference_id: ticketId,
          recipient_name: t.external_partner || 'Đối tác sửa chữa',
          note: `Chi tiền đối tác ${t.external_partner || ''} sửa máy phiếu ${t.ticket_code}`,
          created_by: 'Thu ngân',
        });
      }

      // 3. Cập nhật trạng thái phiếu sang COMPLETED
      await transitionRepairStatus(
        env.DB,
        ticketId,
        'COMPLETED',
        `Hoàn tất & Thu tiền (${new Intl.NumberFormat('vi-VN').format(amountPaid)}đ qua ${accountType === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'})`,
        'Thu ngân'
      );

      return redirect(`${returnUrl}?success=paid_completed`, 303);
    }

    return redirect(returnUrl, 303);
  } catch (err: any) {
    console.error('Lỗi thao tác sửa chữa:', err);
    return redirect(`${returnUrl}?error=${encodeURIComponent(err.message || 'Lỗi thao tác')}`, 303);
  }
};
