import type { Express } from "express";
import { invoices, invoiceLineItems } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../../businessStorage";
import { requireAuth, writeAuditLog, updateProductStock, type AuthenticatedRequest } from "../../middleware";
import { resolveDocumentTotals, isTotalsError, normalizeTaxTreatment, resolveAuthoritativeTaxTreatment } from "../../utils/totals";

export function registerInvoiceUpdateRoutes(app: Express) {
  app.put('/api/invoices/:id', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const body = req.body ?? {};

      // Reject an explicit empty/invalid items field BEFORE any DB read or
      // write. An omitted items key is a legitimate header-only edit and
      // falls through to the existing recompute-from-stored-items path.
      // But if the caller explicitly supplies items, it must be a non-empty
      // array of objects — otherwise the saved-document contract (every
      // invoice must have at least one valid line) is violated and we
      // would silently keep stale items. Mirrors the no_line_items
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

      let customerName = body.customer_name || 'Unknown Customer';
      let customerId: number | undefined = undefined;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
        }
      }

      const [existingInvoice] = await db.select({
        status: invoices.status,
        stockDeducted: invoices.stockDeducted,
        invoiceNumber: invoices.invoiceNumber,
        taxTreatment: invoices.taxTreatment,
        customerId: invoices.customerId,
        customerName: invoices.customerName,
      }).from(invoices).where(eq(invoices.id, id));

      if (!existingInvoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (existingInvoice.status === 'cancelled') {
        return res.status(409).json({ error: 'Cannot edit a cancelled invoice' });
      }

      // Default the new status to the existing one so header-only edits don't accidentally revert it.
      const newStatus = body.status || existingInvoice.status || 'draft';

      // Cancellation must go through PATCH /api/invoices/:id/cancel — never via PUT.
      if (newStatus === 'cancelled') {
        return res.status(400).json({
          error: 'Use the cancel action to cancel an invoice. The normal update endpoint cannot cancel.',
        });
      }

      // Block reverting a stock-deducted invoice back to draft or submitted.
      // Stock has already been moved out; reverting would silently desync inventory.
      // Fast-fail using the pre-tx snapshot; the in-tx lock check is authoritative.
      if (existingInvoice.stockDeducted && (newStatus === 'draft' || newStatus === 'submitted')) {
        return res.status(400).json({
          error: 'Delivered invoices cannot be reverted. Use Cancel to reverse stock.',
        });
      }

      const willReplaceItems = Array.isArray(body.items) && body.items.length > 0;
      // (The "submittable status requires at least one item" check moved
      // inside the transaction so it runs against the locked items snapshot —
      // a concurrent line-item delete cannot slip a submit through.)

      // Resolve and validate items + totals BEFORE any DB write. If items
      // are not in the body (header-only edit), recompute totals from the
      // existing stored line items so the saved totals always match the
      // saved items. Either way, validation runs before delete/insert so a
      // 400 cannot leave the document with no lines.
      const { companySettings } = await import('@shared/schema');
      const [putSettingsRow] = await db.select().from(companySettings).limit(1);
      const defaultVatRate = putSettingsRow?.defaultVatRate
        ? parseFloat(putSettingsRow.defaultVatRate)
        : 0.05;

      // Authoritative VAT resolution. Customer wins when explicitly
      // zero-rated/exempt/reverse-charge/international (no VAT can be
      // added, even if the client requested StandardRated). Otherwise
      // fall back through body > existing > customer-inferred.
      // CRITICAL: when the body omits customer_id, fall back to the
      // existing invoice's customer so authority still applies.
      const effectiveCustomerIdForVat = customerId ?? existingInvoice.customerId ?? null;
      let putCustomerVatTreatment: string | null = null;
      if (effectiveCustomerIdForVat) {
        const cust = await businessStorage.getCustomerById(effectiveCustomerIdForVat);
        putCustomerVatTreatment = cust?.vatTreatment ?? null;
      }
      const treatmentInput = resolveAuthoritativeTaxTreatment(
        body.tax_treatment,
        existingInvoice.taxTreatment,
        putCustomerVatTreatment,
      );

      let resolvedTreatment: 'StandardRated' | 'ZeroRated' = 'StandardRated';
      let resolvedItems: Array<{
        product_id: number | null;
        brand_id: number | null;
        product_code: string | null;
        description: string;
        quantity: number;
        unit_price: number;
        line_total: number;
      }> = [];
      let resolvedSubtotal = 0;
      let resolvedVatAmount = 0;
      let resolvedTotal = 0;

      if (willReplaceItems) {
        let resolved;
        try {
          resolved = resolveDocumentTotals({
            items: body.items,
            taxTreatment: treatmentInput,
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
      // NOTE: header-only totals recompute moved inside the transaction so
      // it sees the locked items snapshot.

      // Sentinels thrown from inside the transaction so we can map them to
      // the correct HTTP status outside (mirrors the pattern used by the
      // delivery-orders PUT and the invoice cancel route).
      const NOT_FOUND = '__inv_not_found__';
      const ALREADY_CANCELLED = '__inv_already_cancelled__';
      const STOCK_REVERT_BLOCKED = '__inv_stock_revert_blocked__';
      const SUBMIT_REQUIRES_ITEMS = '__inv_submit_requires_items__';

      let becomingDelivered = false;
      let needsStockDeduction = false;
      let needsReconciliation = false;
      let lockedNewStatus = newStatus;
      let reconciledCount = 0;

      const invoiceNum = existingInvoice.invoiceNumber || String(id);
      // Preserve the existing customer linkage when the body omits
      // customer fields. Otherwise a header-only edit would silently
      // null out customerId and break VAT authority on the next edit.
      const persistCustomerId = customerId ?? existingInvoice.customerId ?? null;
      const persistCustomerName =
        body.customer_name
        ?? (customerId ? customerName : existingInvoice.customerName)
        ?? 'Unknown Customer';

      try {
        await db.transaction(async (tx) => {
          // Lock the invoice row so a concurrent PUT or cancel cannot race
          // with us. Without this, two simultaneous edits on the same
          // delivered invoice could both pass the pre-write status check
          // and both reconcile stock against the same stale snapshot,
          // double-adjusting product counts. Mirrors the row lock added
          // to the delivery-orders PUT in Task #306 and the cancel route.
          const [locked] = await tx.select({
            status: invoices.status,
            stockDeducted: invoices.stockDeducted,
          }).from(invoices).where(eq(invoices.id, id)).for('update');

          if (!locked) throw new Error(NOT_FOUND);
          if (locked.status === 'cancelled') throw new Error(ALREADY_CANCELLED);

          // Re-derive newStatus against the locked row. A header-only edit
          // (no body.status) must default to the *current* persisted status,
          // not a pre-tx snapshot — otherwise a concurrent transition that
          // committed between the pre-tx read and the lock would be silently
          // overwritten.
          lockedNewStatus = body.status || locked.status || 'draft';

          // Re-check the stock-revert guard against locked.stockDeducted
          // (the source of truth for inventory).
          if (locked.stockDeducted && (lockedNewStatus === 'draft' || lockedNewStatus === 'submitted')) {
            throw new Error(STOCK_REVERT_BLOCKED);
          }

          // In-lock items snapshot used for both header-only totals
          // recompute and the submit-requires-items pre-check.
          const lockedExistingItems = await tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));

          const submittableStatuses = ['submitted', 'paid', 'delivered'];
          if (submittableStatuses.includes(lockedNewStatus) && !willReplaceItems && lockedExistingItems.length === 0) {
            throw new Error(SUBMIT_REQUIRES_ITEMS);
          }

          // Header-only edits: recompute totals from the locked items
          // snapshot so persisted totals stay consistent with persisted lines.
          if (!willReplaceItems) {
            if (lockedExistingItems.length === 0) {
              // Nothing to recompute against — keep zeros. Run the raw chain
              // value through the same normaliser so unknown/missing
              // tax_treatment falls back to ZeroRated, never silently
              // adding 5% VAT.
              resolvedTreatment = normalizeTaxTreatment(treatmentInput);
            } else {
              const recomputeInput = lockedExistingItems.map(it => ({
                product_id: it.productId,
                quantity: it.quantity,
                unit_price: parseFloat(it.unitPrice.toString()),
              }));
              const resolved = resolveDocumentTotals({
                items: recomputeInput,
                taxTreatment: treatmentInput,
                defaultVatRate,
              });
              resolvedTreatment = resolved.taxTreatment;
              resolvedSubtotal = resolved.subtotal;
              resolvedVatAmount = resolved.vatAmount;
              resolvedTotal = resolved.totalAmount;
            }
          }

          // Re-derive stock flags from the locked snapshot — must reflect
          // what the row currently looks like, not the pre-tx read.
          becomingDelivered = lockedNewStatus === 'delivered' && locked.status !== 'delivered';
          needsStockDeduction = becomingDelivered && !locked.stockDeducted;
          // Reconcile when stock has already been deducted AND the user is
          // replacing line items. Source of truth is locked.stockDeducted.
          needsReconciliation = !!locked.stockDeducted && willReplaceItems;

          // 1. Update header — totals are server-computed; client values are ignored.
          await tx.update(invoices).set({
            customerName: persistCustomerName,
            customerId: persistCustomerId,
            amount: resolvedTotal.toFixed(2),
            vatAmount: resolvedVatAmount.toFixed(2),
            status: lockedNewStatus,
            invoiceDate: body.invoice_date || null,
            reference: body.reference || null,
            referenceDate: body.reference_date || null,
            notes: body.remarks || body.notes || null,
            currency: body.currency || 'AED',
            taxTreatment: resolvedTreatment,
            paymentMethod: body.payment_method || null,
          }).where(eq(invoices.id, id));

          // 2. Snapshot OLD items before delete (only needed if we'll reconcile).
          //    Reuse the locked snapshot we already have to save a redundant SELECT.
          let oldItems: Array<{ productId: number | null; quantity: number; unitPrice: string }> = [];
          if (willReplaceItems && needsReconciliation) {
            oldItems = lockedExistingItems.map(it => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
            }));
          }

          // 3. Replace line items if provided — using resolver-validated values.
          if (willReplaceItems) {
            await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
            for (const item of resolvedItems) {
              await tx.insert(invoiceLineItems).values({
                invoiceId: id,
                productId: item.product_id,
                brandId: item.brand_id,
                productCode: item.product_code,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unit_price.toFixed(2),
                lineTotal: item.line_total.toFixed(2),
              });
            }
          }

          // 4a. Reconcile (already-deducted invoice with item edits): aggregate per productId,
          //     compute oldQty - newQty per product, apply each non-zero delta as an 'adjustment'.
          if (needsReconciliation) {
            const oldByProduct = new Map<number, { qty: number; unitPrice: number }>();
            for (const it of oldItems) {
              if (it.productId == null) continue;
              const cur = oldByProduct.get(it.productId);
              if (cur) {
                cur.qty += it.quantity;
              } else {
                oldByProduct.set(it.productId, {
                  qty: it.quantity,
                  unitPrice: parseFloat(it.unitPrice.toString()),
                });
              }
            }

            const newByProduct = new Map<number, { qty: number; unitPrice: number }>();
            for (const item of resolvedItems) {
              if (item.product_id == null) continue;
              const cur = newByProduct.get(item.product_id);
              if (cur) {
                cur.qty += item.quantity;
              } else {
                newByProduct.set(item.product_id, { qty: item.quantity, unitPrice: item.unit_price });
              }
            }

            const allProductIds = new Set<number>([...oldByProduct.keys(), ...newByProduct.keys()]);
            for (const pid of allProductIds) {
              const oldQty = oldByProduct.get(pid)?.qty ?? 0;
              const newQty = newByProduct.get(pid)?.qty ?? 0;
              const adjustment = oldQty - newQty; // +ve returns stock, -ve deducts more
              if (adjustment === 0) continue;
              const unitCost =
                newByProduct.get(pid)?.unitPrice ??
                oldByProduct.get(pid)?.unitPrice ??
                0;
              await updateProductStock(
                pid,
                adjustment,
                'adjustment',
                id,
                'invoice',
                unitCost,
                `Stock reconciled after editing delivered Invoice #${invoiceNum}`,
                req.user!.id,
                tx
              );
              reconciledCount++;
            }
            // Do NOT touch stockDeducted — it remains true.
          } else if (needsStockDeduction) {
            // 4b. First-time deduction: deduct full quantities for the now-saved items.
            const itemsToDeduct = await tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
            for (const item of itemsToDeduct) {
              if (!item.productId) continue;
              await updateProductStock(
                item.productId,
                -item.quantity,
                'sale',
                id,
                'invoice',
                parseFloat(item.unitPrice.toString()),
                `Sale from Invoice #${invoiceNum}`,
                req.user!.id,
                tx
              );
            }
            await tx.update(invoices).set({ stockDeducted: true }).where(eq(invoices.id, id));
          }
        });
      } catch (txError) {
        if (txError instanceof Error) {
          if (txError.message === NOT_FOUND) {
            return res.status(404).json({ error: 'Invoice not found' });
          }
          if (txError.message === ALREADY_CANCELLED) {
            return res.status(409).json({ error: 'Cannot edit a cancelled invoice' });
          }
          if (txError.message === STOCK_REVERT_BLOCKED) {
            return res.status(400).json({ error: 'Delivered invoices cannot be reverted. Use Cancel to reverse stock.' });
          }
          if (txError.message === SUBMIT_REQUIRES_ITEMS) {
            return res.status(400).json({ error: 'At least one item is required to submit an invoice' });
          }
        }
        throw txError;
      }

      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      const stockSuffix = needsStockDeduction
        ? ' — stock deducted'
        : (reconciledCount > 0
          ? ` — stock reconciled (${reconciledCount} product${reconciledCount === 1 ? '' : 's'})`
          : '');
      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(id),
        targetType: 'invoice',
        action: 'UPDATE',
        details: `Invoice #${updated.invoiceNumber} updated (status: ${updated.status})${stockSuffix}`,
      });
      res.json({ ...updated, items: body.items || [] });
    } catch (error) {
      console.error('Error updating invoice:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update invoice' });
      }
    }
  });
}
