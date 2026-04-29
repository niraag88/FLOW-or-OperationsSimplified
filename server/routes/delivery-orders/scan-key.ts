import type { Express } from "express";
import { deliveryOrders, storageObjects } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { requireAuth, writeAuditLog, deleteStorageObjectSafely, type AuthenticatedRequest } from "../../middleware";

export function registerDeliveryOrderScanKeyRoutes(app: Express) {
  app.patch('/api/delivery-orders/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { scanKey } = req.body;
      if (!scanKey || typeof scanKey !== 'string') {
        return res.status(400).json({ error: 'scanKey is required' });
      }
      await db.update(deliveryOrders).set({ scanKey }).where(eq(deliveryOrders.id, id));
      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'UPLOAD', details: `Scan attached to DO #${updated.orderNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error updating delivery order scan key:', error);
      res.status(500).json({ error: 'Failed to update scan key' });
    }
  });

  app.delete('/api/delivery-orders/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const [doRecord] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!doRecord) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }
      if (doRecord.scanKey) {
        const storageResult = await deleteStorageObjectSafely(doRecord.scanKey);
        if (!storageResult.ok) {
          console.error(
            `Failed to delete delivery-order scan from storage: type=delivery_order id=${id} key=${doRecord.scanKey} error=${storageResult.error}`
          );
          return res.status(502).json({ error: 'Could not delete file from storage. Please try again.' });
        }
        await db.delete(storageObjects).where(eq(storageObjects.key, doRecord.scanKey));
      }
      await db.update(deliveryOrders).set({ scanKey: null }).where(eq(deliveryOrders.id, id));
      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'REMOVE_FILE', details: `Scan removed from DO #${doRecord.orderNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error removing delivery order scan key:', error);
      res.status(500).json({ error: 'Failed to remove file' });
    }
  });
}
