import type { Express } from "express";
import { goodsReceipts, goodsReceiptItems, purchaseOrders, purchaseOrderItems, stockCounts, stockCountItems, products, suppliers, storageObjects } from "@shared/schema";
import { db } from "../db";
import { eq, desc, sql, inArray, and } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, updateProductStock, objectStorageClient, type AuthenticatedRequest } from "../middleware";

export function registerGoodsReceiptRoutes(app: Express) {
  app.get('/api/stock-counts', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const stockCountsList = await db.select({
        id: stockCounts.id,
        countDate: stockCounts.countDate,
        totalProducts: stockCounts.totalProducts,
        totalQuantity: stockCounts.totalQuantity,
        createdBy: stockCounts.createdBy,
        createdAt: stockCounts.createdAt
      }).from(stockCounts).orderBy(desc(stockCounts.createdAt)).limit(100);

      res.json(stockCountsList);
    } catch (error) {
      console.error('Error fetching stock counts:', error);
      res.status(500).json({ error: 'Failed to fetch stock counts' });
    }
  });

  app.get('/api/stock-counts/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const stockCountId = parseInt(req.params.id);
      if (isNaN(stockCountId)) return res.status(400).json({ error: 'Invalid ID' });

      const [stockCount] = await db.select().from(stockCounts).where(eq(stockCounts.id, stockCountId));
      if (!stockCount) {
        return res.status(404).json({ error: 'Stock count not found' });
      }

      const items = await db.select().from(stockCountItems).where(eq(stockCountItems.stockCountId, stockCountId));

      res.json({ ...stockCount, items });
    } catch (error) {
      console.error('Error fetching stock count:', error);
      res.status(500).json({ error: 'Failed to fetch stock count' });
    }
  });

  app.post('/api/stock-counts', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { items } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items array is required and cannot be empty' });
      }

      const validItems = items.filter(item => parseInt(item.quantity) >= 0 && item.product_id);
      if (validItems.length === 0) {
        return res.status(400).json({ error: 'At least one item with a valid product is required' });
      }

      const totalProducts = validItems.length;
      const totalQuantity = validItems.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);

      let stockCount: typeof stockCounts.$inferSelect;
      let correctionsApplied = 0;

      await db.transaction(async (tx) => {
        const [sc] = await tx.insert(stockCounts).values({
          countDate: new Date(),
          totalProducts,
          totalQuantity,
          createdBy: req.user!.id
        }).returning();
        stockCount = sc;

        const stockCountItemsData = validItems.map(item => ({
          stockCountId: sc.id,
          productId: item.product_id,
          productCode: item.product_code,
          brandName: item.brand_name || '',
          productName: item.product_name,
          size: item.size || '',
          quantity: parseInt(item.quantity) || 0
        }));

        await tx.insert(stockCountItems).values(stockCountItemsData);

        const productIds: number[] = validItems
          .filter(i => i.product_id)
          .map(i => parseInt(i.product_id));

        if (productIds.length > 0) {
          const currentStocks = await tx
            .select({ id: products.id, stockQuantity: products.stockQuantity })
            .from(products)
            .where(inArray(products.id, productIds));

          const stockMap = new Map(currentStocks.map(p => [p.id, p.stockQuantity ?? 0]));

          for (const item of validItems) {
            const pid = parseInt(item.product_id);
            const counted = parseInt(item.quantity) || 0;
            const current = Number(stockMap.get(pid) ?? 0);
            const delta = counted - current;
            if (delta !== 0) {
              await updateProductStock(
                pid,
                delta,
                'adjustment',
                sc.id,
                'stock_count',
                0,
                `Stock count correction: counted ${counted}, was ${current}`,
                req.user!.id,
                tx
              );
              correctionsApplied++;
            }
          }
        }
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(stockCount!.id), targetType: 'stock_count', action: 'CREATE', details: `Stock count created: ${totalProducts} products, ${totalQuantity} total qty, ${correctionsApplied} corrections applied` });
      res.status(201).json({
        id: stockCount!.id,
        message: `Stock count saved. ${correctionsApplied} product${correctionsApplied !== 1 ? 's' : ''} adjusted to match physical count.`
      });
    } catch (error) {
      console.error('Error creating stock count:', error);
      res.status(500).json({ error: 'Failed to create stock count' });
    }
  });

  app.delete('/api/stock-counts/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const stockCountId = parseInt(req.params.id);
      if (isNaN(stockCountId)) return res.status(400).json({ error: 'Invalid ID' });

      await db.delete(stockCountItems).where(eq(stockCountItems.stockCountId, stockCountId));
      await db.delete(stockCounts).where(eq(stockCounts.id, stockCountId));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(stockCountId), targetType: 'stock_count', action: 'DELETE', details: `Stock count #${stockCountId} deleted` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting stock count:', error);
      res.status(500).json({ error: 'Failed to delete stock count' });
    }
  });

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
        scanKey1: goodsReceipts.scanKey1,
        scanKey2: goodsReceipts.scanKey2,
        scanKey3: goodsReceipts.scanKey3,
        createdAt: goodsReceipts.createdAt,
        poNumber: purchaseOrders.poNumber,
        supplierName: suppliers.name,
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

  app.patch('/api/goods-receipts/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { scanKey, slot } = req.body;
      if (!scanKey || typeof scanKey !== 'string') {
        return res.status(400).json({ error: 'scanKey is required' });
      }
      const slotNum = parseInt(slot) || 1;
      if (![1, 2, 3].includes(slotNum)) {
        return res.status(400).json({ error: 'slot must be 1, 2, or 3' });
      }
      const colName = `scanKey${slotNum}` as 'scanKey1' | 'scanKey2' | 'scanKey3';
      const [updated] = await db
        .update(goodsReceipts)
        .set({ [colName]: scanKey, updatedAt: new Date() })
        .where(eq(goodsReceipts.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Goods receipt not found' });
      res.json(updated);
    } catch (error) {
      console.error('Error saving GRN scan key:', error);
      res.status(500).json({ error: 'Failed to save document' });
    }
  });

  app.delete('/api/goods-receipts/:id/scan-key/:slot', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const slotNum = parseInt(req.params.slot);
      if (isNaN(slotNum) || ![1, 2, 3].includes(slotNum)) {
        return res.status(400).json({ error: 'slot must be 1, 2, or 3' });
      }
      const colName = `scanKey${slotNum}` as 'scanKey1' | 'scanKey2' | 'scanKey3';
      const [current] = await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, id));
      if (!current) return res.status(404).json({ error: 'Goods receipt not found' });
      const existingKey = current[colName];
      if (existingKey) {
        try {
          await objectStorageClient.delete(existingKey);
          await db.delete(storageObjects).where(eq(storageObjects.key, existingKey));
        } catch (delErr) {
          console.warn('Could not delete object from storage:', delErr);
        }
      }
      const [updated] = await db
        .update(goodsReceipts)
        .set({ [colName]: null, updatedAt: new Date() })
        .where(eq(goodsReceipts.id, id))
        .returning();
      res.json(updated);
    } catch (error) {
      console.error('Error removing GRN scan key:', error);
      res.status(500).json({ error: 'Failed to remove document' });
    }
  });

  app.delete('/api/goods-receipts/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const grnId = parseInt(req.params.id);
      if (isNaN(grnId)) return res.status(400).json({ error: 'Invalid ID' });
      const [grn] = await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, grnId));
      if (!grn) return res.status(404).json({ error: 'Goods receipt not found' });

      const items = await db.select().from(goodsReceiptItems).where(eq(goodsReceiptItems.receiptId, grnId));

      await db.transaction(async (tx) => {
        for (const item of items) {
          await tx.update(products)
            .set({
              stockQuantity: sql`GREATEST(0, COALESCE(stock_quantity, 0) - ${item.receivedQuantity})`,
              updatedAt: new Date(),
            })
            .where(eq(products.id, item.productId));

          await tx.update(purchaseOrderItems)
            .set({ receivedQuantity: sql`GREATEST(0, COALESCE(received_quantity, 0) - ${item.receivedQuantity})` })
            .where(eq(purchaseOrderItems.id, item.poItemId));
        }

        const { stockMovements } = await import('@shared/schema');
        await tx.delete(stockMovements).where(
          and(eq(stockMovements.referenceType, 'goods_receipt'), eq(stockMovements.referenceId, grnId)),
        );

        await tx.delete(goodsReceiptItems).where(eq(goodsReceiptItems.receiptId, grnId));
        await tx.delete(goodsReceipts).where(eq(goodsReceipts.id, grnId));

        const [remainingGrns] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(goodsReceipts)
          .where(eq(goodsReceipts.poId, grn.poId));
        const hasMoreGrns = (remainingGrns?.count ?? 0) > 0;

        let newPoStatus: string;
        if (hasMoreGrns) {
          const poItems = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, grn.poId));
          const allStillReceived = poItems.every(it => (it.receivedQuantity ?? 0) >= it.quantity);
          newPoStatus = allStillReceived ? 'closed' : 'submitted';
        } else {
          newPoStatus = 'submitted';
        }

        await tx.update(purchaseOrders)
          .set({ status: newPoStatus, updatedAt: new Date() })
          .where(eq(purchaseOrders.id, grn.poId));
      });

      res.json({ success: true, grnId });
    } catch (error) {
      console.error('Error deleting goods receipt:', error);
      res.status(500).json({ error: 'Failed to delete goods receipt' });
    }
  });

  app.post('/api/goods-receipts', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const { poId, items, notes, forceClose, receivedDate } = req.body;

      if (!poId || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Purchase Order ID and items are required' });
      }

      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
      if (!po) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      const receiptNumber = await businessStorage.generateGrnNumber();

      let receipt!: typeof goodsReceipts.$inferSelect;
      let allReceived = false;

      await db.transaction(async (tx) => {
        const [newReceipt] = await tx.insert(goodsReceipts).values({
          receiptNumber,
          poId,
          supplierId: po.supplierId,
          receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
          status: 'confirmed',
          notes: notes || '',
          createdBy: req.user!.id
        }).returning();
        receipt = newReceipt;

        for (const item of items) {
          if (item.receivedQuantity > 0) {
            await tx.insert(goodsReceiptItems).values({
              receiptId: receipt.id,
              poItemId: item.poItemId,
              productId: item.productId,
              orderedQuantity: item.orderedQuantity,
              receivedQuantity: item.receivedQuantity,
              unitPrice: item.unitPrice.toString()
            });

            await updateProductStock(
              item.productId,
              item.receivedQuantity,
              'goods_receipt',
              receipt.id,
              'goods_receipt',
              parseFloat(item.unitPrice),
              `Goods received from PO ${po.poNumber}`,
              req.user!.id,
              tx
            );
            await tx.update(purchaseOrderItems)
              .set({ receivedQuantity: sql`COALESCE(received_quantity, 0) + ${item.receivedQuantity}` })
              .where(eq(purchaseOrderItems.id, item.poItemId));
          }
        }

        const poItems = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
        allReceived = poItems.every(item => (item.receivedQuantity ?? 0) >= item.quantity);

        if (allReceived || forceClose) {
          await tx.update(purchaseOrders)
            .set({ status: 'closed', updatedAt: new Date() })
            .where(eq(purchaseOrders.id, poId));
        }
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(receipt.id), targetType: 'goods_receipt', action: 'CREATE', details: `Goods receipt ${receipt.receiptNumber} from PO #${po.poNumber}` });
      res.status(201).json({
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        poStatus: (allReceived || forceClose) ? 'closed' : 'submitted',
        message: `Goods receipt ${receipt.receiptNumber} created and stock updated for ${items.filter(i => i.receivedQuantity > 0).length} products`
      });
    } catch (error) {
      console.error('Error creating goods receipt:', error);
      res.status(500).json({ error: 'Failed to create goods receipt' });
    }
  });
}
