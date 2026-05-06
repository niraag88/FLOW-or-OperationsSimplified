import type { Express } from "express";
import { goodsReceipts, storageObjects } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { requireAuth, writeAuditLog, deleteStorageObjectSafely, type AuthenticatedRequest } from "../../middleware";
import { logger } from "../../logger";

export function registerGoodsReceiptScanKeyRoutes(app: Express) {
  app.patch('/api/goods-receipts/:id/scan-key', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { scanKey, slot } = req.body;
      if (!scanKey || typeof scanKey !== 'string') {
        return res.status(400).json({ error: 'scanKey is required' });
      }
      const slotNum = parseInt(slot) || 1;
      if (![1, 2, 3].includes(slotNum)) {
        return res.status(400).json({ error: 'slot must be 1, 2, or 3' });
      }
      const colName = `scanKey${slotNum}` as 'scanKey1' | 'scanKey2' | 'scanKey3';
      const [updated] = await db
        .update(goodsReceipts)
        .set({ [colName]: scanKey, updatedAt: new Date() })
        .where(eq(goodsReceipts.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Goods receipt not found' });
      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(id),
        targetType: 'goods_receipt',
        action: 'UPLOAD',
        details: `Scan attached to GRN #${updated.receiptNumber} (slot ${slotNum})`,
      });
      res.json(updated);
    } catch (error) {
      logger.error('Error saving GRN scan key:', error);
      res.status(500).json({ error: 'Failed to save document' });
    }
  });

  app.delete('/api/goods-receipts/:id/scan-key/:slot', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const slotNum = parseInt(req.params.slot);
      if (isNaN(slotNum) || ![1, 2, 3].includes(slotNum)) {
        return res.status(400).json({ error: 'slot must be 1, 2, or 3' });
      }
      const colName = `scanKey${slotNum}` as 'scanKey1' | 'scanKey2' | 'scanKey3';
      const [current] = await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, id));
      if (!current) return res.status(404).json({ error: 'Goods receipt not found' });
      const existingKey = current[colName];
      if (existingKey) {
        const storageResult = await deleteStorageObjectSafely(existingKey);
        if (!storageResult.ok) {
          logger.error(
            `Failed to delete goods-receipt scan from storage: type=goods_receipt id=${id} slot=${slotNum} key=${existingKey} error=${storageResult.error}`
          );
          return res.status(502).json({ error: 'Could not delete document from storage. Please try again.' });
        }
        await db.delete(storageObjects).where(eq(storageObjects.key, existingKey));
      }
      const [updated] = await db
        .update(goodsReceipts)
        .set({ [colName]: null, updatedAt: new Date() })
        .where(eq(goodsReceipts.id, id))
        .returning();
      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(id),
        targetType: 'goods_receipt',
        action: 'REMOVE_FILE',
        details: `Scan removed from GRN #${current.receiptNumber} (slot ${slotNum})`,
      });
      res.json(updated);
    } catch (error) {
      logger.error('Error removing GRN scan key:', error);
      res.status(500).json({ error: 'Failed to remove document' });
    }
  });
}
