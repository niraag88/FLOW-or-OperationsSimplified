import type { Express } from "express";
import { purchaseOrders, storageObjects } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { requireAuth, writeAuditLog, deleteStorageObjectSafely, type AuthenticatedRequest } from "../../middleware";
import { logger } from "../../logger";

export function registerPurchaseOrderScanKeyRoutes(app: Express) {
  app.patch('/api/purchase-orders/:id/scan-key', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
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
      logger.error('Error saving PO scan key:', error);
      res.status(500).json({ error: 'Failed to save file' });
    }
  });

  app.delete('/api/purchase-orders/:id/scan-key', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
      if (!po) return res.status(404).json({ error: 'Purchase order not found' });

      if (po.supplierScanKey) {
        const storageResult = await deleteStorageObjectSafely(po.supplierScanKey);
        if (!storageResult.ok) {
          logger.error(
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
      logger.error('Error removing PO scan key:', error);
      res.status(500).json({ error: 'Failed to remove file' });
    }
  });
}
