import type { Express } from "express";
import { purchaseOrderItems, suppliers, brands, products } from "@shared/schema";
import { db } from "../../db";
import { eq, inArray } from "drizzle-orm";
import { businessStorage } from "../../businessStorage";
import { requireAuth, type AuthenticatedRequest } from "../../middleware";

export function registerPurchaseOrderDetailRoutes(app: Express) {
  app.get('/api/purchase-orders/:id/detail', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const poId = parseInt(req.params.id);

      const po = await businessStorage.getPurchaseOrderById(poId);
      if (!po) return res.status(404).json({ error: 'Purchase order not found' });

      const [supplierRow] = po.supplierId
        ? await db.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, po.supplierId))
        : po.brandId
          ? await db.select({ name: brands.name }).from(brands).where(eq(brands.id, po.brandId))
          : [undefined];

      const rawItems = await db.select({
        id: purchaseOrderItems.id,
        productId: purchaseOrderItems.productId,
        productName: products.name,
        productSku: products.sku,
        productSize: products.size,
        descriptionOverride: purchaseOrderItems.descriptionOverride,
        sizeOverride: purchaseOrderItems.sizeOverride,
        quantity: purchaseOrderItems.quantity,
        receivedQuantity: purchaseOrderItems.receivedQuantity,
        unitPrice: purchaseOrderItems.unitPrice,
        lineTotal: purchaseOrderItems.lineTotal,
      }).from(purchaseOrderItems)
        .leftJoin(products, eq(purchaseOrderItems.productId, products.id))
        .where(eq(purchaseOrderItems.poId, poId));

      const items = rawItems.map(item => ({
        ...item,
        productName: item.descriptionOverride ?? item.productName,
        size: item.sizeOverride ?? item.productSize,
      }));

      const { goodsReceipts: grnTable, goodsReceiptItems: grnItemsTable } = await import('@shared/schema');

      const grnRows = await db.select({
        id: grnTable.id,
        receiptNumber: grnTable.receiptNumber,
        receivedDate: grnTable.receivedDate,
        notes: grnTable.notes,
        referenceNumber: grnTable.referenceNumber,
        referenceDate: grnTable.referenceDate,
        scanKey1: grnTable.scanKey1,
        scanKey2: grnTable.scanKey2,
        scanKey3: grnTable.scanKey3,
      }).from(grnTable)
        .where(eq(grnTable.poId, poId))
        .orderBy(grnTable.receivedDate);

      const grnIds = grnRows.map(g => g.id);
      let grnItems: any[] = [];
      if (grnIds.length > 0) {
        grnItems = await db.select({
          receiptId: grnItemsTable.receiptId,
          productId: grnItemsTable.productId,
          productName: products.name,
          productSku: products.sku,
          productSize: products.size,
          orderedQuantity: grnItemsTable.orderedQuantity,
          receivedQuantity: grnItemsTable.receivedQuantity,
          unitPrice: grnItemsTable.unitPrice,
        }).from(grnItemsTable)
          .leftJoin(products, eq(grnItemsTable.productId, products.id))
          .where(inArray(grnItemsTable.receiptId, grnIds));
      }

      const totalOrdered = items.reduce((s, i) => s + (parseFloat(i.lineTotal as string) || 0), 0);
      const totalReceivedValue = grnItems.reduce((s, gi) => {
        const qty = parseFloat(gi.receivedQuantity as string) || 0;
        const price = parseFloat(gi.unitPrice as string) || 0;
        return s + qty * price;
      }, 0);

      const grns = grnRows.map(g => ({
        ...g,
        items: grnItems.filter(gi => gi.receiptId === g.id),
      }));

      const hasGrns = grns.length > 0;
      res.json({
        ...po,
        supplierName: supplierRow?.name || null,
        items,
        grns,
        reconciliation: {
          hasGrns,
          originalTotal: totalOrdered,
          receivedTotal: totalReceivedValue,
          difference: totalOrdered - totalReceivedValue,
          isShortDelivery: hasGrns && totalReceivedValue < totalOrdered - 0.005,
        },
      });
    } catch (error) {
      console.error('Error fetching PO detail:', error);
      res.status(500).json({ error: 'Failed to fetch purchase order detail' });
    }
  });

  app.get('/api/purchase-orders/:id/items', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const poId = parseInt(req.params.id);

      const rawItems = await db.select({
        id: purchaseOrderItems.id,
        productId: purchaseOrderItems.productId,
        productName: products.name,
        productSku: products.sku,
        productSize: products.size,
        descriptionOverride: purchaseOrderItems.descriptionOverride,
        sizeOverride: purchaseOrderItems.sizeOverride,
        quantity: purchaseOrderItems.quantity,
        receivedQuantity: purchaseOrderItems.receivedQuantity,
        unitPrice: purchaseOrderItems.unitPrice,
        lineTotal: purchaseOrderItems.lineTotal
      })
        .from(purchaseOrderItems)
        .leftJoin(products, eq(purchaseOrderItems.productId, products.id))
        .where(eq(purchaseOrderItems.poId, poId));

      const items = rawItems.map(item => ({
        ...item,
        productName: item.descriptionOverride ?? item.productName,
        size: item.sizeOverride ?? item.productSize,
      }));

      res.json(items);
    } catch (error) {
      console.error('Error fetching PO items:', error);
      res.status(500).json({ error: 'Failed to fetch purchase order items' });
    }
  });
}
