import type { Express } from "express";
import { goodsReceipts } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../../middleware";
import { logger } from "../../logger";

export function registerGoodsReceiptDeleteRoutes(app: Express) {
  // DELETE /api/goods-receipts/:id
  // Goods Receipts are append-only for audit purposes. Confirmed receipts must
  // be cancelled first via PATCH /api/goods-receipts/:id/cancel (which posts
  // reversal stock movements while keeping the original receipt history),
  // and cancelled receipts are then retained permanently — same policy as
  // cancelled invoices and cancelled delivery orders.
  // Responses:
  //   404 { error: 'Goods receipt not found' }
  //   400 { error: 'grn_not_cancelled', message }     // confirmed → cancel first
  //   400 { error: 'grn_retained_for_audit', message } // cancelled → never delete
  app.delete('/api/goods-receipts/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const grnId = parseInt(req.params.id);
      if (isNaN(grnId)) return res.status(400).json({ error: 'Invalid ID' });
      const [grn] = await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, grnId));
      if (!grn) return res.status(404).json({ error: 'Goods receipt not found' });

      if (grn.status === 'cancelled') {
        return res.status(400).json({
          error: 'grn_retained_for_audit',
          message: 'Cancelled goods receipts are retained for audit and cannot be permanently deleted.',
        });
      }

      return res.status(400).json({
        error: 'grn_not_cancelled',
        message: 'Confirmed goods receipts cannot be deleted — cancel the GRN first to reverse stock. The cancelled receipt will be retained for audit.',
      });
    } catch (error) {
      logger.error('Error deleting goods receipt:', error);
      res.status(500).json({ error: 'Failed to delete goods receipt' });
    }
  });
}
