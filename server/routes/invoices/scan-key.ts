import type { Express } from "express";
import { invoices, storageObjects } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { requireAuth, writeAuditLog, deleteStorageObjectSafely, type AuthenticatedRequest } from "../../middleware";

export function registerInvoiceScanKeyRoutes(app: Express) {
  app.patch('/api/invoices/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { scanKey } = req.body;
      if (!scanKey || typeof scanKey !== 'string') {
        return res.status(400).json({ error: 'scanKey is required' });
      }
      await db.update(invoices).set({ scanKey }).where(eq(invoices.id, id));
      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'UPLOAD', details: `Scan attached to Invoice #${updated.invoiceNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error updating invoice scan key:', error);
      res.status(500).json({ error: 'Failed to update scan key' });
    }
  });

  app.delete('/api/invoices/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (invoice.scanKey) {
        const storageResult = await deleteStorageObjectSafely(invoice.scanKey);
        if (!storageResult.ok) {
          console.error(
            `Failed to delete invoice scan from storage: type=invoice id=${id} key=${invoice.scanKey} error=${storageResult.error}`
          );
          return res.status(502).json({ error: 'Could not delete file from storage. Please try again.' });
        }
        await db.delete(storageObjects).where(eq(storageObjects.key, invoice.scanKey));
      }
      await db.update(invoices).set({ scanKey: null }).where(eq(invoices.id, id));
      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'REMOVE_FILE', details: `Scan removed from Invoice #${invoice.invoiceNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error removing invoice scan key:', error);
      res.status(500).json({ error: 'Failed to remove file' });
    }
  });
}
