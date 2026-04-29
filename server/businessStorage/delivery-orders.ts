import { db } from "../db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { deliveryOrders, type InsertDeliveryOrder } from "@shared/schema";

// Delivery Order operations
export async function getDeliveryOrders(params?: {
  page?: number; pageSize?: number; search?: string;
  status?: string; customerId?: string; dateFrom?: string; dateTo?: string;
  taxTreatment?: string; excludeYears?: string;
}): Promise<any> {
  const { page, pageSize, search, status, customerId, dateFrom, dateTo, excludeYears, taxTreatment } = params || {};

  const conditions: any[] = [];
  if (search) {
    conditions.push(sql`(${deliveryOrders.orderNumber} ILIKE ${`%${search}%`} OR ${deliveryOrders.customerName} ILIKE ${`%${search}%`} OR coalesce(${deliveryOrders.notes}, '') ILIKE ${`%${search}%`})`);
  }
  if (status) {
    const statuses = status.split(',').filter(Boolean);
    if (statuses.length === 1) conditions.push(eq(deliveryOrders.status, statuses[0]));
    else if (statuses.length > 1) conditions.push(inArray(deliveryOrders.status, statuses));
  }
  if (customerId) {
    const ids = String(customerId).split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
    if (ids.length === 1) conditions.push(eq(deliveryOrders.customerId, ids[0]));
    else if (ids.length > 1) conditions.push(inArray(deliveryOrders.customerId, ids));
  }
  if (dateFrom) conditions.push(sql`${deliveryOrders.orderDate}::date >= ${dateFrom}::date`);
  if (dateTo) conditions.push(sql`${deliveryOrders.orderDate}::date <= ${dateTo}::date`);
  if (excludeYears) {
    for (const range of excludeYears.split(';').filter(Boolean)) {
      const [start, end] = range.split(',');
      if (start && end) conditions.push(sql`NOT (${deliveryOrders.orderDate}::date >= ${start}::date AND ${deliveryOrders.orderDate}::date <= ${end}::date)`);
    }
  }
  if (taxTreatment) {
    const treatments = taxTreatment.split(',').filter(Boolean);
    if (treatments.length === 1) conditions.push(eq(deliveryOrders.taxTreatment, treatments[0]));
    else if (treatments.length > 1) conditions.push(inArray(deliveryOrders.taxTreatment, treatments));
  }
  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(deliveryOrders)
    .where(whereCondition);

  const baseQ = db.select().from(deliveryOrders).where(whereCondition).orderBy(desc(deliveryOrders.createdAt));
  const data = (page && pageSize)
    ? await baseQ.limit(pageSize).offset((page - 1) * pageSize)
    : await baseQ;
  return (page && pageSize) ? { data, total: Number(count) } : data;
}

export async function getDeliveryOrderById(id: number) {
  const [deliveryOrder] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
  return deliveryOrder;
}

export async function createDeliveryOrder(data: InsertDeliveryOrder) {
  const [deliveryOrder] = await db.insert(deliveryOrders).values(data).returning();
  return deliveryOrder;
}

export async function updateDeliveryOrder(id: number, data: Partial<InsertDeliveryOrder>) {
  const [deliveryOrder] = await db.update(deliveryOrders).set(data).where(eq(deliveryOrders.id, id)).returning();
  return deliveryOrder;
}

export async function deleteDeliveryOrder(id: number) {
  const [deletedDeliveryOrder] = await db.delete(deliveryOrders).where(eq(deliveryOrders.id, id)).returning();
  return deletedDeliveryOrder;
}
