/**
 * Canonical low-stock classification used by both the Dashboard and the
 * Inventory page.  Keeps the two pages in sync — change logic here only.
 *
 * "Out of stock"  →  stockQuantity === 0  (separate category)
 * "Low stock"     →  0 < stockQuantity <= threshold
 * "In stock"      →  stockQuantity > threshold
 */
export function isLowStock(stockQuantity, threshold) {
  const qty = Number(stockQuantity) || 0;
  const limit = Number(threshold) || 6;
  return qty > 0 && qty <= limit;
}

export function isOutOfStock(stockQuantity) {
  return (Number(stockQuantity) || 0) === 0;
}
