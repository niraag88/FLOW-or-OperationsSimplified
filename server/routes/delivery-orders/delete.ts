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

      const NOT_FOUND = '__do_not_found__';
      const DELIVERED = '__do_delivered__';
      const ALREADY_CANCELLED = '__do_already_cancelled__';
      type DelErr = Error & { sentinel?: string };

      let orderNumberForAudit = '';
      try {
        await db.transaction(async (tx) => {
          // Lock the DO row so a concurrent PATCH /cancel (which also
          // takes FOR UPDATE) can't flip status under our feet and
          // leave a delivered/cancelled doc in the recycle bin.
          const [doHeader] = await tx.select().from(deliveryOrders)
            .where(eq(deliveryOrders.id, id))
            .for('update');
          if (!doHeader) {
            throw Object.assign(new Error(NOT_FOUND), { sentinel: NOT_FOUND });
          }
          if (doHeader.status === 'delivered') {
            throw Object.assign(new Error(DELIVERED), { sentinel: DELIVERED });
          }
          if (doHeader.status === 'cancelled') {
            throw Object.assign(new Error(ALREADY_CANCELLED), { sentinel: ALREADY_CANCELLED });
          }

          const lineItems = await tx.select().from(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));

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
          orderNumberForAudit = doHeader.orderNumber;
        });
      } catch (txError) {
        const e = txError as DelErr;
        if (e?.sentinel === NOT_FOUND) {
          return res.status(404).json({ error: 'Delivery order not found' });
        }
        if (e?.sentinel === DELIVERED) {
          return res.status(400).json({ error: 'Delivered orders cannot be deleted. Use Cancel instead.' });
        }
        if (e?.sentinel === ALREADY_CANCELLED) {
          return res.status(400).json({ error: 'Cancelled orders cannot be deleted. The document is retained for audit purposes.' });
        }
        throw txError;
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'DELETE', details: `DO #${orderNumberForAudit} moved to recycle bin` });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting delivery order:', error);
      res.status(500).json({ error: 'Failed to delete delivery order' });
    }
  });
}
