import type { Express } from "express";
import { purchaseOrders, purchaseOrderItems, goodsReceipts, suppliers, brands, products, recycleBin, storageObjects } from "@shared/schema";
import { insertPurchaseOrderSchema } from "@shared/schema";
import { db } from "../db";
import { eq, sql, inArray } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, requireRole, writeAuditLog, objectStorageClient, type AuthenticatedRequest } from "../middleware";

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
        expectedDelivery: req.body.expectedDelivery ? new Date(req.body.expectedDelivery) : undefined
      };

      const validatedData = insertPurchaseOrderSchema.parse({
        ...transformedBody,
        poNumber,
        createdBy: req.user!.id
      });

      const purchaseOrder = await businessStorage.createPurchaseOrder(validatedData);

      let computedTotal = 0;
      if (req.body.items && Array.isArray(req.body.items) && req.body.items.length > 0) {
        for (const item of req.body.items) {
          if (item.productId && item.quantity > 0) {
            const lineTotal = parseFloat(item.lineTotal) || 0;
            computedTotal += lineTotal;
            await db.insert(purchaseOrderItems).values({
              poId: purchaseOrder.id,
              productId: parseInt(item.productId),
              quantity: item.quantity,
              unitPrice: item.unitPrice.toString(),
              lineTotal: item.lineTotal.toString(),
              descriptionOverride: item.productName || null,
              sizeOverride: item.size || null,
            });
          }
        }
        const poFxRate = parseFloat(String(purchaseOrder.fxRateToAed)) || 4.85;
        const poCurrency = purchaseOrder.currency || 'GBP';
        const computedGrandTotal = poCurrency === 'AED' ? computedTotal : computedTotal * poFxRate;
        await db.update(purchaseOrders)
          .set({ totalAmount: computedTotal.toFixed(2), grandTotal: computedGrandTotal.toFixed(2), companySnapshot: companySnapshotData })
          .where(eq(purchaseOrders.id, purchaseOrder.id));
        purchaseOrder.totalAmount = computedTotal.toFixed(2);
        purchaseOrder.grandTotal = computedGrandTotal.toFixed(2);
      } else if (companySnapshotData) {
        await db.update(purchaseOrders)
          .set({ companySnapshot: companySnapshotData })
          .where(eq(purchaseOrders.id, purchaseOrder.id));
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(purchaseOrder.id), targetType: 'purchase_order', action: 'CREATE', details: `PO #${purchaseOrder.poNumber} created` });
      res.status(201).json(purchaseOrder);
    } catch (error) {
      console.error('Error creating purchase order:', error);
      res.status(500).json({ error: 'Failed to create purchase order' });
    }
  });

  app.put('/api/purchase-orders/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const poId = parseInt(req.params.id);

      const { companySnapshot: _ignoredPOSnapshot, ...bodyWithoutSnapshot } = req.body;
      const transformedBody = {
        ...bodyWithoutSnapshot,
        supplierId: req.body.supplierId ? parseInt(req.body.supplierId) : undefined,
        orderDate: req.body.orderDate ? new Date(req.body.orderDate) : undefined,
        expectedDelivery: req.body.expectedDelivery ? new Date(req.body.expectedDelivery) : undefined
      };

      const validatedData = insertPurchaseOrderSchema.partial().parse(transformedBody);

      const updatedPO = await businessStorage.updatePurchaseOrder(poId, validatedData);

      if (req.body.items && Array.isArray(req.body.items)) {
        const existingItems = await db
          .select({ productId: purchaseOrderItems.productId, receivedQuantity: purchaseOrderItems.receivedQuantity })
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.poId, poId));
        const receivedQtyByProduct = new Map<number, number>();
        for (const ei of existingItems) {
          const existing = receivedQtyByProduct.get(ei.productId) ?? 0;
          receivedQtyByProduct.set(ei.productId, Math.max(existing, ei.receivedQuantity ?? 0));
        }

        await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));

        let updatedComputedTotal = 0;
        for (const item of req.body.items) {
          if (item.productId && item.quantity > 0) {
            const productId = parseInt(item.productId);
            const prevReceived = receivedQtyByProduct.get(productId) ?? 0;
            updatedComputedTotal += parseFloat(item.lineTotal) || 0;
            await db.insert(purchaseOrderItems).values({
              poId: poId,
              productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice.toString(),
              lineTotal: item.lineTotal.toString(),
              descriptionOverride: item.productName || null,
              sizeOverride: item.size || null,
              receivedQuantity: prevReceived,
            });
          }
        }
        const putFxRate = parseFloat(String(req.body.fxRateToAed || updatedPO.fxRateToAed)) || 4.85;
        const putCurrency = req.body.currency || updatedPO.currency || 'GBP';
        const updatedGrandTotal = putCurrency === 'AED' ? updatedComputedTotal : updatedComputedTotal * putFxRate;
        await db.update(purchaseOrders)
          .set({ totalAmount: updatedComputedTotal.toFixed(2), grandTotal: updatedGrandTotal.toFixed(2) })
          .where(eq(purchaseOrders.id, poId));
      } else if (req.body.fxRateToAed !== undefined || req.body.currency !== undefined) {
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

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(poId), targetType: 'purchase_order', action: 'UPDATE', details: `PO #${updatedPO.poNumber} updated (status: ${updatedPO.status})` });
      res.json(updatedPO);
    } catch (error) {
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
      const [grnCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(goodsReceipts)
        .where(eq(goodsReceipts.poId, poId));
      if ((grnCount?.count ?? 0) > 0) {
        return res.status(400).json({ error: `Cannot delete PO #${po.poNumber} — it has ${grnCount.count} goods receipt(s). Delete the GRN(s) first.` });
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
        try {
          await objectStorageClient.delete(po.supplierScanKey);
          await db.delete(storageObjects).where(eq(storageObjects.key, po.supplierScanKey));
        } catch (storageErr) {
          console.warn('Could not delete object from storage (clearing key anyway):', storageErr);
        }
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

  app.patch('/api/purchase-orders/:id/payment', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const { paymentStatus, paymentMadeDate, paymentRemarks } = req.body;
      if (!paymentStatus || !['outstanding', 'paid'].includes(paymentStatus)) {
        return res.status(400).json({ error: 'paymentStatus must be "outstanding" or "paid"' });
      }
      if (paymentStatus === 'paid' && !paymentMadeDate) {
        return res.status(400).json({ error: 'paymentMadeDate is required when marking as paid' });
      }
      const updateData: Record<string, any> = { paymentStatus, updatedAt: new Date() };
      if (paymentStatus === 'paid') {
        updateData.paymentMadeDate = paymentMadeDate || null;
        updateData.paymentRemarks = paymentRemarks || null;
      } else {
        updateData.paymentMadeDate = null;
        updateData.paymentRemarks = null;
      }
      const [updated] = await db.update(purchaseOrders).set(updateData).where(eq(purchaseOrders.id, id)).returning();
      if (!updated) return res.status(404).json({ error: 'Purchase order not found' });
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'purchase_order', action: 'UPDATE', details: `Payment status set to ${paymentStatus} on PO #${updated.poNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error updating PO payment status:', error);
      res.status(500).json({ error: 'Failed to update payment status' });
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
