import type { Express } from "express";
import { invoices, invoiceLineItems } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { requireAuth, writeAuditLog, updateProductStock, type AuthenticatedRequest } from "../../middleware";
import { logger } from "../../logger";

export function registerInvoicePaymentRoutes(app: Express) {
  app.patch('/api/invoices/:id/payment', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { paymentStatus, paymentReceivedDate, paymentRemarks } = req.body;
      if (!paymentStatus || !['outstanding', 'paid'].includes(paymentStatus)) {
        return res.status(400).json({ error: 'paymentStatus must be "outstanding" or "paid"' });
      }
      const [existingForPayment] = await db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, id));
      if (!existingForPayment) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (existingForPayment.status === 'cancelled') {
        return res.status(409).json({ error: 'Cannot update payment on a cancelled invoice' });
      }
      if (paymentStatus === 'paid' && !paymentReceivedDate) {
        return res.status(400).json({ error: 'paymentReceivedDate is required when marking as paid' });
      }
      const updateData: Record<string, any> = { paymentStatus };
      if (paymentStatus === 'paid') {
        updateData.paymentReceivedDate = paymentReceivedDate || null;
        updateData.paymentRemarks = paymentRemarks || null;
      } else {
        updateData.paymentReceivedDate = null;
        updateData.paymentRemarks = null;
      }
      const [updated] = await db.update(invoices).set(updateData).where(eq(invoices.id, id)).returning();
      if (!updated) return res.status(404).json({ error: 'Invoice not found' });
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'UPDATE', details: `Payment status set to ${paymentStatus} on Invoice #${updated.invoiceNumber}` });
      res.json(updated);
    } catch (error) {
      logger.error('Error updating invoice payment status:', error);
      res.status(500).json({ error: 'Failed to update payment status' });
    }
  });

  app.post('/api/invoices/:id/process-sale', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) return res.status(400).json({ error: 'Invalid ID' });

      const [invoice] = await db.select({ stockDeducted: invoices.stockDeducted, invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, invoiceId));
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (invoice.stockDeducted) {
        return res.status(409).json({ error: `Stock already deducted for Invoice #${invoice.invoiceNumber}` });
      }

      const items = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));

      if (items.length === 0) {
        return res.status(400).json({ error: 'No items found for this invoice' });
      }

      await db.transaction(async (tx) => {
        for (const item of items) {
          if (!item.productId) continue;
          await updateProductStock(
            item.productId,
            -item.quantity,
            'sale',
            invoiceId,
            'invoice',
            parseFloat(item.unitPrice.toString()),
            `Sale from Invoice #${invoice.invoiceNumber}`,
            req.user!.id,
            tx
          );
        }
        await tx.update(invoices).set({ stockDeducted: true }).where(eq(invoices.id, invoiceId));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(invoiceId), targetType: 'invoice', action: 'UPDATE', details: `Invoice #${invoice.invoiceNumber} processed: stock deducted for ${items.length} products` });
      res.json({
        message: `Stock deducted for ${items.length} products from Invoice #${invoice.invoiceNumber}`
      });
    } catch (error) {
      logger.error('Error processing invoice sale:', error);
      res.status(500).json({ error: 'Failed to process invoice sale' });
    }
  });
}
