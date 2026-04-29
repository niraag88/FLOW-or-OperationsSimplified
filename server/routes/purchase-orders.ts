import type { Express } from "express";
import { purchaseOrders, purchaseOrderItems, goodsReceipts, suppliers, brands, products, recycleBin, storageObjects } from "@shared/schema";
import { insertPurchaseOrderSchema } from "@shared/schema";
import { db } from "../db";
import { eq, sql, inArray } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, deleteStorageObjectSafely, type AuthenticatedRequest } from "../middleware";
import {
  computePurchaseOrderTotals,
  PurchaseOrderRequestError,
} from "../lib/purchaseOrderTotals";

// Strip client-supplied totals from the validated header payload before
// persisting. POST and PUT recompute these via computePurchaseOrderTotals.
function stripClientTotals<T extends Record<string, unknown>>(data: T): T {
  const {
    totalAmount: _ignT,
    grandTotal: _ignG,
    vatAmount: _ignV,
    ...rest
  } = data as T & {
    totalAmount?: unknown;
    grandTotal?: unknown;
    vatAmount?: unknown;
  };
  return rest as T;
}

export function registerPurchaseOrderRoutes(app: Express) {
  app.get('/api/purchase-orders', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const { page, pageSize, search, status, supplierId, dateFrom, dateTo, excludeYears, paymentStatus } = req.query as Record<string, string>;
      const result = await businessStorage.getPurchaseOrders({
        page: page ? parseInt(page) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
        search: search || undefined,
        status: status || undefined,
        supplierId: supplierId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        excludeYears: excludeYears || undefined,
        paymentStatus: paymentStatus || undefined,
      });
      res.json(result);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      res.status(500).json({ error: 'Failed to fetch purchase orders' });
    }
  });

  app.get('/api/purchase-orders/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextPoNumber();
      res.json({ nextNumber });
    } catch (error) {
      console.error('Error getting next PO number:', error);
      res.status(500).json({ error: 'Failed to get next PO number' });
    }
  });

  app.post('/api/purchase-orders', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    if (!req.body.brandId) {
      return res.status(400).json({ error: 'brandId is required' });
    }
    if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required to save a purchase order' });
    }
    try {
      const { companySettings } = await import('@shared/schema');
      const [poNumber, settingsRow] = await Promise.all([
        businessStorage.generatePoNumber(),
        db.select().from(companySettings).limit(1),
      ]);
      const companySnapshotData = settingsRow[0] ? {
        companyName: settingsRow[0].companyName,
        address: settingsRow[0].address,
        phone: settingsRow[0].phone,
        email: settingsRow[0].email,
        vatNumber: settingsRow[0].vatNumber,
        taxNumber: settingsRow[0].taxNumber,
        logo: settingsRow[0].logo,
      } : null;

      const transformedBody = {
        ...req.body,
        orderDate: req.body.orderDate ? new Date(req.body.orderDate) : undefined,
        expectedDelivery: req.body.expectedDelivery ? new Date(req.body.expectedDelivery) : undefined,
        fxRateToAed: req.body.fxRateToAed !== undefined ? String(req.body.fxRateToAed) : undefined,
      };

      const validatedDataRaw = insertPurchaseOrderSchema.parse({
        ...transformedBody,
        poNumber,
        createdBy: req.user!.id
      });
      // Header payload with client-supplied totals stripped — totals
      // come from the helper below, never from the request body.
      const validatedData = stripClientTotals(validatedDataRaw);

      // Server-recomputed totals + per-item validation. Throws
      // PurchaseOrderRequestError on negative qty / bad unit price;
      // caught below to mirror today's 400 contract.
      const computed = computePurchaseOrderTotals(
        req.body.items,
        validatedData.currency ?? null,
        validatedData.fxRateToAed ?? null,
      );

      // Task #366 (RF-3): the helper legitimately skips lines with no
      // productId or qty <= 0 (kept by #351). The route's first guard
      // catches a literally empty items array; this second guard catches
      // a non-empty array whose every line was skipped after compute.
      // Without this, a PO would be created with zero items and zero
      // totals, sitting orphaned in the list view.
      if (computed.items.length === 0) {
        throw new PurchaseOrderRequestError(400, {
          error: 'At least one valid line item is required to save a purchase order',
        });
      }

      // Task #366 (RF-3): wrap header insert + item inserts + totals /
      // snapshot update in one db.transaction. Previously the header
      // was inserted via businessStorage.createPurchaseOrder OUTSIDE
      // any tx — a failure in the item loop or the totals UPDATE
      // would leave a header-only PO behind. The audit-log call stays
      // outside (fire-and-forget, matching the PUT path).
      const purchaseOrder = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(purchaseOrders)
          .values(validatedData)
          .returning();

        for (const item of computed.items) {
          await tx.insert(purchaseOrderItems).values({
            poId: created.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPriceStr,
            lineTotal: item.lineTotalStr,
            descriptionOverride: item.descriptionOverride,
            sizeOverride: item.sizeOverride,
          });
        }

        const [finalRow] = await tx
          .update(purchaseOrders)
          .set({
            totalAmount: computed.totalAmountStr,
            grandTotal: computed.grandTotalStr,
            companySnapshot: companySnapshotData,
          })
          .where(eq(purchaseOrders.id, created.id))
          .returning();

        return finalRow ?? created;
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(purchaseOrder.id), targetType: 'purchase_order', action: 'CREATE', details: `PO #${purchaseOrder.poNumber} created` });
      res.status(201).json(purchaseOrder);
    } catch (error) {
      if (error instanceof PurchaseOrderRequestError) {
        return res.status(error.statusCode).json(error.responseBody);
      }
      console.error('Error creating purchase order:', error);
      res.status(500).json({ error: 'Failed to create purchase order' });
    }
  });

  app.put('/api/purchase-orders/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      // Validate ID before any DB work — bare parseInt('abc') yields NaN
      // which then crashed inside the Drizzle query and surfaced as a 500
      // (Task #320). Strict digits-only check also rejects mixed strings
      // like "1abc" that parseInt would silently coerce to 1 and target
      // the wrong row.
      if (!/^\d+$/.test(req.params.id)) {
        return res.status(400).json({ error: 'Invalid purchase order ID' });
      }
      const poId = parseInt(req.params.id, 10);
      if (poId <= 0) {
        return res.status(400).json({ error: 'Invalid purchase order ID' });
      }

      const { companySnapshot: _ignoredPOSnapshot, ...bodyWithoutSnapshot } = req.body;
      const transformedBody = {
        ...bodyWithoutSnapshot,
        supplierId: req.body.supplierId ? parseInt(req.body.supplierId) : undefined,
        orderDate: req.body.orderDate ? new Date(req.body.orderDate) : undefined,
        expectedDelivery: req.body.expectedDelivery ? new Date(req.body.expectedDelivery) : undefined
      };

      const validatedDataRaw = insertPurchaseOrderSchema.partial().parse(transformedBody);
      // Strip client-supplied totals from EVERY PUT path. The header-only
      // path keeps today's businessStorage.updatePurchaseOrder write
      // (totals stay untouched); the items-included path recomputes
      // totals from quantity * unitPrice inside the transaction below.
      const validatedData = stripClientTotals(validatedDataRaw);

      const hasItems = req.body.items && Array.isArray(req.body.items);
      let updatedPO: typeof purchaseOrders.$inferSelect;

      if (hasItems) {
        // Header + items + totals run in one transaction so any failure
        // (e.g. received-quantity validation) rolls back atomically.
        updatedPO = await db.transaction(async (tx) => {
          const [currentPO] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
          if (!currentPO) {
            throw new PurchaseOrderRequestError(404, { error: 'Purchase order not found' });
          }

          const effectiveCurrency = (validatedData.currency ?? currentPO.currency) ?? null;
          const effectiveFxRate = validatedData.fxRateToAed ?? currentPO.fxRateToAed;

          const computed = computePurchaseOrderTotals(
            req.body.items,
            effectiveCurrency,
            effectiveFxRate,
          );

          // Task #366 (RF-3): mirror POST. Helper legitimately skips
          // lines without productId or qty <= 0; reject before any
          // header/items write so a PUT can never zero-out a PO.
          if (computed.items.length === 0) {
            throw new PurchaseOrderRequestError(400, {
              error: 'At least one valid line item is required to save a purchase order',
            });
          }

          const existingItems = await tx
            .select({ productId: purchaseOrderItems.productId, receivedQuantity: purchaseOrderItems.receivedQuantity })
            .from(purchaseOrderItems)
            .where(eq(purchaseOrderItems.poId, poId));
          const receivedQtyByProduct = new Map<number, number>();
          for (const ei of existingItems) {
            const existing = receivedQtyByProduct.get(ei.productId) ?? 0;
            receivedQtyByProduct.set(ei.productId, Math.max(existing, ei.receivedQuantity ?? 0));
          }

          const incomingProductIds = new Set(computed.items.map((it) => it.productId));
          for (const [productId, received] of receivedQtyByProduct.entries()) {
            if (received > 0 && !incomingProductIds.has(productId)) {
              throw new PurchaseOrderRequestError(400, {
                error: `Cannot remove a product that has already been received (received qty: ${received}). Reduce the quantity to at least ${received} instead.`,
              });
            }
          }
          for (const item of computed.items) {
            const prevReceived = receivedQtyByProduct.get(item.productId) ?? 0;
            if (item.quantity < prevReceived) {
              throw new PurchaseOrderRequestError(400, {
                error: `Cannot set quantity to ${item.quantity} — this product has already been received in quantity ${prevReceived}. The new quantity must be at least ${prevReceived}.`,
              });
            }
          }

          const [headerRow] = await tx
            .update(purchaseOrders)
            .set({ ...validatedData, updatedAt: new Date() })
            .where(eq(purchaseOrders.id, poId))
            .returning();

          await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
          for (const item of computed.items) {
            const prevReceived = receivedQtyByProduct.get(item.productId) ?? 0;
            await tx.insert(purchaseOrderItems).values({
              poId,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPriceStr,
              lineTotal: item.lineTotalStr,
              descriptionOverride: item.descriptionOverride,
              sizeOverride: item.sizeOverride,
              receivedQuantity: prevReceived,
            });
          }

          const [finalRow] = await tx
            .update(purchaseOrders)
            .set({
              totalAmount: computed.totalAmountStr,
              grandTotal: computed.grandTotalStr,
            })
            .where(eq(purchaseOrders.id, poId))
            .returning();

          return finalRow ?? headerRow;
        });
      } else {
        // Header-only PUT: keep today's flow (no items touched, no
        // totals recomputed from items). validatedData has client
        // totals stripped, so a request body cannot poison
        // totalAmount / grandTotal even on this path.
        updatedPO = await businessStorage.updatePurchaseOrder(poId, validatedData);

        if (req.body.fxRateToAed !== undefined || req.body.currency !== undefined) {
          const [currentPO] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
          if (currentPO) {
            const currentTotal = parseFloat(String(currentPO.totalAmount)) || 0;
            const newFxRate = parseFloat(String(req.body.fxRateToAed ?? currentPO.fxRateToAed)) || 4.85;
            const newCurrency = req.body.currency ?? currentPO.currency ?? 'GBP';
            const recomputedGrandTotal = newCurrency === 'AED' ? currentTotal : currentTotal * newFxRate;
            await db.update(purchaseOrders)
              .set({ grandTotal: recomputedGrandTotal.toFixed(2) })
              .where(eq(purchaseOrders.id, poId));
          }
        }
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(poId), targetType: 'purchase_order', action: 'UPDATE', details: `PO #${updatedPO.poNumber} updated (status: ${updatedPO.status})` });
      res.json(updatedPO);
    } catch (error) {
      if (error instanceof PurchaseOrderRequestError) {
        return res.status(error.statusCode).json(error.responseBody);
      }
      console.error('Error updating purchase order:', error);
      res.status(500).json({ error: 'Failed to update purchase order' });
    }
  });

  app.delete('/api/purchase-orders/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const poId = parseInt(req.params.id);
      const userEmail = req.user?.email || req.user?.username || 'unknown';

      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
      if (!po) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }
      if (po.status === 'cancelled') {
        return res.status(400).json({ error: 'Cancelled purchase orders cannot be deleted. The document is retained for audit purposes.' });
      }
      const [grnCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(goodsReceipts)
        .where(eq(goodsReceipts.poId, poId));
      if ((grnCount?.count ?? 0) > 0) {
        return res.status(400).json({ error: `Cannot delete PO #${po.poNumber} — it has ${grnCount.count} linked goods receipt(s) which are retained for audit. The PO must remain to preserve the GRN history.` });
      }

      const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));

      await db.transaction(async (tx) => {
        await tx.insert(recycleBin).values({
          documentType: 'PurchaseOrder',
          documentId: poId.toString(),
          documentNumber: po.poNumber,
          documentData: JSON.stringify({ header: po, items }),
          deletedBy: userEmail,
          originalStatus: po.status,
          canRestore: true,
        });
        await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
        await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, poId));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(poId), targetType: 'purchase_order', action: 'DELETE', details: `PO #${po.poNumber} deleted` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      res.status(500).json({ error: 'Failed to delete purchase order' });
    }
  });

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

  app.patch('/api/purchase-orders/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const { scanKey } = req.body;
      if (!scanKey || typeof scanKey !== 'string') {
        return res.status(400).json({ error: 'scanKey is required' });
      }
      const [updated] = await db
        .update(purchaseOrders)
        .set({ supplierScanKey: scanKey, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Purchase order not found' });
      res.json(updated);
    } catch (error) {
      console.error('Error saving PO scan key:', error);
      res.status(500).json({ error: 'Failed to save file' });
    }
  });

  app.delete('/api/purchase-orders/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
      if (!po) return res.status(404).json({ error: 'Purchase order not found' });

      if (po.supplierScanKey) {
        const storageResult = await deleteStorageObjectSafely(po.supplierScanKey);
        if (!storageResult.ok) {
          console.error(
            `Failed to delete purchase-order supplier scan from storage: type=purchase_order id=${id} key=${po.supplierScanKey} error=${storageResult.error}`
          );
          return res.status(502).json({ error: 'Could not delete file from storage. Please try again.' });
        }
        await db.delete(storageObjects).where(eq(storageObjects.key, po.supplierScanKey));
      }

      const [updated] = await db
        .update(purchaseOrders)
        .set({ supplierScanKey: null, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id))
        .returning();

      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(id),
        targetType: 'purchase_order',
        action: 'REMOVE_FILE',
        details: `Document removed from Purchase Order #${po.poNumber}`,
      });

      res.json(updated);
    } catch (error) {
      console.error('Error removing PO scan key:', error);
      res.status(500).json({ error: 'Failed to remove file' });
    }
  });

  app.patch('/api/purchase-orders/:id/status', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const { status } = req.body;
      if (!['submitted', 'closed'].includes(status)) {
        return res.status(400).json({ error: 'Status must be submitted or closed' });
      }
      const [existing] = await db.select({ id: purchaseOrders.id, status: purchaseOrders.status, poNumber: purchaseOrders.poNumber })
        .from(purchaseOrders).where(eq(purchaseOrders.id, id));
      if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
      const validTransitions: Record<string, string> = { closed: 'submitted', submitted: 'closed' };
      if (validTransitions[existing.status] !== status) {
        return res.status(400).json({ error: `Cannot transition from '${existing.status}' to '${status}'` });
      }
      const [updated] = await db.update(purchaseOrders)
        .set({ status, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id))
        .returning();
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'purchase_order', action: 'UPDATE', details: `PO #${updated.poNumber} status changed from ${existing.status} to ${status}` });
      res.json(updated);
    } catch (error) {
      console.error('Error updating PO status:', error);
      res.status(500).json({ error: 'Failed to update purchase order status' });
    }
  });
}
