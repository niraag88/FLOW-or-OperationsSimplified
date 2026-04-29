import type { Express } from "express";
import { goodsReceipts, goodsReceiptItems, purchaseOrders, products, suppliers } from "@shared/schema";
import { db } from "../../db";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../../middleware";

export function registerGoodsReceiptListRoutes(app: Express) {
  app.get('/api/goods-receipts', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const poIdFilter = req.query.poId ? parseInt(req.query.poId as string) : null;
      const receipts = await db.select({
        id: goodsReceipts.id,
        receiptNumber: goodsReceipts.receiptNumber,
        poId: goodsReceipts.poId,
        supplierId: goodsReceipts.supplierId,
        receivedDate: goodsReceipts.receivedDate,
        status: goodsReceipts.status,
        notes: goodsReceipts.notes,
        referenceNumber: goodsReceipts.referenceNumber,
        referenceDate: goodsReceipts.referenceDate,
        scanKey1: goodsReceipts.scanKey1,
        scanKey2: goodsReceipts.scanKey2,
        scanKey3: goodsReceipts.scanKey3,
        paymentStatus: goodsReceipts.paymentStatus,
        paymentMadeDate: goodsReceipts.paymentMadeDate,
        paymentRemarks: goodsReceipts.paymentRemarks,
        createdAt: goodsReceipts.createdAt,
        poNumber: purchaseOrders.poNumber,
        poBrandId: purchaseOrders.brandId,
        poBrandName: sql<string>`(SELECT b.name FROM brands b WHERE b.id = ${purchaseOrders.brandId})`.as('po_brand_name'),
        poCurrency: purchaseOrders.currency,
        poFxRateToAed: purchaseOrders.fxRateToAed,
        supplierName: suppliers.name,
        referenceAmount: sql<number>`COALESCE((
          SELECT SUM(gri.received_quantity * gri.unit_price::numeric)
          FROM goods_receipt_items gri
          WHERE gri.receipt_id = ${goodsReceipts.id}
        ), 0)`.as('referenceAmount'),
        isPartial: sql<boolean>`EXISTS (
          SELECT 1 FROM goods_receipt_items gri
          WHERE gri.receipt_id = ${goodsReceipts.id}
            AND gri.ordered_quantity > 0
            AND gri.received_quantity < gri.ordered_quantity
        )`.as('isPartial'),
      }).from(goodsReceipts)
        .leftJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.poId))
        .leftJoin(suppliers, eq(suppliers.id, goodsReceipts.supplierId))
        .where(poIdFilter ? eq(goodsReceipts.poId, poIdFilter) : undefined)
        .orderBy(desc(goodsReceipts.createdAt));

      const receiptIds = receipts.map(r => r.id);
      const allItems = receiptIds.length === 0 ? [] : await db.select({
        receiptId: goodsReceiptItems.receiptId,
        id: goodsReceiptItems.id,
        productId: goodsReceiptItems.productId,
        productName: products.name,
        orderedQuantity: goodsReceiptItems.orderedQuantity,
        receivedQuantity: goodsReceiptItems.receivedQuantity,
        unitPrice: goodsReceiptItems.unitPrice,
      }).from(goodsReceiptItems)
        .leftJoin(products, eq(products.id, goodsReceiptItems.productId))
        .where(inArray(goodsReceiptItems.receiptId, receiptIds));

      const itemsByReceipt: Record<number, typeof allItems> = {};
      for (const item of allItems) {
        if (!itemsByReceipt[item.receiptId]) itemsByReceipt[item.receiptId] = [];
        itemsByReceipt[item.receiptId].push(item);
      }

      const receiptsWithItems = receipts.map(r => ({
        ...r,
        items: itemsByReceipt[r.id] ?? [],
      }));

      res.json(receiptsWithItems);
    } catch (error) {
      console.error('Error fetching goods receipts:', error);
      res.status(500).json({ error: 'Failed to fetch goods receipts' });
    }
  });
}
