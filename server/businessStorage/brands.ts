import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { brands, type InsertBrand } from "@shared/schema";

export async function getBrands() {
  return await db.select().from(brands).where(eq(brands.isActive, true)).orderBy(desc(brands.createdAt));
}

export async function getBrandById(id: number) {
  const [brand] = await db.select().from(brands).where(eq(brands.id, id));
  return brand;
}

export async function createBrand(data: InsertBrand) {
  const [brand] = await db.insert(brands).values(data).returning();
  return brand;
}

export async function updateBrand(id: number, data: Partial<InsertBrand>) {
  const [brand] = await db.update(brands).set({
    ...data,
    updatedAt: new Date()
  }).where(eq(brands.id, id)).returning();
  return brand;
}

export async function deleteBrand(id: number) {
  const [deletedBrand] = await db.delete(brands).where(eq(brands.id, id)).returning();
  return deletedBrand;
}
