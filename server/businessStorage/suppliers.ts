import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { suppliers, type InsertSupplier } from "@shared/schema";

export async function getSuppliers() {
  return await db.select().from(suppliers).where(eq(suppliers.isActive, true)).orderBy(desc(suppliers.createdAt));
}

export async function getSupplierById(id: number) {
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  return supplier;
}

export async function createSupplier(data: InsertSupplier) {
  const [supplier] = await db.insert(suppliers).values(data).returning();
  return supplier;
}

export async function updateSupplier(id: number, data: Partial<InsertSupplier>) {
  const [supplier] = await db.update(suppliers).set({
    ...data,
    updatedAt: new Date()
  }).where(eq(suppliers.id, id)).returning();
  return supplier;
}

export async function deleteSupplier(id: number) {
  const [deletedSupplier] = await db.delete(suppliers).where(eq(suppliers.id, id)).returning();
  return deletedSupplier;
}
