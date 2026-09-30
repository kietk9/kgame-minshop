import { AtomicBatch, integer } from './atomic.ts';
import type { PosItem } from './posInput.ts';

interface ProductRow { price_cents:number; price_used_cents:number; id: number; name: string; stock: number; stock_new: number; stock_used: number;
  tracking_mode: string; has_serial: number; cost_price_cents: number; cost_price_used_cents: number }
interface TypeRow { sale_price_cents?:number; id: number; product_id: number; name: string; cached_stock_new: number; cached_stock_used: number; cost_price_cents: number; cost_price_used_cents?: number|null; tracking_mode: string }
export interface PreparedPosItem extends PosItem { product_type_id: number; product_name: string; type_name: string; unit_cost_cents: number }

export async function prepareStock(batch: AtomicBatch, items: PosItem[], options: { requireCatalogPrice?:boolean; preorder?: boolean; fulfillOrderId?: number; allowUnlinkedUnits?: boolean } = {}) {
  const prepared: PreparedPosItem[] = [];
  const productDemand = new Map<string, number>();
  const typeDemand = new Map<string, number>();
  const units = new Set<number>();
  const newTypes = new Map<number, TypeRow>();
  let nextTypeId: number | null = null;
  for (const item of items) {
    const product = await batch.db.prepare('SELECT * FROM products WHERE id = ?').bind(item.product_id).first<ProductRow>();
    if (!product) throw new Error('Không tìm thấy hàng hóa.');
    await batch.assert('EXISTS(SELECT 1 FROM products WHERE id = ? AND tracking_mode IS ? AND has_serial IS ? AND cost_price_cents IS ? AND cost_price_used_cents IS ?)',
      [product.id, product.tracking_mode, product.has_serial, product.cost_price_cents, product.cost_price_used_cents], 'Cách quản lý hoặc giá vốn hàng hóa vừa thay đổi.');
    let type: TypeRow | null = null;
    if (item.product_type_id) {
      type = await batch.db.prepare('SELECT * FROM product_types WHERE id = ? AND product_id = ?')
        .bind(item.product_type_id, product.id).first<TypeRow>();
      if (!type) throw new Error('Phân loại không thuộc hàng hóa đã chọn.');
    } else {
      const types = await batch.db.prepare('SELECT * FROM product_types WHERE product_id = ? ORDER BY id LIMIT 2').bind(product.id).all<TypeRow>();
      if (types.results.length > 1) throw new Error('Hàng hóa có nhiều phiên bản. Vui lòng chọn đúng phiên bản.');
      type = types.results[0] ?? newTypes.get(product.id) ?? null;
      if (!type) {
        if (item.product_unit_id) throw new Error('Serial phải có phân loại hợp lệ.');
        if (nextTypeId === null) {
          const row = await batch.db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM product_types').first<{ id: number }>();
          nextTypeId = row!.id;
        }
        type = { id: nextTypeId++, product_id: product.id, name: 'Tiêu chuẩn', tracking_mode: product.tracking_mode,
          cached_stock_new: product.stock_new, cached_stock_used: product.stock_used, cost_price_cents: product.cost_price_cents };
        newTypes.set(product.id, type);
        await batch.assert('NOT EXISTS(SELECT 1 FROM product_types WHERE product_id = ?)', [product.id], 'Phân loại vừa thay đổi.');
        batch.add(`INSERT INTO product_types (id, product_id, name, tracking_mode, sale_price_cents, cost_price_cents, cached_stock_new, cached_stock_used)
          SELECT ?, id, 'Tiêu chuẩn', tracking_mode, ?, cost_price_cents, stock_new, stock_used FROM products WHERE id = ?`, type.id, item.unit_price_cents, product.id);
      }
    }
    if(options.requireCatalogPrice){
      const typePrice=type.sale_price_cents || 0;
      const expected=item.condition==='QSD'
        ? product.price_used_cents || typePrice || product.price_cents || 0
        : typePrice || product.price_cents || product.price_used_cents || 0;
      if(item.unit_price_cents!==expected)throw new Error('Bạn chưa được cấp quyền đổi giá bán. Vui lòng dùng giá niêm yết hiện tại.');
      await batch.assert('EXISTS(SELECT 1 FROM products WHERE id=? AND price_cents IS ? AND price_used_cents IS ?)',[product.id,product.price_cents,product.price_used_cents],'Giá bán vừa thay đổi.');
      if(!newTypes.has(product.id))await batch.assert('EXISTS(SELECT 1 FROM product_types WHERE id=? AND sale_price_cents IS ?)',[type.id,type.sale_price_cents??null],'Giá phiên bản vừa thay đổi.');
    }
    const serialized = product.tracking_mode === 'CODE' || product.has_serial === 1 || type.tracking_mode === 'CODE';
    if (serialized && !item.product_unit_id && !options.preorder) throw new Error('Hàng quản lý theo serial phải chọn đúng serial trước khi xuất bán.');
    if (!serialized && item.product_unit_id) throw new Error('Hàng hóa không được quản lý theo serial.');
    if (!newTypes.has(product.id)) {
      await batch.assert('EXISTS(SELECT 1 FROM product_types WHERE id = ? AND product_id = ? AND tracking_mode IS ? AND cost_price_cents IS ? AND cost_price_used_cents IS ?)',
        [type.id, product.id, type.tracking_mode, type.cost_price_cents,type.cost_price_used_cents??null], 'Phân loại hoặc giá vốn vừa thay đổi.');
    }
    let cost = item.condition === 'QSD' ? (type.cost_price_used_cents??product.cost_price_used_cents) : type.cost_price_cents;
    if (cost == null) cost = product.cost_price_cents ?? 0;
    if (item.product_unit_id) {
      if (units.has(item.product_unit_id)) throw new Error('Một serial không được xuất hiện hai lần trong cùng đơn.');
      units.add(item.product_unit_id);
      const unit = await batch.db.prepare('SELECT cost_price_cents FROM product_units WHERE id = ?').bind(item.product_unit_id).first<{ cost_price_cents: number }>();
      if (!unit) throw new Error('Không tìm thấy serial.');
      const availability = options.fulfillOrderId ? "pu.availability IN ('RESERVED', 'IN_STOCK')" : "pu.availability = 'IN_STOCK'";
      const ownLink = options.fulfillOrderId ? options.allowUnlinkedUnits
        ? `AND (pu.availability = 'IN_STOCK' OR EXISTS(SELECT 1 FROM order_units ou JOIN order_lines ol ON ol.id = ou.order_line_id WHERE ou.product_unit_id = pu.id AND ol.order_id = ?))`
        : `AND EXISTS(SELECT 1 FROM order_units ou JOIN order_lines ol ON ol.id = ou.order_line_id WHERE ou.product_unit_id = pu.id AND ol.order_id = ?)` : '';
      const values: unknown[] = [item.product_unit_id, type.id, item.condition];
      if (options.fulfillOrderId) values.push(options.fulfillOrderId);
      values.push(options.fulfillOrderId ?? -1);
      await batch.assert(`EXISTS(SELECT 1 FROM product_units pu WHERE pu.id = ? AND pu.product_type_id = ? AND pu.condition = ?
        AND pu.owner_type = 'KGAME' AND ${availability} ${ownLink}
        AND NOT EXISTS(SELECT 1 FROM order_units ou JOIN order_lines ol ON ol.id = ou.order_line_id JOIN orders o ON o.id = ol.order_id
          WHERE ou.product_unit_id = pu.id AND o.order_type = 'PREORDER' AND o.order_status NOT IN ('CANCELLED','COMPLETED') AND o.id != ?))`,
      values, 'Serial không sẵn sàng, không thuộc cửa hàng hoặc đã giữ cho đơn khác.');
      await batch.assert('EXISTS(SELECT 1 FROM product_units WHERE id = ? AND cost_price_cents IS ?)', [item.product_unit_id, unit.cost_price_cents], 'Giá vốn serial vừa thay đổi.');
      cost = unit.cost_price_cents;
    }
    prepared.push({ ...item, product_type_id: type.id, product_name: product.name, type_name: type.name,
      unit_cost_cents: integer(cost, 'Giá vốn') });
    if (!options.preorder) {
      const pk = `${product.id}:${item.condition}`, tk = `${type.id}:${item.condition}`;
      productDemand.set(pk, (productDemand.get(pk) ?? 0) + item.quantity);
      typeDemand.set(tk, (typeDemand.get(tk) ?? 0) + item.quantity);
    }
  }
  for (const [key, qty] of productDemand) {
    integer(qty, 'Tổng số lượng', 1);
    const [id, condition] = key.split(':');
    const column = condition === 'QSD' ? 'stock_used' : 'stock_new';
    await batch.assert(`EXISTS(SELECT 1 FROM products WHERE id = ? AND ${column} >= ? AND stock >= ?
      AND typeof(stock) = 'integer' AND typeof(stock_new) = 'integer' AND typeof(stock_used) = 'integer'
      AND stock = stock_new + stock_used AND stock_new >= 0 AND stock_used >= 0)`, [Number(id), qty, qty], 'Không đủ tồn kho hoặc tồn mới/cũ đang lệch.');
  }
  for (const [key, qty] of typeDemand) {
    const [id, condition] = key.split(':');
    if ([...newTypes.values()].some(type => type.id === Number(id))) continue;
    const column = condition === 'QSD' ? 'cached_stock_used' : 'cached_stock_new';
    await batch.assert(`EXISTS(SELECT 1 FROM product_types WHERE id = ? AND typeof(${column}) = 'integer' AND ${column} >= ?)`, [Number(id), qty], 'Không đủ tồn kho của phiên bản đã chọn.');
  }
  return prepared;
}

export function writeStock(batch: AtomicBatch, line: PreparedPosItem, orderRef: string, orderValues: unknown[], preorder = false,
  movement = { type: 'SALE', reference: 'ORDER', note: 'Xuất bán đơn hàng' }) {
  if (line.product_unit_id) {
    batch.add("UPDATE product_units SET availability = ?, updated_at = datetime('now') WHERE id = ?",
      preorder ? 'RESERVED' : 'SOLD', line.product_unit_id);
  }
  if (preorder) return;
  batch.add(`INSERT INTO inventory_transactions (product_id, product_type_id, product_unit_id, condition, quantity,
    transaction_type, reference_type, reference_id, unit_cost_cents, location_id, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ${orderRef}, ?, 'MAIN', ?)`,
  line.product_id, line.product_type_id, line.product_unit_id, line.condition, -line.quantity, movement.type, movement.reference,
  ...orderValues, line.unit_cost_cents, movement.note);
  const typeColumn = line.condition === 'QSD' ? 'cached_stock_used' : 'cached_stock_new';
  const productColumn = line.condition === 'QSD' ? 'stock_used' : 'stock_new';
  batch.add(`UPDATE product_types SET ${typeColumn} = ${typeColumn} - ?, updated_at = datetime('now') WHERE id = ?`, line.quantity, line.product_type_id);
  batch.add(`UPDATE products SET ${productColumn} = ${productColumn} - ?, stock = stock - ? WHERE id = ?`, line.quantity, line.quantity, line.product_id);
}
