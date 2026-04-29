import type { Express } from "express";
import { deliveryOrders, deliveryOrderItems } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../../businessStorage";
import { requireAuth, writeAuditLog, updateProductStock, type AuthenticatedRequest } from "../../middleware";
import { resolveDocumentTotals, isTotalsError, normalizeTaxTreatment, resolveAuthoritativeTaxTreatment } from "../../utils/totals";

export function registerDeliveryOrderUpdateRoutes(app: Express) {
  app.put('/api/delivery-orders/:id', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const body = req.body ?? {};

      // Reject an explicit empty/invalid items field BEFORE any DB read or
      // write. An omitted items key is a legitimate header-only edit and
      // falls through to the existing recompute-from-stored-items path.
      // But if the caller explicitly supplies items, it must be a non-empty
      // array of objects — otherwise the saved-document contract (every
      // delivery order must have at least one valid line) is violated and
      // we would silently keep stale items. Mirrors the no_line_items
      // contract that POST already enforces via the totals resolver.
      if (typeof body === 'object' && body !== null && 'items' in body) {
        const rawItems = (body as { items?: unknown }).items;
        const isValidItemsArray =
          Array.isArray(rawItems)
          && rawItems.length > 0
          && rawItems.every((it) => it !== null && typeof it === 'object' && !Array.isArray(it));
        if (!isValidItemsArray) {
          return res.status(400).json({
            error: 'no_line_items',
            message: 'At least one valid line item is required',
          });
        }
      }

      // Fetch existing DO and items before any changes
      const [existingDO] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!existingDO) return res.status(404).json({ error: 'Delivery order not found' });

      const oldItems = await db.select().from(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));

      const bodyCustomerName: string | undefined = body.customer_name;
      let customerName = bodyCustomerName || 'Unknown Customer';
      let customerId: number | undefined = undefined;
      let customerVatTreatment: string | null = null;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
          customerVatTreatment = customer.vatTreatment ?? null;
        }
      } else if (existingDO.customerId) {
        // Body omitted customer_id — fall back to the existing DO's
        // customer so authoritative VAT resolution still applies (an
        // exempt customer must never be silently switched to VAT).
        const cust = await businessStorage.getCustomerById(existingDO.customerId);
        customerVatTreatment = cust?.vatTreatment ?? null;
      }
      // Preserve existing customer linkage on header-only edits so
      // future edits retain authoritative VAT.
      const persistCustomerId = customerId ?? existingDO.customerId ?? null;
      const persistCustomerName =
        bodyCustomerName
        ?? (customerId ? customerName : existingDO.customerName)
        ?? 'Unknown Customer';

      const newStatus = body.status || 'draft';

      // Block status downgrades from 'delivered' — use the cancel endpoint instead
      if (existingDO.status === 'delivered' && newStatus !== 'delivered') {
        return res.status(400).json({ error: 'Cannot change status of a delivered order. Use the Cancel action to cancel it.' });
      }

      // Resolve and validate items + totals BEFORE any DB write. If items
      // are not present in the body, recompute totals from the already-stored
      // items so persisted totals always match persisted lines. Validation
      // runs before delete/insert so a 400 cannot leave the DO without lines.
      const { companySettings } = await import('@shared/schema');
      const [putSettingsRow] = await db.select().from(companySettings).limit(1);
      const defaultVatRate = putSettingsRow?.defaultVatRate
        ? parseFloat(putSettingsRow.defaultVatRate)
        : 0.05;

      // Authoritative VAT resolution. Customer wins when explicitly
      // zero-rated/exempt/reverse-charge/international (no VAT can be
      // added, even if the client requested StandardRated). Otherwise
      // fall back through body > existing > customer-inferred.
      const requestedTreatment = resolveAuthoritativeTaxTreatment(
        body.tax_treatment,
        existingDO.taxTreatment,
        customerVatTreatment,
      );
      const willReplaceItems = Array.isArray(body.items) && body.items.length > 0;

      let resolvedTreatment: 'StandardRated' | 'ZeroRated' = 'StandardRated';
      let resolvedSubtotal = 0;
      let resolvedVatAmount = 0;
      let resolvedTotal = 0;
      let resolvedVatRate = 0;
      let resolvedItems: Array<{
        product_id: number | null;
        brand_id: number | null;
        product_code: string | null;
        description: string;
        quantity: number;
        unit_price: number;
        line_total: number;
      }> = [];

      if (willReplaceItems) {
        let resolved;
        try {
          resolved = resolveDocumentTotals({
            items: body.items,
            taxTreatment: requestedTreatment,
            defaultVatRate,
          });
        } catch (err) {
          if (isTotalsError(err)) {
            return res.status(400).json({ error: err.code, message: err.message });
          }
          throw err;
        }
        resolvedTreatment = resolved.taxTreatment;
        resolvedSubtotal = resolved.subtotal;
        resolvedVatAmount = resolved.vatAmount;
        resolvedTotal = resolved.totalAmount;
        resolvedVatRate = resolved.vatRate;
        resolvedItems = resolved.items.map(it => ({
          product_id: it.product_id ? parseInt(String(it.product_id)) : null,
          brand_id: it.brand_id ? parseInt(String(it.brand_id)) : null,
          product_code: (it.product_code as string) || null,
          description: (it.description as string) || (it.product_name as string) || '',
          quantity: it.quantity,
          unit_price: it.unit_price,
          line_total: it.line_total,
        }));
      }

      // Sentinels thrown from inside the transaction so we can map them to
      // the correct HTTP status outside (mirrors the cancel route's pattern).
      const NOT_FOUND = '__do_not_found__';
      const ALREADY_CANCELLED = '__do_already_cancelled__';
      const DOWNGRADE_BLOCKED = '__do_downgrade_blocked__';

      let becomingDelivered = false;

      try {
        await db.transaction(async (tx) => {
          // Lock the DO row so a concurrent PUT or cancel cannot race with
          // us. Without this, two simultaneous edits on the same delivered
          // DO could both pass the pre-write status check and both
          // reconcile stock against the same stale snapshot, double-
          // adjusting product counts.
          const [locked] = await tx.select({
            id: deliveryOrders.id,
            status: deliveryOrders.status,
          }).from(deliveryOrders).where(eq(deliveryOrders.id, id)).for('update');

          if (!locked) throw new Error(NOT_FOUND);
          if (locked.status === 'cancelled') throw new Error(ALREADY_CANCELLED);
          // Re-check the downgrade guard inside the lock — another request
          // may have transitioned this DO to 'delivered' between our
          // pre-tx read and acquiring the lock.
          if (locked.status === 'delivered' && newStatus !== 'delivered') {
            throw new Error(DOWNGRADE_BLOCKED);
          }

          // Re-read items inside the lock for a consistent snapshot. The
          // pre-tx oldItems read is no longer authoritative if another
          // request committed in between, so reconciliation and header-
          // only totals recompute must use this one.
          const lockedOldItems = await tx.select().from(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));

          if (!willReplaceItems) {
            if (lockedOldItems.length > 0) {
              const recomputeInput = lockedOldItems.map(it => ({
                product_id: it.productId,
                quantity: it.quantity,
                unit_price: parseFloat(it.unitPrice.toString()),
              }));
              const resolved = resolveDocumentTotals({
                items: recomputeInput,
                taxTreatment: requestedTreatment,
                defaultVatRate,
              });
              resolvedTreatment = resolved.taxTreatment;
              resolvedSubtotal = resolved.subtotal;
              resolvedVatAmount = resolved.vatAmount;
              resolvedTotal = resolved.totalAmount;
              resolvedVatRate = resolved.vatRate;
            } else {
              // No items to recompute against — keep zeros and run the raw
              // chain value through the same normaliser the resolver uses
              // so unknown or missing tax_treatment falls back to
              // ZeroRated, never silently adding 5% VAT.
              resolvedTreatment = normalizeTaxTreatment(requestedTreatment);
            }
          }

          await tx.update(deliveryOrders).set({
            customerName: persistCustomerName,
            customerId: persistCustomerId,
            status: newStatus,
            orderDate: body.order_date || null,
            reference: body.reference || null,
            referenceDate: body.reference_date || null,
            subtotal: resolvedSubtotal.toFixed(2),
            taxAmount: resolvedVatAmount.toFixed(2),
            totalAmount: resolvedTotal.toFixed(2),
            currency: body.currency || 'AED',
            notes: body.remarks || body.notes || null,
            taxRate: resolvedVatRate.toFixed(4),
            taxTreatment: resolvedTreatment,
            showRemarks: body.show_remarks || false,
          }).where(eq(deliveryOrders.id, id));

          const newItems: Array<{ productId: number | null; quantity: number }> = [];
          if (willReplaceItems) {
            await tx.delete(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));
            for (const item of resolvedItems) {
              await tx.insert(deliveryOrderItems).values({
                doId: id,
                productId: item.product_id,
                brandId: item.brand_id,
                productCode: item.product_code,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unit_price.toFixed(2),
                lineTotal: item.line_total.toFixed(2),
              });
              newItems.push({ productId: item.product_id, quantity: item.quantity });
            }
          } else {
            for (const it of lockedOldItems) {
              newItems.push({ productId: it.productId, quantity: Number(it.quantity) });
            }
          }

          // Stock movement logic based on the LOCKED status, not the pre-tx
          // existingDO.status — otherwise we could double-deduct if the DO
          // was concurrently transitioned to delivered.
          becomingDelivered = newStatus === 'delivered' && locked.status !== 'delivered';
          const remainingDelivered = newStatus === 'delivered' && locked.status === 'delivered';

          if (becomingDelivered) {
            // Deduct stock for all items with a product ID
            for (const item of newItems) {
              if (item.productId) {
                await updateProductStock(
                  item.productId,
                  -item.quantity,
                  'sale',
                  id,
                  'delivery_order',
                  0,
                  `Stock deducted: DO #${existingDO.orderNumber} delivered`,
                  req.user!.id,
                  tx,
                );
              }
            }
          } else if (remainingDelivered) {
            // Reconcile stock: compare locked old vs new quantities per product
            const oldQtyMap = new Map<number, number>();
            for (const item of lockedOldItems) {
              if (item.productId) {
                oldQtyMap.set(item.productId, (oldQtyMap.get(item.productId) || 0) + Number(item.quantity));
              }
            }
            const newQtyMap = new Map<number, number>();
            for (const item of newItems) {
              if (item.productId) {
                newQtyMap.set(item.productId, (newQtyMap.get(item.productId) || 0) + item.quantity);
              }
            }
            const allProductIds = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
            for (const productId of allProductIds) {
              const oldQty = oldQtyMap.get(productId) || 0;
              const newQty = newQtyMap.get(productId) || 0;
              const delta = oldQty - newQty; // positive = returned stock, negative = more deducted
              if (delta !== 0) {
                await updateProductStock(
                  productId,
                  delta,
                  'adjustment',
                  id,
                  'delivery_order',
                  0,
                  `Stock adjusted: DO #${existingDO.orderNumber} edited while delivered`,
                  req.user!.id,
                  tx,
                );
              }
            }
          }
        });
      } catch (txError) {
        if (txError instanceof Error) {
          if (txError.message === NOT_FOUND) {
            return res.status(404).json({ error: 'Delivery order not found' });
          }
          if (txError.message === ALREADY_CANCELLED) {
            return res.status(409).json({ error: 'Delivery order is already cancelled' });
          }
          if (txError.message === DOWNGRADE_BLOCKED) {
            return res.status(400).json({ error: 'Cannot change status of a delivered order. Use the Cancel action to cancel it.' });
          }
        }
        throw txError;
      }

      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'UPDATE', details: `DO #${updated.orderNumber} updated (status: ${updated.status})${becomingDelivered ? ' — stock deducted' : ''}` });
      res.json({ ...updated, do_number: updated.orderNumber, items: body.items || [] });
    } catch (error) {
      console.error('Error updating delivery order:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update delivery order' });
      }
    }
  });
}
