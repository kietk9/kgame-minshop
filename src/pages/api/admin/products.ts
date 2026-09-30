import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  createProduct,
  deleteProduct,
  getProduct,
  syncPrimaryImage,
  setProductFile,
} from '../../../features/products/db';
import { setProductCategories, getCategoriesByPublicIds } from '../../../features/categories/db';
import { toggleProductActive, deleteProductSafe } from '../../../features/kgame/db';
import { parsePublicId } from '../../../features/ids/publicId';
import { indexProduct } from '../../../features/search';
import { parseProductForm } from '../../../features/products/form';
import { zonesRequireWeight } from '../../../features/shipping/calculator';
import { shippingFor } from '../../../features/shipping/effective';
import { uniqueSlug } from '../../../features/products/slug';
import { validateImage } from '../../../features/products/image';
import { optimizeUpload } from '../../../features/products/imageOptimize';
import { uploadMedia } from '../../../features/media/upload';
import { attachMediaToProduct } from '../../../features/media/db';
import { getStorage, getFileStorage } from '../../../features/storage';
import { uploadDigitalFile, validateDigitalFile } from '../../../features/products/digitalFile.ts';
import { attachmentActive } from '../../../features/digitalDelivery/rollout.ts';
import { CACHE_TAG } from '../../../features/cache/tags';
import { purgeCacheTags } from '../../../features/cache/purge';

export const prerender = false;

const fail = (msg: string) => `/admin/products/new?error=${encodeURIComponent(msg)}`;

// POST /api/admin/products — create a product (with optional image), or toggle/delete via JSON.
export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await request.json() as any;
      const action = data.action;
      const productId = Number(data.product_id || data.id);

      if (action === 'toggle_active') {
        const res = await toggleProductActive(env.DB, productId);
        return new Response(JSON.stringify({ success: true, ...res }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (action === 'delete') {
        const res = await deleteProductSafe(env.DB, productId);
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
      return new Response(JSON.stringify({ success: false, error: err.message || 'Lỗi xử lý hàng hóa' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const form = await request.formData();
  // The store's display unit, plus whether a blank weight would make this product
  // unsellable (every enabled zone prices by weight). Both come from settings the
  // request already loaded.
  const weightUnit = locals.settings?.weightUnit ?? 'g';
  const parsed = parseProductForm(form, {
    unit: weightUnit,
    requireWeight: zonesRequireWeight(shippingFor(locals.settings).config),
  });
  if ('error' in parsed) return redirect(fail(parsed.error), 303);

  let mediaId: number | null = null;
  const file = form.get('image');
  if (file instanceof File && file.size > 0) {
    const imgErr = validateImage(file);
    if (imgErr) return redirect(fail(imgErr), 303);
    // Every upload becomes a library item, whichever screen it came from.
    const media = await uploadMedia(env.DB, getStorage(), await optimizeUpload(file), file.name);
    mediaId = media.id;
  }

  const deliverable = form.get('deliverable');
  if (attachmentActive() && deliverable instanceof File && deliverable.size > 0) {
    const fileError = validateDigitalFile(deliverable);
    if (fileError) return redirect(fail(fileError), 303);
  }

  // Check duplicate product_code (SKU) if provided
  if (parsed.data.product_code) {
    const existingCode = await env.DB.prepare('SELECT id FROM products WHERE product_code = ?').bind(parsed.data.product_code).first();
    if (existingCode) {
      return redirect(fail(`Mã hàng hóa (SKU) '${parsed.data.product_code}' đã tồn tại! Vui lòng chọn mã khác.`), 303);
    }
  }

  // Check duplicate Program Code if quick unit is requested
  const initCode = String(form.get('init_program_code') ?? '').trim();
  const initUnitCheck = form.get('init_unit');
  if ((initUnitCheck != null || initCode) && initCode) {
    const existingUnit = await env.DB.prepare('SELECT id FROM product_units WHERE program_code = ?').bind(initCode).first();
    if (existingUnit) {
      return redirect(fail(`Mã Program Code '${initCode}' đã tồn tại trong hệ thống! Vui lòng kiểm tra lại.`), 303);
    }
  }

  // Slug from the optional slug field, else the name; made unique.
  const slugBase = String(form.get('slug') ?? '').trim() || parsed.data.name;
  const slug = await uniqueSlug(env.DB, slugBase);

  // image_key starts null and is derived from the gallery by syncPrimaryImage.
  // Writing the uploaded key here directly would be an UNGUARDED reference: the
  // media row is unreferenced until the attach lands, so a concurrent library
  // delete could leave the product pointing at an object that no longer exists.
  const productId = await createProduct(env.DB, { ...parsed.data, image_key: null, slug });
  if (attachmentActive() && deliverable instanceof File && deliverable.size > 0) {
    await setProductFile(env.DB, productId, await uploadDigitalFile(getFileStorage(), deliverable));
  }
  if (mediaId !== null) {
    const attached = await attachMediaToProduct(env.DB, productId, mediaId);
    if (!attached.ok) {
      // The claim needs a product id, so the row has to exist first. Undo it
      // rather than reporting a failure while leaving a half-made product
      // behind for the merchant to trip over on the next attempt.
      await deleteProduct(env.DB, productId);
      return redirect(fail(attached.error), 303);
    }
    await syncPrimaryImage(env.DB, productId); // promotes it to products.image_key
  }

  // Category membership: if category_id passed from select, link it; also preserve multi-category checkboxes
  const formCatId = parsed.data.category_id;
  const categoryPublicIds = form
    .getAll('category')
    .map((v) => parsePublicId(v, 'category'))
    .filter((v): v is string => v !== null);
  const resolvedCategoryIds = (await getCategoriesByPublicIds(env.DB, categoryPublicIds)).map((c) => c.id);
  const allCategoryIds = Array.from(new Set([...(formCatId ? [formCatId] : []), ...resolvedCategoryIds]));
  if (allCategoryIds.length > 0) await setProductCategories(env.DB, productId, allCategoryIds);

  // KGAME: Khởi tạo các phân loại / phiên bản (Product Types / Versions)
  const versionNames = form.getAll('version_name').map((v) => String(v).trim()).filter(Boolean);
  const salePrices = form.getAll('sale_price').map((v) => Number(v) || 0);
  const costPrices = form.getAll('cost_price').map((v) => Number(v) || 0);
  const trackingMode = parsed.data.tracking_mode ?? 'CODE';

  // Nếu không có mảng version_name, dùng initial_version_name đơn lẻ
  if (versionNames.length === 0) {
    versionNames.push(String(form.get('initial_version_name') ?? 'Tiêu chuẩn').trim() || 'Tiêu chuẩn');
    salePrices.push(Number(String(form.get('initial_sale_price') ?? parsed.data.price_cents).trim()) || parsed.data.price_cents);
    costPrices.push(Number(String(form.get('initial_cost_price') ?? '0').trim()) || 0);
  }

  const createdTypeIds: number[] = [];
  for (let i = 0; i < versionNames.length; i++) {
    const vName = versionNames[i];
    const sPrice = salePrices[i] ?? parsed.data.price_cents;
    const cPrice = costPrices[i] ?? 0;

    const typeRow = await env.DB.prepare(
      `INSERT INTO product_types (product_id, name, tracking_mode, sale_price_cents, cost_price_cents, cached_stock_new)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
    ).bind(
      productId,
      vName,
      trackingMode,
      sPrice,
      cPrice,
      (trackingMode === 'QUANTITY' && i === 0) ? parsed.data.stock : 0
    ).first<{ id: number }>();

    if (typeRow?.id) {
      createdTypeIds.push(typeRow.id);
    }
  }

  const unitVerIndex = Number(form.get('unit_version_index') ?? 0) || 0;
  const targetTypeId = createdTypeIds[unitVerIndex] ?? createdTypeIds[0];

  // KGAME: Tiện ích khởi tạo nhanh 1 bộ máy (Program Code) nếu người dùng nhập
  if ((initUnitCheck != null || initCode) && initCode && targetTypeId && trackingMode === 'CODE') {
    const defaultMfr = parsed.data.default_manufacturer ?? 'Tôi sản xuất';
    const isSelf = defaultMfr === 'Tôi sản xuất' ? 1 : 0;
    const expiryDays = isSelf ? (Number(form.get('init_expiry_days')) || 400) : null;
    const expiryDate = isSelf ? (String(form.get('init_expiry_date') ?? '').trim() || null) : null;
    const supplierName = String(form.get('init_supplier_name') ?? '').trim() || null;

    let finalExpiryDate = expiryDate;
    if (isSelf && !finalExpiryDate && expiryDays) {
      const d = new Date();
      d.setDate(d.getDate() + expiryDays);
      finalExpiryDate = d.toISOString().split('T')[0];
    }

    const unitCostPrice = costPrices[unitVerIndex] ?? 0;
    const unitSalePrice = salePrices[unitVerIndex] ?? parsed.data.price_cents;

    await env.DB.prepare(
      `INSERT INTO product_units (
        product_type_id, program_code, condition, availability, owner_type,
        is_self_produced, manufacturer_name, supplier_name, expiry_days, expiry_date,
        cost_price_cents, target_sale_price_cents
      ) VALUES (?, ?, 'NEW', 'IN_STOCK', 'KGAME', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      targetTypeId,
      initCode,
      isSelf,
      defaultMfr,
      supplierName,
      expiryDays,
      finalExpiryDate,
      unitCostPrice,
      unitSalePrice
    ).run();

    // Cập nhật tồn kho
    await env.DB.prepare(
      `UPDATE product_types SET cached_stock_new = cached_stock_new + 1 WHERE id = ?`
    ).bind(targetTypeId).run();

    await env.DB.prepare(
      `UPDATE products SET stock = stock + 1 WHERE id = ?`
    ).bind(productId).run();

    // Ghi nhận vào sổ kho Append-only
    const unitRow = await env.DB.prepare('SELECT id FROM product_units WHERE program_code = ?').bind(initCode).first<{ id: number }>();
    await env.DB.prepare(
      `INSERT INTO inventory_transactions (
        product_id, product_type_id, product_unit_id,
        condition, quantity, transaction_type, reference_type, unit_cost_cents, note
      ) VALUES (?, ?, ?, 'NEW', 1, 'PURCHASE', 'manual', ?, 'Khởi tạo mã bộ ban đầu khi tạo sản phẩm')`
    ).bind(productId, targetTypeId, unitRow?.id ?? null, unitCostPrice).run();
  }

  // Keep the semantic-search index in sync (no-op unless vector search is on).
  // Never let an indexing hiccup block the create.
  const created = await getProduct(env.DB, productId);
  try {
    if (created) await indexProduct(created);
  } catch (err) {
    console.error('Search index (create) failed:', err);
  }

  await purgeCacheTags([
    CACHE_TAG.catalog,
    ...(created?.public_id ? [CACHE_TAG.product(created.public_id)] : []),
  ]);
  return redirect('/admin/products', 303);
};
