import type { Express } from "express";
import { goodsReceipts, goodsReceiptItems, purchaseOrders, purchaseOrderItems, stockCounts, stockCountItems, products, suppliers, brands, storageObjects, stockMovements } from "@shared/schema";
import { db } from "../db";
import { eq, desc, sql, inArray, and } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, updateProductStock, objectStorageClient, deleteStorageObjectSafely, type AuthenticatedRequest } from "../middleware";

type NegativeStockEntry = {
  productId: number;
  productName: string;
  currentStock: number;
  reversalQty: number;
  projectedStock: number;
};

class GrnCancelNegativeStockError extends Error {
  readonly products: NegativeStockEntry[];
  constructor(products: NegativeStockEntry[]) {
    super('Cancelling this GRN would push one or more products into negative stock');
    this.name = 'GrnCancelNegativeStockError';
    this.products = products;
  }
}

class PoReceivedQtyUnderflowError extends Error {
  readonly details: string[];
  constructor(details: string[]) {
    super('Cancelling this GRN would push purchase order received quantities below zero');
    this.name = 'PoReceivedQtyUnderflowError';
    this.details = details;
  }
}

async function recalculatePOPaymentStatus(poId: number): Promise<void> {
  const grns = await db.select({
    paymentStatus: goodsReceipts.paymentStatus,
  }).from(goodsReceipts).where(
    and(eq(goodsReceipts.poId, poId), eq(goodsReceipts.status, 'confirmed'))
  );

  let derived: 'outstanding' | 'partially_paid' | 'paid';
  if (grns.length === 0) {
    derived = 'outstanding';
  } else {
    const paidCount = grns.filter(g => g.paymentStatus === 'paid').length;
    if (paidCount === 0) {
      derived = 'outstanding';
    } else if (paidCount === grns.length) {
      derived = 'paid';
    } else {
      derived = 'partially_paid';
    }
  }

  await db.update(purchaseOrders)
    .set({ paymentStatus: derived })
    .where(eq(purchaseOrders.id, poId));
}

class OverReceiveError extends Error {
  readonly details: string[];
  constructor(details: string[]) {
    super('Over-receive not allowed');
    this.name = 'OverReceiveError';
    this.details = details;
  }
}

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
        const storageResult = await deleteStorageObjectSafely(existingKey);
        if (!storageResult.ok) {
          console.error(
            `Failed to delete goods-receipt scan from storage: type=goods_receipt id=${id} slot=${slotNum} key=${existingKey} error=${storageResult.error}`
          );
          return res.status(502).json({ error: 'Could not delete document from storage. Please try again.' });
        }
        await db.delete(storageObjects).where(eq(storageObjects.key, existingKey));
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

  // PATCH /api/goods-receipts/:id/cancel
  // Body: { confirmNegativeStock?: boolean; acknowledgePaidGrn?: boolean }
  // Responses:
  //   200 { success: true, grnId, reversedProducts: [...], negativeStock: [...] }
  //   404 { error: 'Goods receipt not found' }
  //   409 { error: 'Goods receipt is already cancelled' }
  //   409 { error: 'paid_grn_requires_ack', message }                       // resend with acknowledgePaidGrn: true
  //   409 { error: 'negative_stock', message, products: [...] }             // resend with confirmNegativeStock: true
  //   409 { error: 'po_received_quantity_underflow', message, details }
  app.patch('/api/goods-receipts/:id/cancel', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const grnId = parseInt(req.params.id);
      if (isNaN(grnId)) return res.status(400).json({ error: 'Invalid ID' });

      const [grn] = await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, grnId));
      if (!grn) return res.status(404).json({ error: 'Goods receipt not found' });

      if (grn.status === 'cancelled') {
        return res.status(409).json({ error: 'Goods receipt is already cancelled' });
      }
      if (grn.status !== 'confirmed') {
        return res.status(400).json({ error: `Goods receipt with status "${grn.status}" cannot be cancelled` });
      }

      const confirmNegativeStock = req.body?.confirmNegativeStock === true;
      const acknowledgePaidGrn = req.body?.acknowledgePaidGrn === true;

      // Pre-transaction guard: paid GRN requires explicit acknowledgement.
      if (grn.paymentStatus === 'paid' && !acknowledgePaidGrn) {
        return res.status(409).json({
          error: 'paid_grn_requires_ack',
          message: `GRN ${grn.receiptNumber} is marked as paid to the supplier. Cancelling it does not refund the supplier — a debit note may be more appropriate. Re-send with acknowledgePaidGrn: true to proceed.`,
        });
      }

      const items = await db.select().from(goodsReceiptItems).where(eq(goodsReceiptItems.receiptId, grnId));
      if (items.length === 0) {
        // Nothing to reverse — flip the status atomically with a row lock to
        // serialise concurrent cancel attempts on the same itemless GRN.
        let updatedRows = 0;
        await db.transaction(async (tx) => {
          const [locked] = await tx
            .select({ id: goodsReceipts.id, status: goodsReceipts.status })
            .from(goodsReceipts)
            .where(eq(goodsReceipts.id, grnId))
            .for('update');
          if (!locked || locked.status !== 'confirmed') {
            // Another request beat us to it — bail out cleanly.
            return;
          }
          const result = await tx
            .update(goodsReceipts)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(and(eq(goodsReceipts.id, grnId), eq(goodsReceipts.status, 'confirmed')));
          updatedRows = result.rowCount ?? 0;

          // Recompute PO header status from the remaining confirmed GRNs so
          // the itemless cancel path stays consistent with the normal cancel
          // path and the delete path.
          if (updatedRows > 0) {
            const [remainingConfirmed] = await tx
              .select({ count: sql<number>`count(*)::int` })
              .from(goodsReceipts)
              .where(and(eq(goodsReceipts.poId, grn.poId), eq(goodsReceipts.status, 'confirmed')));
            const hasMoreGrns = (remainingConfirmed?.count ?? 0) > 0;

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
          }
        });
        if (updatedRows === 0) {
          return res.status(409).json({ error: 'Goods receipt is already cancelled' });
        }
        await recalculatePOPaymentStatus(grn.poId);
        writeAuditLog({
          actor: req.user!.id,
          actorName: req.user?.username || String(req.user!.id),
          targetId: String(grnId),
          targetType: 'goods_receipt',
          action: 'CANCEL',
          details: `GRN ${grn.receiptNumber} cancelled (no line items, nothing to reverse)`,
        });
        return res.json({ success: true, grnId, reversedProducts: [], negativeStock: [] });
      }

      // Aggregate by productId for stock reversal and by poItemId for PO updates.
      const reversalByProduct = new Map<number, number>();
      const reversalByPoItem = new Map<number, number>();
      for (const item of items) {
        reversalByProduct.set(item.productId, (reversalByProduct.get(item.productId) ?? 0) + item.receivedQuantity);
        reversalByPoItem.set(item.poItemId, (reversalByPoItem.get(item.poItemId) ?? 0) + item.receivedQuantity);
      }

      const productIds = Array.from(reversalByProduct.keys()).sort((a, b) => a - b);
      let reversedSummary: Array<{ productId: number; productName: string; previousStock: number; newStock: number; reversedQty: number }> = [];
      let negativeStock: NegativeStockEntry[] = [];

      let cancelRowsAffected = 0;
      try {
        await db.transaction(async (tx) => {
          // Re-lock the GRN row inside the transaction. Two concurrent cancel calls
          // could each pass the pre-transaction status check; locking + a guarded
          // WHERE clause on the final update guarantees only one of them performs
          // the reversal.
          const [lockedGrn] = await tx
            .select({ id: goodsReceipts.id, status: goodsReceipts.status })
            .from(goodsReceipts)
            .where(eq(goodsReceipts.id, grnId))
            .for('update');
          if (!lockedGrn || lockedGrn.status !== 'confirmed') {
            // Another request already cancelled this GRN — bail before any
            // stock movement is posted.
            return;
          }

          // Lock affected product rows (FOR UPDATE) so a concurrent invoice delivery
          // cannot move stock between our check and our reversal.
          const lockedProducts = await tx
            .select({ id: products.id, name: products.name, stockQuantity: products.stockQuantity })
            .from(products)
            .where(inArray(products.id, productIds))
            .for('update');

          const productMap = new Map(lockedProducts.map(p => [p.id, p]));

          // Compute projected stock and identify negative-stock products.
          const projected: NegativeStockEntry[] = [];
          for (const pid of productIds) {
            const p = productMap.get(pid);
            const currentStock = Number(p?.stockQuantity ?? 0);
            const reversalQty = reversalByProduct.get(pid) ?? 0;
            const projectedStock = currentStock - reversalQty;
            if (projectedStock < 0) {
              projected.push({
                productId: pid,
                productName: p?.name ?? `Product #${pid}`,
                currentStock,
                reversalQty,
                projectedStock,
              });
            }
          }

          if (projected.length > 0 && !confirmNegativeStock) {
            throw new GrnCancelNegativeStockError(projected);
          }
          negativeStock = projected;

          // Validate PO received-quantity underflow with a single locked read.
          const poItemIds = Array.from(reversalByPoItem.keys());
          const lockedPoItems = await tx
            .select({ id: purchaseOrderItems.id, productId: purchaseOrderItems.productId, receivedQuantity: purchaseOrderItems.receivedQuantity })
            .from(purchaseOrderItems)
            .where(inArray(purchaseOrderItems.id, poItemIds))
            .for('update');
          const poItemMap = new Map(lockedPoItems.map(i => [i.id, i]));

          const underflowErrors: string[] = [];
          for (const [poItemId, qty] of reversalByPoItem) {
            const poItem = poItemMap.get(poItemId);
            if (!poItem) {
              underflowErrors.push(`PO item ID ${poItemId} not found`);
              continue;
            }
            const projectedReceived = (poItem.receivedQuantity ?? 0) - qty;
            if (projectedReceived < 0) {
              underflowErrors.push(
                `PO item ID ${poItemId}: cannot reduce received quantity by ${qty} (current ${poItem.receivedQuantity ?? 0})`
              );
            }
          }
          if (underflowErrors.length > 0) {
            throw new PoReceivedQtyUnderflowError(underflowErrors);
          }

          // Reverse stock per product (creates a goods_receipt_reversal stock_movements row).
          for (const pid of productIds) {
            const reversalQty = reversalByProduct.get(pid)!;
            const productName = productMap.get(pid)?.name ?? `Product #${pid}`;
            const result = await updateProductStock(
              pid,
              -reversalQty,
              'goods_receipt_reversal',
              grnId,
              'goods_receipt',
              0,
              `Stock reversed: GRN ${grn.receiptNumber} cancelled`,
              req.user!.id,
              tx,
            );
            reversedSummary.push({
              productId: pid,
              productName,
              previousStock: Number(result.previousStock ?? 0),
              newStock: Number(result.newStock ?? 0),
              reversedQty: reversalQty,
            });
          }

          // Subtract from PO item received quantities.
          for (const [poItemId, qty] of reversalByPoItem) {
            await tx.update(purchaseOrderItems)
              .set({ receivedQuantity: sql`COALESCE(received_quantity, 0) - ${qty}` })
              .where(eq(purchaseOrderItems.id, poItemId));
          }

          // Mark the GRN cancelled. The status='confirmed' guard belt-and-braces the
          // FOR UPDATE lock above: even if two cancels somehow get this far, only the
          // first one's WHERE clause matches.
          const updateResult = await tx.update(goodsReceipts)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(and(eq(goodsReceipts.id, grnId), eq(goodsReceipts.status, 'confirmed')));
          cancelRowsAffected = updateResult.rowCount ?? 0;
          if (cancelRowsAffected === 0) {
            // Should be unreachable thanks to the lock — surface as a tx rollback.
            throw new Error('GRN status changed during cancellation');
          }

          // Recompute PO status from non-cancelled GRNs (mirrors the previous delete-path logic).
          const [remainingConfirmed] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(goodsReceipts)
            .where(and(eq(goodsReceipts.poId, grn.poId), eq(goodsReceipts.status, 'confirmed')));
          const hasMoreGrns = (remainingConfirmed?.count ?? 0) > 0;

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
      } catch (txErr) {
        if (txErr instanceof GrnCancelNegativeStockError) {
          return res.status(409).json({
            error: 'negative_stock',
            message: 'Cancelling this GRN would leave one or more products with negative stock. This usually means goods were sold from this receipt. Re-send with confirmNegativeStock: true to proceed anyway.',
            products: txErr.products,
          });
        }
        if (txErr instanceof PoReceivedQtyUnderflowError) {
          return res.status(409).json({
            error: 'po_received_quantity_underflow',
            message: 'Cancelling this GRN would push purchase order received quantities below zero. The GRN data may be inconsistent.',
            details: txErr.details,
          });
        }
        throw txErr;
      }

      // The locked-status check inside the tx is the only way cancelRowsAffected
      // stays at zero — that means another request cancelled the GRN first and
      // we did not post any reversal movements.
      if (cancelRowsAffected === 0) {
        return res.status(409).json({ error: 'Goods receipt is already cancelled' });
      }

      // After-tx work: recalc PO payment status (cancelled GRNs are excluded by the helper).
      await recalculatePOPaymentStatus(grn.poId);

      const [poRow] = await db.select({ poNumber: purchaseOrders.poNumber }).from(purchaseOrders).where(eq(purchaseOrders.id, grn.poId));
      const productList = reversedSummary
        .map(p => `${p.productName} (id=${p.productId}, qty=-${p.reversedQty}, ${p.previousStock}->${p.newStock})`)
        .join('; ');
      const negativeNote = negativeStock.length > 0
        ? ` NEGATIVE-STOCK CONFIRMED for ${negativeStock.length} product(s)`
        : '';
      const paidNote = grn.paymentStatus === 'paid' ? ' [paid-GRN ack]' : '';
      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(grnId),
        targetType: 'goods_receipt',
        action: 'CANCEL',
        details: `GRN ${grn.receiptNumber} cancelled (PO ${poRow?.poNumber || `#${grn.poId}`}). Reversed ${reversedSummary.length} product(s): ${productList}.${negativeNote}${paidNote}`,
      });

      res.json({ success: true, grnId, reversedProducts: reversedSummary, negativeStock });
    } catch (error) {
      console.error('Error cancelling goods receipt:', error);
      res.status(500).json({ error: 'Failed to cancel goods receipt' });
    }
  });

  // DELETE /api/goods-receipts/:id
  // Goods Receipts are append-only for audit purposes. Confirmed receipts must
  // be cancelled first via PATCH /api/goods-receipts/:id/cancel (which posts
  // reversal stock movements while keeping the original receipt history),
  // and cancelled receipts are then retained permanently — same policy as
  // cancelled invoices and cancelled delivery orders.
  // Responses:
  //   404 { error: 'Goods receipt not found' }
  //   400 { error: 'grn_not_cancelled', message }     // confirmed → cancel first
  //   400 { error: 'grn_retained_for_audit', message } // cancelled → never delete
  app.delete('/api/goods-receipts/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const grnId = parseInt(req.params.id);
      if (isNaN(grnId)) return res.status(400).json({ error: 'Invalid ID' });
      const [grn] = await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, grnId));
      if (!grn) return res.status(404).json({ error: 'Goods receipt not found' });

      if (grn.status === 'cancelled') {
        return res.status(400).json({
          error: 'grn_retained_for_audit',
          message: 'Cancelled goods receipts are retained for audit and cannot be permanently deleted.',
        });
      }

      return res.status(400).json({
        error: 'grn_not_cancelled',
        message: 'Confirmed goods receipts cannot be deleted — cancel the GRN first to reverse stock. The cancelled receipt will be retained for audit.',
      });
    } catch (error) {
      console.error('Error deleting goods receipt:', error);
      res.status(500).json({ error: 'Failed to delete goods receipt' });
    }
  });

  app.patch('/api/goods-receipts/:id/reference', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { referenceNumber, referenceDate } = req.body;

      const [current] = await db.select({
        id: goodsReceipts.id,
        referenceNumber: goodsReceipts.referenceNumber,
        referenceDate: goodsReceipts.referenceDate,
        receiptNumber: goodsReceipts.receiptNumber,
      }).from(goodsReceipts).where(eq(goodsReceipts.id, id));
      if (!current) return res.status(404).json({ error: 'Goods receipt not found' });

      const [updated] = await db
        .update(goodsReceipts)
        .set({
          referenceNumber: referenceNumber || null,
          referenceDate: referenceDate || null,
          updatedAt: new Date(),
        })
        .where(eq(goodsReceipts.id, id))
        .returning();

      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(id),
        targetType: 'goods_receipt',
        action: 'UPDATE',
        details: `GRN ${current.receiptNumber} reference updated: ref_no="${referenceNumber || ''}" ref_date="${referenceDate || ''}" (was ref_no="${current.referenceNumber || ''}" ref_date="${current.referenceDate || ''}")`,
      });

      res.json(updated);
    } catch (error) {
      console.error('Error updating GRN reference:', error);
      res.status(500).json({ error: 'Failed to update reference' });
    }
  });

  app.patch('/api/goods-receipts/:id/payment', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { paymentStatus, paymentMadeDate, paymentRemarks } = req.body;

      if (paymentStatus && !['outstanding', 'paid'].includes(paymentStatus)) {
        return res.status(400).json({ error: 'paymentStatus must be outstanding or paid' });
      }

      const [current] = await db.select({
        id: goodsReceipts.id,
        poId: goodsReceipts.poId,
        receiptNumber: goodsReceipts.receiptNumber,
        paymentStatus: goodsReceipts.paymentStatus,
        paymentMadeDate: goodsReceipts.paymentMadeDate,
        paymentRemarks: goodsReceipts.paymentRemarks,
      }).from(goodsReceipts).where(eq(goodsReceipts.id, id));
      if (!current) return res.status(404).json({ error: 'Goods receipt not found' });

      const [updated] = await db
        .update(goodsReceipts)
        .set({
          paymentStatus: paymentStatus || current.paymentStatus,
          paymentMadeDate: paymentMadeDate !== undefined ? (paymentMadeDate || null) : current.paymentMadeDate,
          paymentRemarks: paymentRemarks !== undefined ? (paymentRemarks || null) : current.paymentRemarks,
          updatedAt: new Date(),
        })
        .where(eq(goodsReceipts.id, id))
        .returning();

      // Derive and persist PO payment status from all linked GRNs
      if (current.poId) {
        await recalculatePOPaymentStatus(current.poId);
      }

      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(id),
        targetType: 'goods_receipt',
        action: 'UPDATE',
        details: `GRN ${current.receiptNumber} payment updated: status="${updated.paymentStatus || 'outstanding'}" date="${updated.paymentMadeDate || ''}" remarks="${updated.paymentRemarks || ''}" (was status="${current.paymentStatus || 'inherited'}" date="${current.paymentMadeDate || ''}" remarks="${current.paymentRemarks || ''}")`,
      });

      res.json(updated);
    } catch (error) {
      console.error('Error updating GRN payment:', error);
      res.status(500).json({ error: 'Failed to update payment' });
    }
  });

  app.post('/api/goods-receipts', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const { poId, items, notes, forceClose, receivedDate, referenceNumber, referenceDate } = req.body;

      if (!poId || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Purchase Order ID and items are required' });
      }

      // Reject empty / zero-quantity payloads up front so we never create an
      // itemless GRN header that would later be untracked by stock movements.
      const positiveItems = items.filter((it: any) => Number(it?.receivedQuantity) > 0);
      if (positiveItems.length === 0) {
        return res.status(400).json({
          error: 'no_received_quantity',
          message: 'A goods receipt must include at least one line with a received quantity greater than zero.',
        });
      }

      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
      if (!po) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      const receiptNumber = await businessStorage.generateGrnNumber();

      let receipt!: typeof goodsReceipts.$inferSelect;
      let allReceived = false;

      await db.transaction(async (tx) => {
        // Validate inside the transaction so no partial inserts occur on failure.
        // Lock PO item rows with FOR UPDATE to prevent concurrent over-receive.
        const lockedPoItems = await tx.select({
          id: purchaseOrderItems.id,
          quantity: purchaseOrderItems.quantity,
          receivedQuantity: purchaseOrderItems.receivedQuantity,
          productId: purchaseOrderItems.productId,
        }).from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.poId, poId))
          .for('update');

        // Fetch product names separately (FOR UPDATE cannot be applied to LEFT JOIN nullable side)
        const productIds = lockedPoItems.map(i => i.productId).filter((id): id is number => id !== null);
        const productNames = productIds.length > 0
          ? await tx.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, productIds))
          : [];
        const productNameMap = new Map(productNames.map(p => [p.id, p.name]));

        const poItemMap = new Map(lockedPoItems.map(i => [i.id, { ...i, productName: productNameMap.get(i.productId!) ?? null }]));

        // Aggregate requested quantities per poItemId to catch duplicate-line over-receive
        const requestedByPoItem = new Map<number, number>();
        for (const item of items) {
          if (item.receivedQuantity <= 0) continue;
          requestedByPoItem.set(item.poItemId, (requestedByPoItem.get(item.poItemId) ?? 0) + item.receivedQuantity);
        }

        const overReceiveErrors: string[] = [];
        for (const [poItemId, totalRequested] of requestedByPoItem) {
          const existing = poItemMap.get(poItemId);
          if (!existing) {
            overReceiveErrors.push(`PO item ID ${poItemId} not found on PO ${po.poNumber}`);
            continue;
          }
          const remaining = existing.quantity - (existing.receivedQuantity ?? 0);
          const productLabel = existing.productName || `Product ID ${existing.productId}`;
          if (remaining === 0) {
            overReceiveErrors.push(
              `All units for "${productLabel}" have already been received on this PO`
            );
          } else if (totalRequested > remaining) {
            overReceiveErrors.push(
              `Cannot receive ${totalRequested} units for "${productLabel}" — only ${remaining} unit${remaining === 1 ? "" : "s"} remaining on this PO`
            );
          }
        }

        if (overReceiveErrors.length > 0) {
          throw new OverReceiveError(overReceiveErrors);
        }

        const [newReceipt] = await tx.insert(goodsReceipts).values({
          receiptNumber,
          poId,
          supplierId: po.supplierId,
          receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
          status: 'confirmed',
          notes: notes || '',
          referenceNumber: referenceNumber || null,
          referenceDate: referenceDate || null,
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

      // Recalculate PO payment status now that a new GRN exists
      await recalculatePOPaymentStatus(poId);

      const refDetail = referenceNumber ? ` ref="${referenceNumber}"${referenceDate ? ` date="${referenceDate}"` : ''}` : '';
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(receipt.id), targetType: 'goods_receipt', action: 'CREATE', details: `Goods receipt ${receipt.receiptNumber} from PO #${po.poNumber}${refDetail}` });
      res.status(201).json({
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        poStatus: (allReceived || forceClose) ? 'closed' : 'submitted',
        message: `Goods receipt ${receipt.receiptNumber} created and stock updated for ${items.filter(i => i.receivedQuantity > 0).length} products`
      });
    } catch (error) {
      if (error instanceof OverReceiveError) {
        return res.status(400).json({ error: 'Over-receive not allowed', details: error.details });
      }
      console.error('Error creating goods receipt:', error);
      res.status(500).json({ error: 'Failed to create goods receipt' });
    }
  });
}
