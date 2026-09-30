import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ProductForm from '../../src/features/products/ProductForm.astro';
import type { Product } from '../../src/features/products/db';

const product: Product = {
  id: 1, public_id: 'prod_0000000001', name: 'Sản phẩm thử', slug: 'test',
  description: null, price_cents: 100, currency: 'vnd', image_key: null, stock: 1,
  active: 1, variant_label: null, weight_grams: 1250, requires_shipping: 1,
  file_key: 'deliverables/test/guide.pdf', file_name: 'guide.pdf',
  file_mime: 'application/pdf', file_size_bytes: 2048, related_ids: null,
  created_at: '2026-01-01',
};

async function render(props: Record<string, unknown> = {}) {
  const container = await AstroContainer.create();
  return container.renderToString(ProductForm, { props: {
    action: '/api/admin/products', submitLabel: 'Lưu', ...props,
  } });
}

describe('product form operational fields', () => {
  it('creates physical products with shipping enabled and a weight input', async () => {
    const html = await render();
    expect(html).toMatch(/name="requires_shipping"[^>]*checked/);
    expect(html).toMatch(/name="weight"/);
    expect(html).toMatch(/name="deliverable"[^>]*type="file"/);
    expect(html).not.toContain('name="remove_deliverable"');
  });
  it('preserves stored weight, file information and attachment removal controls while editing', async () => {
    const html = await render({ product, weightUnit: 'kg' });
    expect(html).toMatch(/name="weight"[^>]*value="1\.25"/);
    expect(html).toContain('guide.pdf');
    expect(html).toContain('2 KB');
    expect(html).toContain('name="remove_deliverable"');
  });
  it('keeps digital products exempt from shipping', async () => {
    const html = await render({ product: { ...product, requires_shipping: 0 } });
    expect(html).toMatch(/name="requires_shipping"[^>]*>/);
    expect(html).not.toMatch(/name="requires_shipping"[^>]*checked/);
  });
});
