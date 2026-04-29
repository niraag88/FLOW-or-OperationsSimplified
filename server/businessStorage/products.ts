import { db } from "../db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { brands, products, type InsertProduct } from "@shared/schema";
import { getCompanySettings } from "./company-settings";

export async function getProductFilterOptions(): Promise<{ brands: string[]; sizes: string[] }> {
  const [brandRows, sizeRows] = await Promise.all([
    db.selectDistinct({ name: brands.name })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(eq(products.isActive, true))
      .orderBy(brands.name),
    db.selectDistinct({ size: products.size })
      .from(products)
      .where(and(eq(products.isActive, true), sql`${products.size} IS NOT NULL`))
      .orderBy(products.size),
  ]);
  return {
    brands: brandRows.map(r => r.name).filter(Boolean) as string[],
    sizes: sizeRows.map(r => r.size).filter(Boolean) as string[],
  };
}

export async function getProducts(params?: { page?: number; pageSize?: number; search?: string; category?: string; brandNames?: string[]; sizes?: string[] }): Promise<any> {
  const { page, pageSize, search, category, brandNames, sizes } = params || {};

  const conditions: any[] = [eq(products.isActive, true)];
  if (search) {
    conditions.push(sql`(${products.sku} ILIKE ${`%${search}%`} OR ${products.name} ILIKE ${`%${search}%`} OR coalesce(${products.description}, '') ILIKE ${`%${search}%`})`);
  }
  if (category) {
    conditions.push(eq(products.category, category));
  }
  if (brandNames && brandNames.length > 0) {
    conditions.push(inArray(brands.name, brandNames));
  }
  if (sizes && sizes.length > 0) {
    conditions.push(inArray(products.size, sizes));
  }
  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

  const selectFields = {
    id: products.id,
    sku: products.sku,
    name: products.name,
    description: products.description,
    brandId: products.brandId,
    category: products.category,
    unitPrice: products.unitPrice,
    costPrice: products.costPrice,
    costPriceCurrency: products.costPriceCurrency,
    vatRate: products.vatRate,
    unit: products.unit,
    size: products.size,
    stockQuantity: products.stockQuantity,
    minStockLevel: products.minStockLevel,
    maxStockLevel: products.maxStockLevel,
    isActive: products.isActive,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
    brandName: brands.name,
  };

  if (page && pageSize) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(whereCondition);

    const data = await db.select(selectFields)
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(whereCondition)
      .orderBy(desc(products.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total: Number(count) };
  }

  return await db.select(selectFields)
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .where(whereCondition)
    .orderBy(desc(products.createdAt));
}

export async function getProductById(id: number) {
  const [product] = await db.select({
    id: products.id,
    sku: products.sku,
    name: products.name,
    description: products.description,
    brandId: products.brandId,
    category: products.category,
    unitPrice: products.unitPrice,
    costPrice: products.costPrice,
    costPriceCurrency: products.costPriceCurrency,
    vatRate: products.vatRate,
    unit: products.unit,
    size: products.size,
    stockQuantity: products.stockQuantity,
    minStockLevel: products.minStockLevel,
    maxStockLevel: products.maxStockLevel,
    isActive: products.isActive,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
    brandName: brands.name,
  }).from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .where(eq(products.id, id));
  return product;
}

export async function createProduct(data: InsertProduct) {
  const [product] = await db.insert(products).values(data).returning();
  return product;
}

export async function updateProduct(id: number, data: Partial<InsertProduct>) {
  const [product] = await db.update(products).set({
    ...data,
    updatedAt: new Date()
  }).where(eq(products.id, id)).returning();
  return product;
}

export async function deleteProduct(id: number) {
  const [deletedProduct] = await db.delete(products).where(eq(products.id, id)).returning();
  return deletedProduct;
}

// Optimized method to get products with stock analysis
export async function getProductsWithStockAnalysis(lowStockThreshold: number = 6) {
  // Get all products with their brand names using proper join
  const allProducts = await db.select({
    id: products.id,
    sku: products.sku,
    name: products.name,
    description: products.description,
    brandId: products.brandId,
    brandName: brands.name,
    category: products.category,
    size: products.size,
    unitPrice: products.unitPrice,
    stockQuantity: products.stockQuantity,
    costPrice: products.costPrice,
    costPriceCurrency: products.costPriceCurrency,
    unit: products.unit,
    minStockLevel: products.minStockLevel,
    maxStockLevel: products.maxStockLevel,
    isActive: products.isActive,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt
  }).from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .where(eq(products.isActive, true))
    .orderBy(desc(products.updatedAt));

  // Fetch FX rates for multi-currency AED conversion
  const settings = await getCompanySettings();
  const fxGbpToAed = parseFloat(String(settings?.fxGbpToAed ?? 4.85));
  const fxUsdToAed = parseFloat(String(settings?.fxUsdToAed ?? 3.6725));
  const fxInrToAed = parseFloat(String(settings?.fxInrToAed ?? 0.044));
  const getRateToAed = (currency: string | null) => {
    const c = String(currency ?? 'GBP').toUpperCase();
    if (c === 'AED') return 1.0;
    if (c === 'USD') return fxUsdToAed;
    if (c === 'INR') return fxInrToAed;
    return fxGbpToAed; // default GBP
  };

  // Calculate stock summary aggregations server-side
  let totalItems = 0;
  let totalValue = 0; // AED (converted per product currency)
  let lowStockCount = 0;
  let outOfStockCount = 0;
  const lowStockProducts: typeof allProducts = [];
  const outOfStockProducts: typeof allProducts = [];

  allProducts.forEach(product => {
    const stock = product.stockQuantity || 0;
    const costPrice = parseFloat(String(product.costPrice) || '0');
    const rate = getRateToAed(product.costPriceCurrency);
    
    totalItems += stock;
    totalValue += stock * costPrice * rate; // Convert to AED using per-product currency rate

    if (stock === 0) {
      outOfStockCount++;
      outOfStockProducts.push(product);
    } else if (stock <= lowStockThreshold) {
      lowStockCount++;
      lowStockProducts.push(product);
    }
  });

  return {
    products: allProducts,
    stockSummary: {
      totalItems,
      totalValue,
      lowStockCount,
      outOfStockCount
    },
    lowStockProducts,
    outOfStockProducts
  };
}
