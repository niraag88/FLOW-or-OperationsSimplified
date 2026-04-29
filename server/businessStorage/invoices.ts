import { db } from "../db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { invoices, type InsertInvoice } from "@shared/schema";

// Invoice operations
export async function getInvoices(params?: {
  page?: number; pageSize?: number; search?: string;
  status?: string; customerId?: string; dateFrom?: string; dateTo?: string;
  taxTreatment?: string; excludeYears?: string; paymentStatus?: string;
}): Promise<any> {
  const { page, pageSize, search, status, customerId, dateFrom, dateTo, excludeYears } = params || {};

  const conditions: any[] = [];
  if (search) {
    conditions.push(sql`(${invoices.invoiceNumber} ILIKE ${`%${search}%`} OR ${invoices.customerName} ILIKE ${`%${search}%`} OR coalesce(${invoices.notes}, '') ILIKE ${`%${search}%`})`);
  }
  if (status) {
    const statuses = status.split(',').filter(Boolean);
    if (statuses.length === 1) conditions.push(eq(invoices.status, statuses[0]));
    else if (statuses.length > 1) conditions.push(inArray(invoices.status, statuses));
  }
  if (customerId) {
    const ids = String(customerId).split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
    if (ids.length === 1) conditions.push(eq(invoices.customerId, ids[0]));
    else if (ids.length > 1) conditions.push(inArray(invoices.customerId, ids));
  }
  if (dateFrom) conditions.push(sql`${invoices.invoiceDate}::date >= ${dateFrom}::date`);
  if (dateTo) conditions.push(sql`${invoices.invoiceDate}::date <= ${dateTo}::date`);
  if (excludeYears) {
    for (const range of excludeYears.split(';').filter(Boolean)) {
      const [start, end] = range.split(',');
      if (start && end) conditions.push(sql`NOT (${invoices.invoiceDate}::date >= ${start}::date AND ${invoices.invoiceDate}::date <= ${end}::date)`);
    }
  }
  if (params?.taxTreatment) {
    const treatments = params.taxTreatment.split(',').filter(Boolean);
    if (treatments.length === 1) conditions.push(eq(invoices.taxTreatment, treatments[0]));
    else if (treatments.length > 1) conditions.push(inArray(invoices.taxTreatment, treatments));
  }
  if (params?.paymentStatus && params.paymentStatus !== 'all') {
    conditions.push(eq(invoices.paymentStatus, params.paymentStatus));
  }
  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(invoices)
    .where(whereCondition);

  const baseQ = db.select().from(invoices).where(whereCondition).orderBy(desc(invoices.createdAt));
  const data = (page && pageSize)
    ? await baseQ.limit(pageSize).offset((page - 1) * pageSize)
    : await baseQ;
  return (page && pageSize) ? { data, total: Number(count) } : data;
}

export async function getInvoiceById(id: number) {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
  return invoice;
}

export async function createInvoice(data: InsertInvoice) {
  const [invoice] = await db.insert(invoices).values(data).returning();
  return invoice;
}

export async function updateInvoice(id: number, data: Partial<InsertInvoice>) {
  const [invoice] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
  return invoice;
}

export async function deleteInvoice(id: number) {
  const [deletedInvoice] = await db.delete(invoices).where(eq(invoices.id, id)).returning();
  return deletedInvoice;
}
