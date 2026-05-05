import type { Express } from "express";
import { purchaseOrders, purchaseOrderItems, goodsReceipts, recycleBin } from "@shared/schema";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../../middleware";
import { logger } from "../../logger";

export function registerPurchaseOrderDeleteRoutes(app: Express) {
  app.delete('/api/purchase-orders/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const poId = parseInt(req.params.id);
      const userEmail = req.user?.email || req.user?.username || 'unknown';

      const NOT_FOUND = '__po_not_found__';
      const ALREADY_CANCELLED = '__po_already_cancelled__';
      const HAS_GRNS = '__po_has_grns__';
      type DeleteErr = Error & { sentinel?: string; grnCount?: number; poNumber?: string };

      let poNumberForAudit = '';
      try {
        await db.transaction(async (tx) => {
          // Lock the PO row so a concurrent goods-receipt create
          // (which also takes the PO row) cannot land between our
          // GRN-count check and the DELETE.
          const [po] = await tx.select().from(purchaseOrders)
            .where(eq(purchaseOrders.id, poId))
            .for('update');
          if (!po) {
            throw Object.assign(new Error(NOT_FOUND), { sentinel: NOT_FOUND });
          }
          if (po.status === 'cancelled') {
            throw Object.assign(new Error(ALREADY_CANCELLED), { sentinel: ALREADY_CANCELLED });
          }
          const [grnCount] = await tx.select({ count: sql<number>`count(*)::int` })
            .from(goodsReceipts)
            .where(eq(goodsReceipts.poId, poId));
          const count = grnCount?.count ?? 0;
          if (count > 0) {
            throw Object.assign(new Error(HAS_GRNS), { sentinel: HAS_GRNS, grnCount: count, poNumber: po.poNumber });
          }

          const items = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));

          await tx.insert(recycleBin).values({
            documentType: 'PurchaseOrder',
            documentId: poId.toString(),
            documentNumber: po.poNumber,
            documentData: JSON.stringify({ header: po, items }),
            deletedBy: userEmail,
            originalStatus: po.status,
            canRestore: true,
          });
          await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
          await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, poId));
          poNumberForAudit = po.poNumber;
        });
      } catch (txError) {
        const e = txError as DeleteErr;
        if (e?.sentinel === NOT_FOUND) {
          return res.status(404).json({ error: 'Purchase order not found' });
        }
        if (e?.sentinel === ALREADY_CANCELLED) {
          return res.status(400).json({ error: 'Cancelled purchase orders cannot be deleted. The document is retained for audit purposes.' });
        }
        if (e?.sentinel === HAS_GRNS) {
          return res.status(409).json({ error: `Cannot delete PO #${e.poNumber} — it has ${e.grnCount} linked goods receipt(s) which are retained for audit. The PO must remain to preserve the GRN history.` });
        }
        throw txError;
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(poId), targetType: 'purchase_order', action: 'DELETE', details: `PO #${poNumberForAudit} deleted` });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting purchase order:', error);
      res.status(500).json({ error: 'Failed to delete purchase order' });
    }
  });
}
