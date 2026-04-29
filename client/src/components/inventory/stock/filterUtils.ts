import type { StockProduct, StockMovement } from "./types";

export function applyAdvancedStockFilters(
  productList: StockProduct[],
  searchTerm: string,
  selectedBrands: string[],
  selectedSizes: string[],
  selectedStatus: string[],
  stockLevelRange: { min: string; max: string },
  lowStockThreshold: number,
): StockProduct[] {
  let filtered = productList;

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter((product: StockProduct) =>
      (product.name || '').toLowerCase().includes(term) ||
      (product.sku || '').toLowerCase().includes(term) ||
      (product.brandName || '').toLowerCase().includes(term) ||
      (product.description || '').toLowerCase().includes(term)
    );
  }

  if (selectedBrands.length > 0) {
    filtered = filtered.filter((product: StockProduct) => selectedBrands.includes(product.brandName));
  }

  if (selectedSizes.length > 0) {
    filtered = filtered.filter((product: StockProduct) => selectedSizes.includes(product.size));
  }

  if (stockLevelRange.min !== "" || stockLevelRange.max !== "") {
    const min = stockLevelRange.min !== "" ? parseInt(stockLevelRange.min) : 0;
    const max = stockLevelRange.max !== "" ? parseInt(stockLevelRange.max) : Infinity;
    filtered = filtered.filter((product: StockProduct) => {
      const stock = product.stockQuantity || 0;
      return stock >= min && stock <= max;
    });
  }

  if (selectedStatus.length > 0) {
    filtered = filtered.filter((product: StockProduct) => {
      const stock = product.stockQuantity || 0;
      const isInStock = stock > lowStockThreshold;
      const isLowStock = stock > 0 && stock <= lowStockThreshold;
      const isOutOfStock = stock === 0;

      return selectedStatus.some((status: string) => {
        if (status === 'in-stock' && isInStock) return true;
        if (status === 'low-stock' && isLowStock) return true;
        if (status === 'out-of-stock' && isOutOfStock) return true;
        return false;
      });
    });
  }

  return filtered;
}

export function applyAdvancedMovementFilters(
  movementList: StockMovement[],
  searchTerm: string,
  selectedBrands: string[],
  selectedTypes: string[],
  dateRange: { start: string; end: string },
): StockMovement[] {
  let filtered = movementList;

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter((movement: StockMovement) =>
      (movement.productName || '').toLowerCase().includes(term) ||
      (movement.productSku || '').toLowerCase().includes(term) ||
      (movement.brandName || '').toLowerCase().includes(term) ||
      (movement.movementType || '').toLowerCase().includes(term) ||
      (movement.notes || '').toLowerCase().includes(term)
    );
  }

  if (selectedBrands.length > 0) {
    filtered = filtered.filter((movement: StockMovement) => selectedBrands.includes(movement.brandName));
  }

  if (selectedTypes.length > 0) {
    filtered = filtered.filter((movement: StockMovement) => selectedTypes.includes(movement.movementType));
  }

  if (dateRange.start || dateRange.end) {
    filtered = filtered.filter((movement: StockMovement) => {
      const movementDateStr = (movement.createdAt || '').slice(0, 10);
      if (dateRange.start && movementDateStr < dateRange.start) return false;
      if (dateRange.end && movementDateStr > dateRange.end) return false;
      return true;
    });
  }

  return filtered;
}

export function paginateData<T>(data: T[], page: number, perPage: number) {
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  return {
    data: data.slice(startIndex, endIndex),
    totalPages: Math.ceil(data.length / perPage),
    startIndex,
    endIndex: Math.min(endIndex, data.length),
    totalItems: data.length,
  };
}
