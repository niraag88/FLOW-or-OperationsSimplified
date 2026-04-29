import { db } from "../db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import {
  brands, suppliers, purchaseOrders, purchaseOrderItems,
  goodsReceipts, goodsReceiptItems,
  type InsertPurchaseOrder
} from "@shared/schema";

export async function getPurchaseOrders(params?: {
  page?: number; pageSize?: number; search?: string;
  status?: string; supplierId?: string; dateFrom?: string; dateTo?: string; excludeYears?: string; paymentStatus?: string;
}): Promise<any> {
  const { page, pageSize, search, status, supplierId, dateFrom, dateTo, excludeYears } = params || {};

  const conditions: any[] = [];
  if (search) {
    conditions.push(sql`(${purchaseOrders.poNumber} ILIKE ${`%${search}%`} OR coalesce(${purchaseOrders.notes}, '') ILIKE ${`%${search}%`})`);
  }
  if (status) {
    const statuses = status.split(',').filter(Boolean);
    if (statuses.length === 1) conditions.push(eq(purchaseOrders.status, statuses[0]));
    else if (statuses.length > 1) conditions.push(inArray(purchaseOrders.status, statuses));
  }
  if (supplierId) {
    const ids = String(supplierId).split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
    if (ids.length === 1) conditions.push(eq(purchaseOrders.supplierId, ids[0]));
    else if (ids.length > 1) conditions.push(inArray(purchaseOrders.supplierId, ids));
  }
  if (dateFrom) conditions.push(sql`${purchaseOrders.orderDate}::date >= ${dateFrom}::date`);
  if (dateTo) conditions.push(sql`${purchaseOrders.orderDate}::date <= ${dateTo}::date`);
  if (excludeYears) {
    for (const range of excludeYears.split(';').filter(Boolean)) {
      const [start, end] = range.split(',');
      if (start && end) conditions.push(sql`NOT (${purchaseOrders.orderDate}::date >= ${start}::date AND ${purchaseOrders.orderDate}::date <= ${end}::date)`);
    }
  }
  if (params?.paymentStatus && params.paymentStatus !== 'all') {
    conditions.push(eq(purchaseOrders.paymentStatus, params.paymentStatus));
  }
  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

  // Total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(purchaseOrders)
    .where(whereCondition);

  // Create subqueries for aggregated data
  const itemsAgg = db.select({
    poId: purchaseOrderItems.poId,
    lineItems: sql<number>`count(*)`.as('lineItems'),
    orderedQty: sql<number>`sum(${purchaseOrderItems.quantity})`.as('orderedQty')
  }).from(purchaseOrderItems)
    .groupBy(purchaseOrderItems.poId)
    .as('itemsAgg');

  const receivedAgg = db.select({
    poId: goodsReceipts.poId,
    receivedQty: sql<number>`sum(${goodsReceiptItems.receivedQuantity})`.as('receivedQty'),
    reconciledAmount: sql<string>`sum(${goodsReceiptItems.receivedQuantity} * ${goodsReceiptItems.unitPrice})`.as('reconciledAmount')
  }).from(goodsReceiptItems)
    .innerJoin(goodsReceipts, eq(goodsReceiptItems.receiptId, goodsReceipts.id))
    .groupBy(goodsReceipts.poId)
    .as('receivedAgg');

  const baseQ = db.select({
    id: purchaseOrders.id,
    poNumber: purchaseOrders.poNumber,
    supplierId: purchaseOrders.supplierId,
    brandId: purchaseOrders.brandId,
    status: purchaseOrders.status,
    orderDate: purchaseOrders.orderDate,
    expectedDelivery: purchaseOrders.expectedDelivery,
    totalAmount: purchaseOrders.totalAmount,
    vatAmount: purchaseOrders.vatAmount,
    grandTotal: purchaseOrders.grandTotal,
    notes: purchaseOrders.notes,
    currency: purchaseOrders.currency,
    fxRateToAed: purchaseOrders.fxRateToAed,
    objectKey: purchaseOrders.objectKey,
    createdBy: purchaseOrders.createdBy,
    createdAt: purchaseOrders.createdAt,
    updatedAt: purchaseOrders.updatedAt,
    paymentStatus: purchaseOrders.paymentStatus,
    paymentMadeDate: purchaseOrders.paymentMadeDate,
    paymentRemarks: purchaseOrders.paymentRemarks,
    supplierScanKey: purchaseOrders.supplierScanKey,
    hasGrnAttachment: sql<boolean>`exists(
      select 1 from goods_receipts
      where goods_receipts.po_id = ${purchaseOrders.id}
        and (
          goods_receipts.scan_key_1 is not null
          or goods_receipts.scan_key_2 is not null
          or goods_receipts.scan_key_3 is not null
        )
    )`.as('hasGrnAttachment'),
    supplierName: suppliers.name,
    brandName: brands.name,
    lineItems: sql<number>`coalesce(${itemsAgg.lineItems}, 0)`.as('lineItems'),
    orderedQty: sql<number>`coalesce(${itemsAgg.orderedQty}, 0)`.as('orderedQty'),
    receivedQty: sql<number>`coalesce(${receivedAgg.receivedQty}, 0)`.as('receivedQty'),
    reconciledAmount: sql<string>`${receivedAgg.reconciledAmount}`.as('reconciledAmount')
  }).from(purchaseOrders)
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .leftJoin(brands, eq(purchaseOrders.brandId, brands.id))
    .leftJoin(itemsAgg, eq(itemsAgg.poId, purchaseOrders.id))
    .leftJoin(receivedAgg, eq(receivedAgg.poId, purchaseOrders.id))
    .where(whereCondition)
    .orderBy(desc(purchaseOrders.createdAt));

  const data = (page && pageSize)
    ? await baseQ.limit(pageSize).offset((page - 1) * pageSize)
    : await baseQ;
  return (page && pageSize) ? { data, total: Number(count) } : data;
}

export async function getPurchaseOrderById(id: number) {
  const [po] = await db.select({
    id: purchaseOrders.id,
    poNumber: purchaseOrders.poNumber,
    supplierId: purchaseOrders.supplierId,
    brandId: purchaseOrders.brandId,
    status: purchaseOrders.status,
    orderDate: purchaseOrders.orderDate,
    expectedDelivery: purchaseOrders.expectedDelivery,
    totalAmount: purchaseOrders.totalAmount,
    vatAmount: purchaseOrders.vatAmount,
    grandTotal: purchaseOrders.grandTotal,
    notes: purchaseOrders.notes,
    currency: purchaseOrders.currency,
    fxRateToAed: purchaseOrders.fxRateToAed,
    objectKey: purchaseOrders.objectKey,
    supplierScanKey: purchaseOrders.supplierScanKey,
    createdBy: purchaseOrders.createdBy,
    createdAt: purchaseOrders.createdAt,
    updatedAt: purchaseOrders.updatedAt,
    paymentStatus: purchaseOrders.paymentStatus,
    paymentMadeDate: purchaseOrders.paymentMadeDate,
    paymentRemarks: purchaseOrders.paymentRemarks,
    companySnapshot: purchaseOrders.companySnapshot,
    brandName: brands.name,
  }).from(purchaseOrders)
    .leftJoin(brands, eq(purchaseOrders.brandId, brands.id))
    .where(eq(purchaseOrders.id, id));
  return po;
}

export async function createPurchaseOrder(data: InsertPurchaseOrder) {
  const [po] = await db.insert(purchaseOrders).values(data).returning();
  return po;
}

export async function updatePurchaseOrder(id: number, data: Partial<InsertPurchaseOrder>) {
  const [po] = await db.update(purchaseOrders).set({
    ...data,
    updatedAt: new Date()
  }).where(eq(purchaseOrders.id, id)).returning();
  return po;
}

export async function deletePurchaseOrder(id: number) {
  // First delete all line items associated with this purchase order
  await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, id));
  
  // Then delete the purchase order itself
  const [deletedPO] = await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id)).returning();
  return deletedPO;
}
