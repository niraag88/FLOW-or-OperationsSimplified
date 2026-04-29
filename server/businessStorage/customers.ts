import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { customers, type InsertCustomer } from "@shared/schema";

export async function getCustomers() {
  return await db.select().from(customers).where(eq(customers.isActive, true)).orderBy(desc(customers.createdAt));
}

export async function getCustomerById(id: number) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  return customer;
}

export async function createCustomer(data: InsertCustomer) {
  const [customer] = await db.insert(customers).values(data).returning();
  return customer;
}

export async function updateCustomer(id: number, data: Partial<InsertCustomer>) {
  const [customer] = await db.update(customers).set({
    ...data,
    updatedAt: new Date()
  }).where(eq(customers.id, id)).returning();
  return customer;
}
