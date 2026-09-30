import type { D1Database } from '@cloudflare/workers-types';
import { integer, object } from './atomic.ts';

/** Validate before legacy writers can change suppliers, receipts or stock. */
export async function validatePurchaseInput(db: D1Database, raw: unknown, allowOverpaid = false) {
  const input=object(raw);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length>100) throw new Error('Phiếu nhập phải có từ 1 đến 100 dòng hàng.');
  if (!['DRAFT','COMPLETED'].includes(String(input.receipt_status ?? 'COMPLETED'))) throw new Error('Trạng thái phiếu nhập không hợp lệ.');
  if (!['CASH','BANK','DEBT'].includes(String(input.payment_method))) throw new Error('Phương thức trả tiền không hợp lệ.');
  if (input.supplier_id != null) {
    integer(input.supplier_id,'Nhà cung cấp',1);
    if (!await db.prepare('SELECT id FROM partners WHERE id=? AND is_supplier=1').bind(input.supplier_id).first()) throw new Error('Nhà cung cấp không tồn tại hoặc sai vai trò.');
  }
  let subtotal=0;
  for(const value of input.items){
    const item=object(value),id=integer(item.product_id,'Hàng hóa',1),qty=integer(item.quantity,'Số lượng',1),cost=integer(item.unit_cost_cents,'Giá nhập'),discount=integer(item.discount_cents??0,'Giảm giá dòng');
    if (!['NEW','QSD'].includes(String(item.condition))) throw new Error('Tình trạng hàng không hợp lệ.');
    const line=integer(qty*cost,'Tổng dòng hàng');if(discount>line)throw new Error('Giảm giá vượt giá trị dòng hàng.');
    subtotal=integer(subtotal+line-discount,'Tổng tiền hàng');
    if(!await db.prepare('SELECT id FROM products WHERE id=?').bind(id).first())throw new Error('Hàng hóa không tồn tại.');
    if(item.product_type_id!=null){integer(item.product_type_id,'Phân loại',1);if(!await db.prepare('SELECT id FROM product_types WHERE id=? AND product_id=?').bind(item.product_type_id,id).first())throw new Error('Phân loại không thuộc hàng hóa.');}
  }
  const discount=integer(input.discount_cents??0,'Giảm giá phiếu'),fee=integer(input.extra_fee_cents??0,'Chi phí NCC');integer(input.other_fee_cents??0,'Chi phí khác');
  if(discount>subtotal)throw new Error('Giảm giá phiếu vượt tiền hàng.');
  const total=integer(subtotal-discount+fee,'Tổng phải trả'),paid=integer(input.paid_amount_cents??0,'Tiền đã trả');
  if(paid>total&&!allowOverpaid)throw new Error('Tiền trả vượt tổng phiếu nhập.');
  if(input.payment_method==='DEBT' && paid>0)throw new Error('Có trả tiền phải chọn tiền mặt hoặc ngân hàng.');
}

export function validatePurchaseCompletion(receipt: {total_amount_cents:number;paid_amount_cents:number;debt_amount_cents:number;refunded_amount_cents?:number},raw:unknown){
  const input=raw==null?{}:object(raw),total=integer(receipt.total_amount_cents,'Tổng phiếu'),paid=integer(receipt.paid_amount_cents,'Tiền đã trả')-integer(receipt.refunded_amount_cents??0,'Tiền đã nhận hoàn');
  if(paid<0 || receipt.debt_amount_cents!==Math.max(0,total-paid))throw new Error('Tiền và nợ phiếu không khớp; cần đối chiếu.');
  const additional=integer(input.additional_paid_cents??0,'Tiền trả thêm');
  if(additional>Math.max(0,total-paid))throw new Error('Tiền trả thêm vượt khoản còn nợ.');
  if(!['CASH','BANK'].includes(String(input.payment_method??'CASH')))throw new Error('Phương thức thanh toán không hợp lệ.');
}
