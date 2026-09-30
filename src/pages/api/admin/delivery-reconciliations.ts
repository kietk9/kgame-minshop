import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { recordCashTransaction } from '../../../features/kgame/db';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as any;
    const action = body.action || 'create_and_settle';

    if (action === 'create_and_settle') {
      const partnerId = Number(body.partner_id);
      const shipmentIds = Array.isArray(body.shipment_ids)
        ? body.shipment_ids.map((id: any) => Number(id)).filter((id: number) => !isNaN(id))
        : [];

      if (!partnerId || shipmentIds.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Vui lòng chọn đối tác và ít nhất 1 vận đơn để đối soát' }), { status: 400 });
      }

      // Lấy thông tin đối tác
      const partner = await env.DB.prepare('SELECT id, name, partner_code FROM delivery_partners WHERE id = ?')
        .bind(partnerId)
        .first<{ id: number; name: string; partner_code: string }>();

      if (!partner) {
        return new Response(JSON.stringify({ success: false, error: 'Đối tác giao hàng không tồn tại' }), { status: 404 });
      }

      // Lấy các vận đơn được chọn
      const placeholders = shipmentIds.map(() => '?').join(',');
      const { results: rawShipments } = await env.DB.prepare(`
        SELECT id, order_id, cod_amount_cents, shipping_fee_cents, shipping_payer, status, reconciliation_status
        FROM shipments
        WHERE id IN (${placeholders})
      `).bind(...shipmentIds).all<any>();

      const selectedShipments = rawShipments ?? [];
      if (selectedShipments.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Không tìm thấy dữ liệu vận đơn hợp lệ' }), { status: 400 });
      }

      // Tính toán tiền COD và cước
      let totalCodCents = 0;
      let totalFeeCents = 0;

      for (const s of selectedShipments) {
        totalCodCents += (s.cod_amount_cents || 0);
        if (s.shipping_payer === 'SHOP_PAYS') {
          totalFeeCents += (s.shipping_fee_cents || 0);
        }
      }

      const netAmountCents = totalCodCents - totalFeeCents;

      // Sinh mã đối soát
      const now = new Date();
      const prefix = `DS${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const last = await env.DB.prepare(`
        SELECT reconciliation_code FROM delivery_reconciliations WHERE reconciliation_code LIKE ? ORDER BY id DESC LIMIT 1
      `).bind(`${prefix}%`).first<{ reconciliation_code: string }>();

      let nextNum = 1;
      if (last?.reconciliation_code) {
        const lastDigits = Number(last.reconciliation_code.slice(6));
        if (!isNaN(lastDigits)) nextNum = lastDigits + 1;
      }
      const reconCode = `${prefix}${String(nextNum).padStart(3, '0')}`;

      // Xử lý tạo giao dịch Sổ Quỹ (Chỉ tạo khi người dùng đã xác nhận thực tế)
      const accountType = (body.account_type === 'BANK' ? 'BANK' : 'CASH') as 'CASH' | 'BANK';
      const bankName = body.bank_name ? String(body.bank_name).trim() : null;
      const verifiedBy = body.verified_by || 'Kế toán Kgame';
      const note = body.note ? String(body.note).trim() : '';

      let cashTransactionId: number | null = null;

      if (netAmountCents > 0) {
        // Shop thu về tiền COD dương
        const cashRes = await recordCashTransaction(env.DB, {
          flow_type: 'IN',
          account_type: accountType,
          category: 'COD_SETTLEMENT',
          amount_cents: netAmountCents,
          reference_type: 'DELIVERY_RECONCILIATION',
          reference_id: 0, // Cập nhật sau
          bank_name: bankName || undefined,
          recipient_name: partner.name,
          note: `Đối soát ${reconCode}: Thu COD ${partner.name} (${selectedShipments.length} vận đơn)${note ? ` - ${note}` : ''}`,
          created_by: verifiedBy
        });
        cashTransactionId = cashRes.id;
      } else if (netAmountCents < 0) {
        // Shop trả tiền cước nhiều hơn tiền COD
        const cashRes = await recordCashTransaction(env.DB, {
          flow_type: 'OUT',
          account_type: accountType,
          category: 'SHIPPING_FEE',
          amount_cents: Math.abs(netAmountCents),
          reference_type: 'DELIVERY_RECONCILIATION',
          reference_id: 0,
          bank_name: bankName || undefined,
          recipient_name: partner.name,
          note: `Đối soát ${reconCode}: Trả cước vận chuyển cho ${partner.name} (${selectedShipments.length} vận đơn)${note ? ` - ${note}` : ''}`,
          created_by: verifiedBy
        });
        cashTransactionId = cashRes.id;
      }

      // Tạo bản ghi đối soát
      const reconRes = await env.DB.prepare(`
        INSERT INTO delivery_reconciliations (
          reconciliation_code, partner_id, period_start, period_end, total_orders,
          total_cod_cents, total_fee_cents, net_amount_cents, status, cash_transaction_id,
          verified_at, verified_by, notes, created_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, 'SETTLED', ?,
          datetime('now'), ?, ?, datetime('now')
        )
      `).bind(
        reconCode,
        partnerId,
        body.period_start || null,
        body.period_end || null,
        selectedShipments.length,
        totalCodCents,
        totalFeeCents,
        netAmountCents,
        cashTransactionId,
        verifiedBy,
        note || null
      ).run();

      const reconId = reconRes.meta.last_row_id;

      // Cập nhật lại reference_id trong Sổ quỹ nếu có
      if (cashTransactionId) {
        await env.DB.prepare('UPDATE cash_transactions SET reference_id = ? WHERE id = ?')
          .bind(reconId, cashTransactionId).run();
      }

      // Cập nhật các vận đơn thành ĐÃ ĐỐI SOÁT
      await env.DB.prepare(`
        UPDATE shipments 
        SET reconciliation_id = ?, reconciliation_status = 'RECONCILED', settled_at = datetime('now'), settled_by = ?, updated_at = datetime('now')
        WHERE id IN (${placeholders})
      `).bind(reconId, verifiedBy, ...shipmentIds).run();

      // Cập nhật các đơn hàng liên quan: hoàn tất đơn & đánh dấu đã thanh toán đủ
      const orderIds = Array.from(new Set(selectedShipments.map(s => s.order_id)));
      for (const ordId of orderIds) {
        await env.DB.prepare(`
          UPDATE orders
          SET order_status = 'COMPLETED', payment_status = 'PAID', paid_amount_cents = amount_total_cents, cod_amount_cents = 0, updated_at = datetime('now')
          WHERE id = ?
        `).bind(ordId).run();
      }

      return new Response(JSON.stringify({
        success: true,
        reconciliation_id: reconId,
        reconciliation_code: reconCode,
        net_amount_cents: netAmountCents,
        cash_transaction_id: cashTransactionId,
        message: `Đã hoàn tất đối soát ${reconCode} và hạch toán vào Sổ quỹ!`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Hành động không hợp lệ' }), { status: 400 });
  } catch (err: any) {
    console.error('API delivery-reconciliations Error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Lỗi xử lý đối soát giao vận' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
