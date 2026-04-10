export function isLowStock(stockQuantity: number | string | null | undefined, threshold: number | string | null | undefined): boolean {
  const qty = Number(stockQuantity) || 0;
  const limit = Number(threshold) || 6;
  return qty > 0 && qty <= limit;
}

export function isOutOfStock(stockQuantity: number | string | null | undefined): boolean {
  return (Number(stockQuantity) || 0) === 0;
}
