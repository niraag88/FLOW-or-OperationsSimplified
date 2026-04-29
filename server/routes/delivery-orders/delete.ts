import type { Express } from "express";
import { deliveryOrders, deliveryOrderItems, recycleBin } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../../middleware";
import { logger } from "../../logger";

export function registerDeliveryOrderDeleteRoutes(app: Express) {
  app.delete('/api/delivery-orders/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const userEmail = req.user?.email || req.user?.username || 'unknown';

      const [doHeader] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!doHeader) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }

      // Delivered DOs must be cancelled first, not deleted directly
      if (doHeader.status === 'delivered') {
        return res.status(400).json({ error: 'Delivered orders cannot be deleted. Use Cancel instead.' });
      }
      if (doHeader.status === 'cancelled') {
        return res.status(400).json({ error: 'Cancelled orders cannot be deleted. The document is retained for audit purposes.' });
      }

      const lineItems = await db.select().from(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));

      await db.transaction(async (tx) => {
        await tx.insert(recycleBin).values({
          documentType: 'DeliveryOrder',
          documentId: id.toString(),
          documentNumber: doHeader.orderNumber,
          documentData: JSON.stringify({ header: doHeader, items: lineItems }),
          deletedBy: userEmail,
          originalStatus: doHeader.status,
          canRestore: true,
        });
        await tx.delete(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));
        await tx.delete(deliveryOrders).where(eq(deliveryOrders.id, id));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'DELETE', details: `DO #${doHeader.orderNumber} moved to recycle bin` });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting delivery order:', error);
      res.status(500).json({ error: 'Failed to delete delivery order' });
    }
  });
}
