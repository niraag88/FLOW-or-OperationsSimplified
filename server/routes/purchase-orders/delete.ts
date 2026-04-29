import type { Express } from "express";
import { purchaseOrders, purchaseOrderItems, goodsReceipts, recycleBin } from "@shared/schema";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../../middleware";

export function registerPurchaseOrderDeleteRoutes(app: Express) {
  app.delete('/api/purchase-orders/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const poId = parseInt(req.params.id);
      const userEmail = req.user?.email || req.user?.username || 'unknown';

      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
      if (!po) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }
      if (po.status === 'cancelled') {
        return res.status(400).json({ error: 'Cancelled purchase orders cannot be deleted. The document is retained for audit purposes.' });
      }
      const [grnCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(goodsReceipts)
        .where(eq(goodsReceipts.poId, poId));
      if ((grnCount?.count ?? 0) > 0) {
        return res.status(400).json({ error: `Cannot delete PO #${po.poNumber} — it has ${grnCount.count} linked goods receipt(s) which are retained for audit. The PO must remain to preserve the GRN history.` });
      }

      const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));

      await db.transaction(async (tx) => {
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
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(poId), targetType: 'purchase_order', action: 'DELETE', details: `PO #${po.poNumber} deleted` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      res.status(500).json({ error: 'Failed to delete purchase order' });
    }
  });
}
