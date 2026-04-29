export interface StockProduct {
  id: number;
  sku: string;
  name: string;
  description?: string | null;
  brandName: string;
  brandId: number;
  size: string;
  stockQuantity: number;
  minStockLevel: number;
  maxStockLevel: number;
  unitPrice: string;
  costPrice: string;
  costPriceCurrency: string;
  isActive: boolean;
}

export interface StockMovement {
  id: number;
  productId: number;
  productName: string;
  productSku: string;
  brandName: string;
  movementType: string;
  referenceId: number;
  referenceType: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost: string;
  notes: string;
  createdAt: string;
}

export interface StockData {
  products: StockProduct[];
  lowStockProducts: StockProduct[];
  outOfStockProducts: StockProduct[];
  stockSummary: {
    totalItems: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
}

export interface CompanySettings {
  lowStockThreshold: number;
  fxGbpToAed: number;
  fxUsdToAed: number;
  fxInrToAed: number;
  taxNumber?: string;
  vatNumber?: string;
  company_trn?: string;
}
