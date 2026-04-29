import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { stockCounts, stockCountItems, users } from "@shared/schema";

export async function getStockCounts() {
  return await db.select({
    id: stockCounts.id,
    count_date: stockCounts.countDate,
    total_products: stockCounts.totalProducts,
    total_quantity: stockCounts.totalQuantity,
    created_by: users.username,
    created_at: stockCounts.createdAt,
    updated_at: stockCounts.updatedAt,
  }).from(stockCounts)
    .leftJoin(users, eq(stockCounts.createdBy, users.id))
    .orderBy(desc(stockCounts.createdAt));
}

export async function getStockCountById(id: number) {
  const [stockCount] = await db.select().from(stockCounts).where(eq(stockCounts.id, id));
  if (!stockCount) return null;

  const items = await db.select().from(stockCountItems).where(eq(stockCountItems.stockCountId, id));
  
  return {
    id: stockCount.id,
    count_date: stockCount.countDate,
    total_products: stockCount.totalProducts,
    total_quantity: stockCount.totalQuantity,
    created_by: stockCount.createdBy,
    created_at: stockCount.createdAt,
    updated_at: stockCount.updatedAt,
    items
  };
}

export async function createStockCount(data: { items: any[], createdBy: string }) {
  const totalProducts = data.items.filter(item => item.quantity > 0).length;
  const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);

  const [stockCount] = await db.insert(stockCounts).values({
    countDate: new Date(),
    totalProducts,
    totalQuantity,
    createdBy: data.createdBy,
  }).returning();

  const itemsToInsert = data.items.filter(item => item.quantity > 0).map(item => ({
    stockCountId: stockCount.id,
    productId: item.product_id,
    productCode: item.product_code,
    brandName: item.brand_name,
    productName: item.product_name,
    size: item.size,
    quantity: item.quantity,
  }));

  if (itemsToInsert.length > 0) {
    await db.insert(stockCountItems).values(itemsToInsert);
  }

  return {
    id: stockCount.id,
    count_date: stockCount.countDate,
    total_products: stockCount.totalProducts,
    total_quantity: stockCount.totalQuantity,
    created_by: stockCount.createdBy,
    created_at: stockCount.createdAt,
    updated_at: stockCount.updatedAt,
    items: itemsToInsert
  };
}

export async function deleteStockCount(id: number) {
  await db.delete(stockCountItems).where(eq(stockCountItems.stockCountId, id));
  await db.delete(stockCounts).where(eq(stockCounts.id, id));
  return true;
}
