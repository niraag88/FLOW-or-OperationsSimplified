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
      const NOT_FOUND = '__po_status_not_found__';
      const BAD_TRANSITION = '__po_status_bad_transition__';
      type StatusErr = Error & { sentinel?: string; fromStatus?: string };

      let updated: typeof purchaseOrders.$inferSelect | undefined;
      let fromStatus = '';
      try {
        await db.transaction(async (tx) => {
          // Lock the PO row so two simultaneous toggles can't both
          // pass validation against the same starting state and
          // produce contradictory audit entries.
          const [existing] = await tx.select({ id: purchaseOrders.id, status: purchaseOrders.status, poNumber: purchaseOrders.poNumber })
            .from(purchaseOrders)
            .where(eq(purchaseOrders.id, id))
            .for('update');
          if (!existing) {
            throw Object.assign(new Error(NOT_FOUND), { sentinel: NOT_FOUND });
          }
          const validTransitions: Record<string, string> = { closed: 'submitted', submitted: 'closed' };
          if (validTransitions[existing.status] !== status) {
            throw Object.assign(new Error(BAD_TRANSITION), { sentinel: BAD_TRANSITION, fromStatus: existing.status });
          }
          [updated] = await tx.update(purchaseOrders)
            .set({ status, updatedAt: new Date() })
            .where(eq(purchaseOrders.id, id))
            .returning();
          fromStatus = existing.status;
        });
      } catch (txError) {
        const e = txError as StatusErr;
        if (e?.sentinel === NOT_FOUND) {
          return res.status(404).json({ error: 'Purchase order not found' });
        }
        if (e?.sentinel === BAD_TRANSITION) {
          // 409: the target state is invalid given the current state.
          // Covers both manual misuse and the race-loser case where
          // a concurrent toggle flipped the from-state under us.
          return res.status(409).json({ error: `Cannot transition from '${e.fromStatus}' to '${status}'` });
        }
        throw txError;
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'purchase_order', action: 'UPDATE', details: `PO #${updated!.poNumber} status changed from ${fromStatus} to ${status}` });
      res.json(updated);
    } catch (error) {
      logger.error('Error updating PO status:', error);
      res.status(500).json({ error: 'Failed to update purchase order status' });
    }
  });
}
