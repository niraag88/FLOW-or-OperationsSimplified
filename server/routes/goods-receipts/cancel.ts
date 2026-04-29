import type { Express } from "express";
import { goodsReceipts, goodsReceiptItems, purchaseOrders, purchaseOrderItems, products } from "@shared/schema";
import { db } from "../../db";
import { eq, sql, inArray, and } from "drizzle-orm";
import { requireAuth, writeAuditLogSync, updateProductStock, type AuthenticatedRequest } from "../../middleware";
import {
  GrnCancelNegativeStockError,
  PoReceivedQtyUnderflowError,
  recalculatePOPaymentStatus,
  type NegativeStockEntry,
} from "./helpers";
import { logger } from "../../logger";

export function registerGoodsReceiptCancelRoutes(app: Express) {
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

            // Task #375: GRN cancellation reverses stock movements (or is a
            // no-op for itemless GRNs) and is destructive enough that the
            // audit trail must commit atomically with the status flip.
            await writeAuditLogSync(tx, {
              actor: req.user!.id,
              actorName: req.user?.username || String(req.user!.id),
              targetId: String(grnId),
              targetType: 'goods_receipt',
              action: 'CANCEL',
              details: `GRN ${grn.receiptNumber} cancelled (no line items, nothing to reverse)`,
            });
          }
        });
        if (updatedRows === 0) {
          return res.status(409).json({ error: 'Goods receipt is already cancelled' });
        }
        await recalculatePOPaymentStatus(grn.poId);
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

          // Task #375: write the audit row inside the same transaction
          // as the stock reversal + status flip + PO recompute. The
          // audit detail string needs the PO number and the per-product
          // reversal summary, so we build both inside the tx instead of
          // re-querying after — that keeps the durability contract: a
          // failed audit insert rolls back the stock movements, the
          // PO-item adjustments, and the status change atomically.
          const [auditPoRow] = await tx.select({ poNumber: purchaseOrders.poNumber }).from(purchaseOrders).where(eq(purchaseOrders.id, grn.poId));
          const productList = reversedSummary
            .map(p => `${p.productName} (id=${p.productId}, qty=-${p.reversedQty}, ${p.previousStock}->${p.newStock})`)
            .join('; ');
          const negativeNote = negativeStock.length > 0
            ? ` NEGATIVE-STOCK CONFIRMED for ${negativeStock.length} product(s)`
            : '';
          const paidNote = grn.paymentStatus === 'paid' ? ' [paid-GRN ack]' : '';
          await writeAuditLogSync(tx, {
            actor: req.user!.id,
            actorName: req.user?.username || String(req.user!.id),
            targetId: String(grnId),
            targetType: 'goods_receipt',
            action: 'CANCEL',
            details: `GRN ${grn.receiptNumber} cancelled (PO ${auditPoRow?.poNumber || `#${grn.poId}`}). Reversed ${reversedSummary.length} product(s): ${productList}.${negativeNote}${paidNote}`,
          });
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

      res.json({ success: true, grnId, reversedProducts: reversedSummary, negativeStock });
    } catch (error) {
      logger.error('Error cancelling goods receipt:', error);
      res.status(500).json({ error: 'Failed to cancel goods receipt' });
    }
  });
}
