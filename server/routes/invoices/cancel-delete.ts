import type { Express } from "express";
import { invoices, invoiceLineItems, recycleBin } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { requireAuth, writeAuditLog, writeAuditLogSync, updateProductStock, type AuthenticatedRequest } from "../../middleware";
import { logger } from "../../logger";

export function registerInvoiceCancelDeleteRoutes(app: Express) {
  // PATCH /api/invoices/:id/cancel
  // Cancellation is strictly all-or-nothing for inventory: a delivered
  // invoice's full stock effect is reversed, exactly once per product, before
  // the invoice flips to `cancelled`. Partial reversal is rejected at the
  // door — partial returns / customer-kept items / goodwill cases must be
  // handled with a separate sale, write-off, or credit note.
  app.patch('/api/invoices/:id/cancel', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      // Reject any attempt to scope reversal to a subset of products. We
      // check for the *presence* of the field, not its value, so an empty
      // array also fails — that prevents callers from cancelling a delivered
      // invoice without reversing any stock.
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'productIdsToReverse')) {
        return res.status(400).json({
          error: 'partial_stock_reversal_not_allowed',
          message: 'Invoice cancellation is all-or-nothing. To keep some items with the customer, restore stock now and record a separate sale or write-off for those items.',
        });
      }

      const [invoice] = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        stockDeducted: invoices.stockDeducted,
      }).from(invoices).where(eq(invoices.id, id));

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (invoice.status === 'cancelled') {
        return res.status(409).json({ error: 'Invoice is already cancelled' });
      }

      let stockReversed = false;
      const ALREADY_CANCELLED = '__invoice_already_cancelled__';

      try {
        await db.transaction(async (tx) => {
          // Lock the invoice row so two concurrent cancellations can't both
          // post reversal movements.
          const [locked] = await tx.select({
            id: invoices.id,
            status: invoices.status,
            stockDeducted: invoices.stockDeducted,
          }).from(invoices).where(eq(invoices.id, id)).for('update');
          if (!locked || locked.status === 'cancelled') {
            // Another concurrent cancel beat us to it. Bail out of the tx
            // and let the outer handler return 409 — do not write a
            // misleading "cancelled — no stock to reverse" audit log.
            throw new Error(ALREADY_CANCELLED);
          }

          if (locked.stockDeducted) {
            const items = await tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));

            // Aggregate by productId so duplicate product lines collapse to a
            // single reversal entry per product. Skip items with no productId
            // (free-form lines produce no stock movement).
            type Agg = { quantity: number; unitPrice: number };
            const byProduct = new Map<number, Agg>();
            for (const item of items) {
              if (!item.productId) continue;
              const existing = byProduct.get(item.productId);
              const unitPrice = parseFloat(item.unitPrice.toString());
              if (existing) {
                existing.quantity += item.quantity;
                // Keep the first non-zero unit price for the audit trail.
                if (!existing.unitPrice && unitPrice) existing.unitPrice = unitPrice;
              } else {
                byProduct.set(item.productId, { quantity: item.quantity, unitPrice });
              }
            }

            for (const [productId, agg] of byProduct.entries()) {
              if (agg.quantity <= 0) continue;
              await updateProductStock(
                productId,
                agg.quantity,
                'invoice_cancellation',
                id,
                'invoice',
                agg.unitPrice,
                `Stock reversed — Invoice #${invoice.invoiceNumber} cancelled`,
                req.user!.id,
                tx,
              );
            }

            await tx.update(invoices).set({ stockDeducted: false }).where(eq(invoices.id, id));
            stockReversed = byProduct.size > 0;
          }

          // Flip status only after every reversal has succeeded.
          await tx.update(invoices).set({ status: 'cancelled' }).where(eq(invoices.id, id));

          // Task #375: write the audit row inside the same transaction so a
          // DB hiccup that loses the audit insert also rolls back the
          // status flip and the stock reversal — the audit trail is the
          // legal record of a destructive action and must never be
          // silently dropped.
          await writeAuditLogSync(tx, {
            actor: req.user!.id,
            actorName: req.user?.username || String(req.user!.id),
            targetId: String(id),
            targetType: 'invoice',
            action: 'UPDATE',
            details: stockReversed
              ? `Invoice #${invoice.invoiceNumber} cancelled — full stock reversed`
              : `Invoice #${invoice.invoiceNumber} cancelled — no stock to reverse`,
          });
        });
      } catch (txError) {
        if (txError instanceof Error && txError.message === ALREADY_CANCELLED) {
          return res.status(409).json({ error: 'Invoice is already cancelled' });
        }
        throw txError;
      }

      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      res.json(updated);
    } catch (error) {
      logger.error('Error cancelling invoice:', error);
      res.status(500).json({ error: 'Failed to cancel invoice' });
    }
  });

  app.delete('/api/invoices/:id', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const userEmail = req.user?.email || req.user?.username || 'unknown';

      const NOT_FOUND = '__inv_not_found__';
      const ALREADY_CANCELLED = '__inv_already_cancelled__';
      const STOCK_DEDUCTED = '__inv_stock_deducted__';
      type DelErr = Error & { sentinel?: string };

      let invoiceNumberForAudit = '';
      try {
        await db.transaction(async (tx) => {
          // Lock the invoice row so a concurrent PATCH /cancel (which
          // also takes FOR UPDATE) can't flip status under our feet.
          const [invoiceHeader] = await tx.select().from(invoices)
            .where(eq(invoices.id, id))
            .for('update');
          if (!invoiceHeader) {
            throw Object.assign(new Error(NOT_FOUND), { sentinel: NOT_FOUND });
          }
          if (invoiceHeader.status === 'cancelled') {
            throw Object.assign(new Error(ALREADY_CANCELLED), { sentinel: ALREADY_CANCELLED });
          }
          // Task #363 (RF-1): delivered invoices, and any invoice
          // whose stock has been deducted, must go through PATCH
          // .../cancel — the recycle-bin path doesn't reverse stock.
          if (invoiceHeader.status === 'delivered' || invoiceHeader.stockDeducted) {
            throw Object.assign(new Error(STOCK_DEDUCTED), { sentinel: STOCK_DEDUCTED });
          }

          const lineItems = await tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));

          await tx.insert(recycleBin).values({
            documentType: 'Invoice',
            documentId: id.toString(),
            documentNumber: invoiceHeader.invoiceNumber,
            documentData: JSON.stringify({ header: invoiceHeader, items: lineItems }),
            deletedBy: userEmail,
            originalStatus: invoiceHeader.status,
            canRestore: true,
          });
          await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
          await tx.delete(invoices).where(eq(invoices.id, id));
          invoiceNumberForAudit = invoiceHeader.invoiceNumber;
        });
      } catch (txError) {
        const e = txError as DelErr;
        if (e?.sentinel === NOT_FOUND) {
          return res.status(404).json({ error: 'Invoice not found' });
        }
        if (e?.sentinel === ALREADY_CANCELLED) {
          return res.status(400).json({ error: 'Cancelled invoices cannot be deleted. The document is retained for audit purposes.' });
        }
        if (e?.sentinel === STOCK_DEDUCTED) {
          return res.status(400).json({ error: 'Delivered invoices have already produced stock movements. Use Cancel Invoice to reverse stock and retain the audit record — they cannot be moved to the recycle bin.' });
        }
        throw txError;
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'DELETE', details: `Invoice #${invoiceNumberForAudit} moved to recycle bin` });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting invoice:', error);
      res.status(500).json({ error: 'Failed to delete invoice' });
    }
  });
}
