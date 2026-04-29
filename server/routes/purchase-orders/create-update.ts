import type { Express } from "express";
import { purchaseOrders, purchaseOrderItems, auditLog } from "@shared/schema";
import { insertPurchaseOrderSchema } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../../businessStorage";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../../middleware";
import {
  computePurchaseOrderTotals,
  parseFxRateOrDefault,
  PurchaseOrderRequestError,
} from "../../lib/purchaseOrderTotals";
import { logger } from "../../logger";

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

export function registerPurchaseOrderCreateUpdateRoutes(app: Express) {
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
      // snapshot update + audit-log row in ONE db.transaction. Previously
      // the header was inserted via businessStorage.createPurchaseOrder
      // OUTSIDE any tx — a failure in the item loop or the totals UPDATE
      // would leave a header-only PO behind, and a fire-and-forget audit
      // entry could race ahead of (or survive) a partial failure. Doing
      // every write through `tx` means rollback covers the audit row too:
      // a rejected POST leaves no PO AND no audit row.
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

        const settled = finalRow ?? created;
        await tx.insert(auditLog).values({
          actor: req.user!.id,
          actorName: req.user?.username || String(req.user!.id),
          targetId: String(settled.id),
          targetType: 'purchase_order',
          action: 'CREATE',
          details: `PO #${settled.poNumber} created`,
        });

        return settled;
      });

      res.status(201).json(purchaseOrder);
    } catch (error) {
      if (error instanceof PurchaseOrderRequestError) {
        return res.status(error.statusCode).json(error.responseBody);
      }
      logger.error('Error creating purchase order:', error);
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
        // Header-only PUT: validatedData has client totals stripped, so a
        // request body cannot poison totalAmount / grandTotal even on this
        // path.
        //
        // Task #369 (RF-3B): when fxRateToAed or currency change, validate
        // the EFFECTIVE fxRate BEFORE any DB write so a malformed fxRate
        // can never partially save the header (which previously silently
        // fell back to the 4.85 default via `parseFloat(...) || 4.85`).
        // Read currentPO first, validate via parseFxRateOrDefault (throws
        // PurchaseOrderRequestError(400) on bad input), THEN write.
        const fxOrCurrencyChanged =
          req.body.fxRateToAed !== undefined || req.body.currency !== undefined;

        let currentPO: typeof purchaseOrders.$inferSelect | undefined;
        let validatedFxRate: number | null = null;
        let newCurrency: string | null = null;

        if (fxOrCurrencyChanged) {
          [currentPO] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
          if (!currentPO) {
            throw new PurchaseOrderRequestError(404, { error: 'Purchase order not found' });
          }
          newCurrency = req.body.currency ?? currentPO.currency ?? 'GBP';
          // Use the effective value: caller's fxRateToAed if supplied,
          // otherwise the stored value. parseFxRateOrDefault throws on
          // any non-blank value that fails strict parsing or is <= 0.
          const fxInput = req.body.fxRateToAed !== undefined
            ? req.body.fxRateToAed
            : currentPO.fxRateToAed;
          validatedFxRate = parseFxRateOrDefault(fxInput);
        }

        updatedPO = await businessStorage.updatePurchaseOrder(poId, validatedData);

        if (currentPO && validatedFxRate !== null && newCurrency !== null) {
          const currentTotal = parseFloat(String(currentPO.totalAmount)) || 0;
          const recomputedGrandTotal =
            newCurrency === 'AED' ? currentTotal : currentTotal * validatedFxRate;
          await db.update(purchaseOrders)
            .set({ grandTotal: recomputedGrandTotal.toFixed(2) })
            .where(eq(purchaseOrders.id, poId));
        }
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(poId), targetType: 'purchase_order', action: 'UPDATE', details: `PO #${updatedPO.poNumber} updated (status: ${updatedPO.status})` });
      res.json(updatedPO);
    } catch (error) {
      if (error instanceof PurchaseOrderRequestError) {
        return res.status(error.statusCode).json(error.responseBody);
      }
      logger.error('Error updating purchase order:', error);
      res.status(500).json({ error: 'Failed to update purchase order' });
    }
  });
}
