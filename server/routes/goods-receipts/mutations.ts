import type { Express } from "express";
import { goodsReceipts, goodsReceiptItems, purchaseOrders, purchaseOrderItems, products } from "@shared/schema";
import { db } from "../../db";
import { eq, sql, inArray } from "drizzle-orm";
import { businessStorage } from "../../businessStorage";
import { requireAuth, writeAuditLog, updateProductStock, type AuthenticatedRequest } from "../../middleware";
import { OverReceiveError, recalculatePOPaymentStatus } from "./helpers";
import { logger } from "../../logger";

export function registerGoodsReceiptMutationRoutes(app: Express) {
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
      logger.error('Error updating GRN reference:', error);
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
      logger.error('Error updating GRN payment:', error);
      res.status(500).json({ error: 'Failed to update payment' });
    }
  });

  app.post('/api/goods-receipts', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const { poId, items, notes, forceClose, receivedDate, referenceNumber, referenceDate } = req.body;

      if (!poId || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Purchase Order ID and items are required' });
      }

      // Reject empty / zero-quantity payloads on a regular receive so we never create
      // an itemless GRN header that would later be untracked by stock movements.
      // BUT: when the user explicitly chose Save & Close, an all-zero payload is the
      // legitimate "close this PO without receiving anything more" path — handle it
      // below by closing the PO without inserting a GRN.
      const positiveItems = items.filter((it: any) => Number(it?.receivedQuantity) > 0);
      if (positiveItems.length === 0 && !forceClose) {
        return res.status(400).json({
          error: 'no_received_quantity',
          message: 'A goods receipt must include at least one line with a received quantity greater than zero.',
        });
      }

      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
      if (!po) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      // Save & Close with no quantities to receive: just close the PO, no GRN created.
      if (positiveItems.length === 0 && forceClose) {
        let closed = false;
        await db.transaction(async (tx) => {
          // Lock the PO row to prevent concurrent close/delete/reopen races.
          const [locked] = await tx.select({ id: purchaseOrders.id, status: purchaseOrders.status })
            .from(purchaseOrders)
            .where(eq(purchaseOrders.id, poId))
            .for('update');
          if (!locked) {
            return; // PO disappeared between the read above and the lock
          }
          const updated = await tx.update(purchaseOrders)
            .set({ status: 'closed', updatedAt: new Date() })
            .where(eq(purchaseOrders.id, poId))
            .returning({ id: purchaseOrders.id });
          closed = updated.length === 1;
        });
        if (!closed) {
          return res.status(409).json({ error: 'Failed to close PO — it may have been deleted or modified by another user.' });
        }
        await recalculatePOPaymentStatus(poId);
        writeAuditLog({
          actor: req.user!.id,
          actorName: req.user?.username || String(req.user!.id),
          targetId: String(poId),
          targetType: 'purchase_order',
          action: 'UPDATE',
          details: `PO ${po.poNumber} closed (Save & Close, no further goods received)`,
        });
        return res.status(200).json({
          poStatus: 'closed',
          message: `PO ${po.poNumber} marked as closed`,
        });
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
      logger.error('Error creating goods receipt:', error);
      res.status(500).json({ error: 'Failed to create goods receipt' });
    }
  });
}
