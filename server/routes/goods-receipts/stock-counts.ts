import type { Express } from "express";
import { stockCounts, stockCountItems, stockMovements, products } from "@shared/schema";
import { db } from "../../db";
import { eq, desc, inArray, and } from "drizzle-orm";
import { requireAuth, writeAuditLog, updateProductStock, type AuthenticatedRequest } from "../../middleware";

export function registerStockCountRoutes(app: Express) {
  app.get('/api/stock-counts', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const stockCountsList = await db.select({
        id: stockCounts.id,
        countDate: stockCounts.countDate,
        totalProducts: stockCounts.totalProducts,
        totalQuantity: stockCounts.totalQuantity,
        createdBy: stockCounts.createdBy,
        createdAt: stockCounts.createdAt
      }).from(stockCounts).orderBy(desc(stockCounts.createdAt)).limit(100);

      res.json(stockCountsList);
    } catch (error) {
      console.error('Error fetching stock counts:', error);
      res.status(500).json({ error: 'Failed to fetch stock counts' });
    }
  });

  app.get('/api/stock-counts/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const stockCountId = parseInt(req.params.id);
      if (isNaN(stockCountId)) return res.status(400).json({ error: 'Invalid ID' });

      const [stockCount] = await db.select().from(stockCounts).where(eq(stockCounts.id, stockCountId));
      if (!stockCount) {
        return res.status(404).json({ error: 'Stock count not found' });
      }

      const items = await db.select().from(stockCountItems).where(eq(stockCountItems.stockCountId, stockCountId));

      res.json({ ...stockCount, items });
    } catch (error) {
      console.error('Error fetching stock count:', error);
      res.status(500).json({ error: 'Failed to fetch stock count' });
    }
  });

  app.post('/api/stock-counts', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { items } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items array is required and cannot be empty' });
      }

      const validItems = items.filter(item => parseInt(item.quantity) >= 0 && item.product_id);
      if (validItems.length === 0) {
        return res.status(400).json({ error: 'At least one item with a valid product is required' });
      }

      const totalProducts = validItems.length;
      const totalQuantity = validItems.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);

      let stockCount: typeof stockCounts.$inferSelect;
      let correctionsApplied = 0;

      await db.transaction(async (tx) => {
        const [sc] = await tx.insert(stockCounts).values({
          countDate: new Date(),
          totalProducts,
          totalQuantity,
          createdBy: req.user!.id
        }).returning();
        stockCount = sc;

        const stockCountItemsData = validItems.map(item => ({
          stockCountId: sc.id,
          productId: item.product_id,
          productCode: item.product_code,
          brandName: item.brand_name || '',
          productName: item.product_name,
          size: item.size || '',
          quantity: parseInt(item.quantity) || 0
        }));

        await tx.insert(stockCountItems).values(stockCountItemsData);

        const productIds: number[] = validItems
          .filter(i => i.product_id)
          .map(i => parseInt(i.product_id));

        if (productIds.length > 0) {
          const currentStocks = await tx
            .select({ id: products.id, stockQuantity: products.stockQuantity })
            .from(products)
            .where(inArray(products.id, productIds));

          const stockMap = new Map(currentStocks.map(p => [p.id, p.stockQuantity ?? 0]));

          for (const item of validItems) {
            const pid = parseInt(item.product_id);
            const counted = parseInt(item.quantity) || 0;
            const current = Number(stockMap.get(pid) ?? 0);
            const delta = counted - current;
            if (delta !== 0) {
              await updateProductStock(
                pid,
                delta,
                'adjustment',
                sc.id,
                'stock_count',
                0,
                `Stock count correction: counted ${counted}, was ${current}`,
                req.user!.id,
                tx
              );
              correctionsApplied++;
            }
          }
        }
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(stockCount!.id), targetType: 'stock_count', action: 'CREATE', details: `Stock count created: ${totalProducts} products, ${totalQuantity} total qty, ${correctionsApplied} corrections applied` });
      res.status(201).json({
        id: stockCount!.id,
        message: `Stock count saved. ${correctionsApplied} product${correctionsApplied !== 1 ? 's' : ''} adjusted to match physical count.`
      });
    } catch (error) {
      console.error('Error creating stock count:', error);
      res.status(500).json({ error: 'Failed to create stock count' });
    }
  });

  app.delete('/api/stock-counts/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const stockCountId = parseInt(req.params.id);
      if (isNaN(stockCountId)) return res.status(400).json({ error: 'Invalid ID' });

      // Task #364 (RF-6): a confirmed stock count writes adjustment rows
      // into stock_movements (referenceType='stock_count', referenceId=
      // this id). Hard-deleting the count would orphan those movements
      // — the audit trail would point at a count document that no
      // longer exists. Only counts that produced no movements (e.g. a
      // count where every item matched current stock, or one created
      // and never confirmed) can still be removed today; anything that
      // touched stock is retained for audit. No void/reversal flow
      // exists yet, so the only path forward is to refuse the delete.
      const [linkedMovement] = await db
        .select({ id: stockMovements.id })
        .from(stockMovements)
        .where(and(
          eq(stockMovements.referenceType, 'stock_count'),
          eq(stockMovements.referenceId, stockCountId),
        ))
        .limit(1);
      if (linkedMovement) {
        return res.status(400).json({ error: 'Stock counts are retained for audit and cannot be deleted. Create a new stock count to correct stock if needed.' });
      }

      await db.delete(stockCountItems).where(eq(stockCountItems.stockCountId, stockCountId));
      await db.delete(stockCounts).where(eq(stockCounts.id, stockCountId));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(stockCountId), targetType: 'stock_count', action: 'DELETE', details: `Stock count #${stockCountId} deleted` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting stock count:', error);
      res.status(500).json({ error: 'Failed to delete stock count' });
    }
  });
}
