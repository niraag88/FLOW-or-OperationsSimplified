import { db } from "../db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import {
  brands, customers, products, quotations, quotationItems,
  companySettings, invoices, invoiceLineItems,
  type InsertQuotation, type InsertInvoice
} from "@shared/schema";
import type { DbClient } from "../middleware";

export async function getQuotations(params?: {
  page?: number; pageSize?: number; search?: string;
  status?: string; customerId?: string; dateFrom?: string; dateTo?: string; excludeYears?: string;
}): Promise<any> {
  const { page, pageSize, search, status, customerId, dateFrom, dateTo, excludeYears } = params || {};

  const conditions: any[] = [];
  if (search) {
    conditions.push(sql`(${quotations.quoteNumber} ILIKE ${`%${search}%`} OR coalesce(${quotations.notes}, '') ILIKE ${`%${search}%`})`);
  }
  if (status) {
    const statuses = status.split(',').filter(Boolean);
    if (statuses.length === 1) conditions.push(eq(quotations.status, statuses[0]));
    else if (statuses.length > 1) conditions.push(inArray(quotations.status, statuses));
  }
  if (customerId) {
    const ids = String(customerId).split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
    if (ids.length === 1) conditions.push(eq(quotations.customerId, ids[0]));
    else if (ids.length > 1) conditions.push(inArray(quotations.customerId, ids));
  }
  if (dateFrom) conditions.push(sql`${quotations.quoteDate}::date >= ${dateFrom}::date`);
  if (dateTo) conditions.push(sql`${quotations.quoteDate}::date <= ${dateTo}::date`);
  if (excludeYears) {
    for (const range of excludeYears.split(';').filter(Boolean)) {
      const [start, end] = range.split(',');
      if (start && end) conditions.push(sql`NOT (${quotations.quoteDate} >= ${start} AND ${quotations.quoteDate} <= ${end})`);
    }
  }
  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(quotations)
    .where(whereCondition);

  const baseQ = db.select({
    id: quotations.id,
    quoteNumber: quotations.quoteNumber,
    customerId: quotations.customerId,
    status: quotations.status,
    quoteDate: quotations.quoteDate,
    validUntil: quotations.validUntil,
    totalAmount: quotations.totalAmount,
    vatAmount: quotations.vatAmount,
    grandTotal: quotations.grandTotal,
    notes: quotations.notes,
    showRemarks: quotations.showRemarks,
    terms: quotations.terms,
    reference: quotations.reference,
    referenceDate: quotations.referenceDate,
    objectKey: quotations.objectKey,
    createdBy: quotations.createdBy,
    createdAt: quotations.createdAt,
    updatedAt: quotations.updatedAt,
    customerName: customers.name,
  }).from(quotations)
    .leftJoin(customers, eq(quotations.customerId, customers.id))
    .where(whereCondition)
    .orderBy(desc(quotations.createdAt));

  const data = (page && pageSize)
    ? await baseQ.limit(pageSize).offset((page - 1) * pageSize)
    : await baseQ;
  return (page && pageSize) ? { data, total: Number(count) } : data;
}

export async function getQuotationById(id: number) {
  const [quote] = await db.select().from(quotations).where(eq(quotations.id, id));
  return quote;
}

export async function getQuotationWithItems(id: number) {
  // Get quotation details with customer name
  const [quote] = await db.select({
    id: quotations.id,
    quoteNumber: quotations.quoteNumber,
    customerId: quotations.customerId,
    status: quotations.status,
    quoteDate: quotations.quoteDate,
    validUntil: quotations.validUntil,
    totalAmount: quotations.totalAmount,
    vatAmount: quotations.vatAmount,
    grandTotal: quotations.grandTotal,
    notes: quotations.notes,
    showRemarks: quotations.showRemarks,
    terms: quotations.terms,
    reference: quotations.reference,
    referenceDate: quotations.referenceDate,
    objectKey: quotations.objectKey,
    createdBy: quotations.createdBy,
    createdAt: quotations.createdAt,
    updatedAt: quotations.updatedAt,
    companySnapshot: quotations.companySnapshot,
    customerName: customers.name,
  }).from(quotations)
    .leftJoin(customers, eq(quotations.customerId, customers.id))
    .where(eq(quotations.id, id));
  
  if (!quote) return null;

  // Get quotation items with brand names and size
  const items = await db.select({
    id: quotationItems.id,
    productId: quotationItems.productId,
    brandId: products.brandId,
    quantity: quotationItems.quantity,
    unitPrice: quotationItems.unitPrice,
    discount: quotationItems.discount,
    vatRate: quotationItems.vatRate,
    lineTotal: quotationItems.lineTotal,
    description: products.name,
    productCode: products.sku,
    brandName: brands.name,
    size: products.size,
  }).from(quotationItems)
    .leftJoin(products, eq(quotationItems.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .where(eq(quotationItems.quoteId, id));

  return { ...quote, items };
}

export async function createQuotation(data: InsertQuotation) {
  const [quote] = await db.insert(quotations).values(data).returning();
  return quote;
}

export async function updateQuotation(id: number, data: Partial<InsertQuotation>) {
  const [updatedQuote] = await db.update(quotations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(quotations.id, id))
    .returning();
  return updatedQuote;
}

export async function deleteQuotation(id: number) {
  // First delete all line items associated with this quotation
  await db.delete(quotationItems).where(eq(quotationItems.quoteId, id));
  
  // Then delete the quotation itself
  const [deletedQuote] = await db.delete(quotations).where(eq(quotations.id, id)).returning();
  return deletedQuote;
}

// Task #403 (F16): accepts an optional `tx` so the route can wrap the
// whole conversion (header + items + tax treatment + quotation status
// flip + downstream snapshot/audit-log writes) in a single
// db.transaction. Pre-tx reads (quote, customer, company settings)
// stay on the bare `db` — they are read-only snapshots used to
// validate the request before any write happens. All writes go
// through `dbClient` which is `tx` when supplied.
export async function createInvoiceFromQuotation(
  quotationId: number,
  invoiceNumber: string,
  userId: number,
  tx?: DbClient,
) {
  const quote = await getQuotationWithItems(quotationId);
  if (!quote) throw new Error(`Quotation with id ${quotationId} not found`);
  if (quote.status === 'converted') throw new Error(`Quotation ${quote.quoteNumber} has already been converted to an invoice`);
  if (!quote.customerId) throw new Error(`Quotation ${quote.quoteNumber} has no customer assigned`);

  // Same authoritative totals + VAT rules as POST /api/invoices.
  // The customer record wins for VAT category — converting from a
  // quote cannot reintroduce VAT for an exempt/zero-rated customer
  // even if the quote was somehow standard-rated.
  const { resolveDocumentTotals, resolveAuthoritativeTaxTreatment, isTotalsError } =
    await import('../utils/totals');

  const [customer] = await db.select().from(customers).where(eq(customers.id, quote.customerId));
  const customerVatTreatment = customer?.vatTreatment ?? null;

  const [csRow] = await db.select().from(companySettings).limit(1);
  const defaultVatRate = csRow?.defaultVatRate ? parseFloat(csRow.defaultVatRate) : 0.05;

  const treatmentInput = resolveAuthoritativeTaxTreatment(
    (quote as { taxTreatment?: string | null }).taxTreatment,
    null,
    customerVatTreatment,
  );

  // Validate every quote line — do NOT silently drop invalid rows.
  // If a quote somehow stored a zero/negative quantity or non-numeric
  // price, conversion fails loudly with the same contract as
  // POST /api/invoices, rather than producing a partial invoice.
  const itemsForResolver = (quote.items ?? []).map(it => ({
    product_id: it.productId ?? null,
    product_code: it.productCode ?? null,
    description: it.description ?? '',
    quantity: Number(it.quantity),
    unit_price: Number(it.unitPrice),
  }));

  let resolved;
  try {
    resolved = resolveDocumentTotals({
      items: itemsForResolver,
      taxTreatment: treatmentInput,
      defaultVatRate,
    });
  } catch (err) {
    if (isTotalsError(err)) {
      throw new Error(`Cannot convert quotation ${quote.quoteNumber}: ${err.message}`);
    }
    throw err;
  }

  const invoiceData: InsertInvoice = {
    invoiceNumber,
    customerId: quote.customerId,
    customerName: quote.customerName ?? 'Unknown Customer',
    amount: resolved.totalAmount.toFixed(2),
    vatAmount: resolved.vatAmount.toFixed(2),
    status: 'draft',
    invoiceDate: new Date().toISOString().split('T')[0],
    reference: quote.quoteNumber,
    notes: `Converted from Quotation ${quote.quoteNumber}`,
    currency: 'AED',
  };

  const dbClient: DbClient = tx ?? db;

  const [invoice] = await dbClient.insert(invoices).values(invoiceData).returning();
  // taxTreatment isn't in InsertInvoice schema; set it via direct update
  // (mirrors POST /api/invoices). Authority is enforced above.
  await dbClient.update(invoices)
    .set({ taxTreatment: resolved.taxTreatment })
    .where(eq(invoices.id, invoice.id));

  for (const item of resolved.items) {
    await dbClient.insert(invoiceLineItems).values({
      invoiceId: invoice.id,
      productId: (item.product_id as number | null) ?? null,
      productCode: (item.product_code as string | null) ?? null,
      description: (item.description as string | null) ?? '',
      quantity: item.quantity,
      unitPrice: item.unit_price.toString(),
      lineTotal: item.line_total.toString(),
    });
  }

  // Flip the quotation to "converted" through the same client so a
  // tx rollback also un-converts the quotation.
  await dbClient.update(quotations)
    .set({ status: 'converted', updatedAt: new Date() })
    .where(eq(quotations.id, quotationId));

  return { ...invoice, items: quote.items ?? [] };
}
