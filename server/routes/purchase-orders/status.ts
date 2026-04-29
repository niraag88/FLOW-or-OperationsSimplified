import type { Express } from "express";
import { purchaseOrders } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../../middleware";
import { logger } from "../../logger";

export function registerPurchaseOrderStatusRoutes(app: Express) {
  app.patch('/api/purchase-orders/:id/status', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const { status } = req.body;
      if (!['submitted', 'closed'].includes(status)) {
        return res.status(400).json({ error: 'Status must be submitted or closed' });
      }
      const [existing] = await db.select({ id: purchaseOrders.id, status: purchaseOrders.status, poNumber: purchaseOrders.poNumber })
        .from(purchaseOrders).where(eq(purchaseOrders.id, id));
      if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
      const validTransitions: Record<string, string> = { closed: 'submitted', submitted: 'closed' };
      if (validTransitions[existing.status] !== status) {
        return res.status(400).json({ error: `Cannot transition from '${existing.status}' to '${status}'` });
      }
      const [updated] = await db.update(purchaseOrders)
        .set({ status, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id))
        .returning();
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'purchase_order', action: 'UPDATE', details: `PO #${updated.poNumber} status changed from ${existing.status} to ${status}` });
      res.json(updated);
    } catch (error) {
      logger.error('Error updating PO status:', error);
      res.status(500).json({ error: 'Failed to update purchase order status' });
    }
  });
}
