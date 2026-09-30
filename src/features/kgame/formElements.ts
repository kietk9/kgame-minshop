/** A missing or mis-rendered control must stop submission rather than silently
 * turning a supplier, category, or serial selection into an empty value. */
export function requireSelect(selector: string, root: Document | HTMLElement | Element = document): HTMLSelectElement {
  const control = root.querySelector(selector);
  if (!(control instanceof HTMLSelectElement)) throw new Error(`Không tìm thấy trường chọn: ${selector}`);
  return control;
}
