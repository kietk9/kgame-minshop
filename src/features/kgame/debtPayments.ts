import type { D1Database } from '@cloudflare/workers-types';
import { AtomicBatch, commitOperation, executeOperation, fingerprint, integer, object, requestKey, text } from './atomic.ts';
import { parsePayment } from './posInput.ts';
import { planPosOrderPayment } from './pos.ts';
import { writeCashEntry } from './cashbook.ts';

interface DebtItem { id: number; amount_cents: number; doc_type: 'ORDER'|'PURCHASE'|'REPAIR' }
const repairPaidSql = `(SELECT COALESCE(SUM(CASE WHEN flow_type = 'IN' THEN amount_cents ELSE -amount_cents END),0)
  FROM cash_transactions WHERE LOWER(reference_type) IN ('repair','repair_ticket') AND reference_id = ? AND category = 'REPAIR_FEE' AND COALESCE(status,'ACTIVE') != 'CANCELLED')`;
const purchasePaidSql = `(SELECT COALESCE(SUM(CASE WHEN flow_type = 'OUT' THEN amount_cents ELSE -amount_cents END),0)
  FROM cash_transactions WHERE LOWER(reference_type) = 'purchase_receipt' AND reference_id = ? AND category IN ('PURCHASE','DEPOSIT','REFUND') AND COALESCE(status,'ACTIVE') != 'CANCELLED')`;

export async function payPartnerDebt(db: D1Database, raw: unknown): Promise<{ success: boolean; transactions: string[] }> {
  const input = object(raw), partnerId = integer(input.partner_id, 'Đối tác', 1);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) throw new Error('Chọn từ 1 đến 100 chứng từ.');
  const seen = new Set<string>();
  const items: DebtItem[] = input.items.map(rawItem => {
    const item = object(rawItem), docType = item.doc_type ?? input.target_type;
    if (!['ORDER','PURCHASE','REPAIR'].includes(String(docType))) throw new Error('Loại chứng từ không hợp lệ.');
    const id = integer(item.id, 'Chứng từ', 1), type = docType as DebtItem['doc_type'];
    const identity = `${type}:${id}`;
    if (seen.has(identity)) throw new Error('Một chứng từ không được chọn hai lần.');
    seen.add(identity);
    return { id, doc_type: type, amount_cents: integer(item.amount_cents, 'Tiền thanh toán', 1) };
  });
  const isPurchase = items[0].doc_type === 'PURCHASE';
  if (items.some(item => (item.doc_type === 'PURCHASE') !== isPurchase)) throw new Error('Tách riêng thu nợ khách và chi nợ nhà cung cấp.');
  if (!['CASH','BANK'].includes(String(input.payment_method))) throw new Error('Chọn tiền mặt hoặc ngân hàng.');
  integer(items.reduce((sum,item) => sum + item.amount_cents,0), 'Tổng tiền thanh toán', 1);
  const method = input.payment_method as 'CASH'|'BANK', bank = text(input.bank_name), note = text(input.note), actor = text(input.created_by, 'Thu ngân');
  const key = `debt:${requestKey(input.request_id)}`, hash = await fingerprint({ partnerId, items, method, bank, note, actor });
  return executeOperation(db, key, hash, async () => {
    const batch = new AtomicBatch(db), role = isPurchase ? 'is_supplier' : 'is_customer';
    const partner = await db.prepare(`SELECT name FROM partners WHERE id = ? AND ${role} = 1`).bind(partnerId).first<{name:string}>();
    if (!partner) throw new Error('Đối tác không tồn tại hoặc không đúng vai trò.');
    await batch.assert(`EXISTS(SELECT 1 FROM partners WHERE id = ? AND ${role} = 1)`, [partnerId], 'Vai trò đối tác vừa thay đổi.');
    const keys: string[] = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index], itemKey = `${key}:${index}`; keys.push(itemKey);
      if (item.doc_type === 'ORDER') {
        await planPosOrderPayment(batch, item.id, parsePayment({ amount_paid_cents: item.amount_cents, payment_method: method, bank_name: bank, note, created_by: actor }), itemKey, partnerId);
        continue;
      }
      let code: string;
      if (item.doc_type === 'PURCHASE') {
        const receipt = await db.prepare('SELECT * FROM purchase_receipts WHERE id = ?').bind(item.id).first<{ supplier_id:number; receipt_status:string; receipt_code:string; total_amount_cents:number; paid_amount_cents:number; debt_amount_cents:number; refunded_amount_cents:number; returned_amount_cents:number }>();
        if (!receipt || receipt.supplier_id !== partnerId) throw new Error('Phiếu nhập không thuộc nhà cung cấp đã chọn.');
        if (!['DRAFT','COMPLETED'].includes(receipt.receipt_status)) throw new Error('Phiếu nhập đã hủy hoặc không còn được thanh toán.');
        const total = integer(receipt.total_amount_cents,'Tổng phiếu nhập'), paid = integer(receipt.paid_amount_cents,'Tiền đã trả'), debt = integer(receipt.debt_amount_cents,'Nợ phiếu nhập');
        if (debt !== Math.max(0,total - (receipt.returned_amount_cents??0) - paid + (receipt.refunded_amount_cents??0))) throw new Error('Công nợ phiếu nhập đang lệch. Cần rà soát trước khi trả thêm.');
        if (item.amount_cents > debt) throw new Error('Tiền trả vượt nợ phiếu nhập.');
        await batch.assert(`EXISTS(SELECT 1 FROM purchase_receipts WHERE id = ? AND supplier_id = ? AND receipt_status = ? AND total_amount_cents = ? AND paid_amount_cents = ? AND debt_amount_cents = ? AND returned_amount_cents = ?)`, [item.id,partnerId,receipt.receipt_status,total,paid,debt,receipt.returned_amount_cents??0], 'Phiếu nhập vừa thay đổi.');
        await batch.assert(`${purchasePaidSql} = ?`, [item.id,paid-(receipt.refunded_amount_cents??0)], 'Phiếu chi đang lệch tiền đã trả trên phiếu nhập.');
        batch.add("UPDATE purchase_receipts SET paid_amount_cents = ?, debt_amount_cents = ? WHERE id = ?", paid + item.amount_cents, debt - item.amount_cents, item.id);
        code = receipt.receipt_code;
      } else {
        const ticket = await db.prepare('SELECT * FROM repair_tickets WHERE id = ?').bind(item.id).first<{ customer_id:number; owner_type:string; status:string; repair_price_cents:number; ticket_code:string }>();
        if (!ticket || ticket.customer_id !== partnerId || ticket.owner_type !== 'CUSTOMER' || ticket.status === 'CANCELLED') throw new Error('Phiếu sửa không thuộc khách đã chọn hoặc đã hủy.');
        // Repairs still use legacy customers. Never equate unrelated rows merely
        // because their numeric ids collide with the unified partners table.
        await batch.assert('EXISTS(SELECT 1 FROM customers c JOIN partners p ON p.id = c.id WHERE c.id = ? AND p.is_customer = 1 AND c.customer_code IS NOT NULL AND c.customer_code = p.partner_code)', [partnerId], 'Định danh khách sửa chữa chưa khớp danh bạ; cần đối chiếu trước khi thu.');
        const total = integer(ticket.repair_price_cents,'Giá sửa chữa');
        const row = await db.prepare(`SELECT ${repairPaidSql} AS paid`).bind(item.id).first<{paid:number}>();
        const paid = integer(row!.paid,'Tiền sửa đã thu');
        if (paid > total || item.amount_cents > total - paid) throw new Error('Tiền thu vượt nợ sửa chữa hoặc lịch sử đang lệch.');
        await batch.assert('EXISTS(SELECT 1 FROM repair_tickets WHERE id = ? AND customer_id = ? AND owner_type = ? AND status = ? AND repair_price_cents = ?)', [item.id,partnerId,ticket.owner_type,ticket.status,total], 'Phiếu sửa vừa thay đổi.');
        await batch.assert(`${repairPaidSql} = ?`, [item.id,paid], 'Tiền sửa đã thu vừa thay đổi.');
        code = ticket.ticket_code;
      }
      writeCashEntry(batch, { flow_type:isPurchase ? 'OUT':'IN', account_type:method, category:isPurchase ? 'PURCHASE':'REPAIR_FEE', amount_cents:item.amount_cents,
        reference_type:isPurchase ? 'purchase_receipt':'repair_ticket', reference_id:item.id, recipient_name:partner.name, bank_name:bank || null, note:note || `Thanh toán công nợ ${code}`, created_by:actor }, itemKey);
    }
    batch.add(`INSERT INTO kgame_operations(operation_key,kind,payload_hash,result_json)
      VALUES (?, 'PARTNER_DEBT', ?, json_object('success',json('true'),'transactions',json((SELECT json_group_array(transaction_code) FROM (SELECT transaction_code FROM cash_transactions WHERE operation_key IN (${keys.map(()=>'?').join(',')}) ORDER BY id)))))`, key, hash, ...keys);
    return commitOperation<{ success: boolean; transactions: string[] }>(batch,key,hash);
  });
}
