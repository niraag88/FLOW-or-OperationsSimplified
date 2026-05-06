import type { Express } from "express";
import { products, brands, stockMovements, type InsertStockMovement } from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../middleware";
import { logger } from "../logger";

export function registerInventoryRoutes(app: Express) {
  app.get('/api/dashboard', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const dashboardData = await businessStorage.getDashboardData();
      // Task #429: strip PO/GRN datasets from Staff dashboard responses so
      // the data isn't exposed to a role that can't act on it. Suppliers
      // are PO-adjacent context and aren't shown to Staff in the UI either.
      if (req.user?.role === 'Staff') {
        const { purchaseOrders: _po, goodsReceipts: _gr, suppliers: _sup, ...rest } = dashboardData as Record<string, unknown>;
        return res.json({ ...rest, purchaseOrders: [], goodsReceipts: [], suppliers: [] });
      }
      res.json(dashboardData);
    } catch (error) {
      logger.error('Error fetching dashboard data:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  app.get('/api/dashboard/stats', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const stats = await businessStorage.getDashboardStats();
      if (req.user?.role === 'Staff') {
        const { purchaseOrders: _po, ...rest } = stats as Record<string, unknown>;
        return res.json({ ...rest, purchaseOrders: 0 });
      }
      res.json(stats);
    } catch (error) {
      logger.error('Error fetching dashboard stats:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
  });

  app.get('/api/products/:id/stock-movements', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const productId = parseInt(req.params.id);

      const movements = await db.select().from(stockMovements)
        .where(eq(stockMovements.productId, productId))
        .orderBy(desc(stockMovements.createdAt));

      res.json(movements);
    } catch (error) {
      logger.error('Error fetching stock movements:', error);
      res.status(500).json({ error: 'Failed to fetch stock movements' });
    }
  });

  app.get('/api/stock-movements', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const movements = await db.select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        productName: products.name,
        productSku: products.sku,
        brandName: brands.name,
        movementType: stockMovements.movementType,
        referenceId: stockMovements.referenceId,
        referenceType: stockMovements.referenceType,
        quantity: stockMovements.quantity,
        previousStock: stockMovements.previousStock,
        newStock: stockMovements.newStock,
        unitCost: stockMovements.unitCost,
        notes: stockMovements.notes,
        createdAt: stockMovements.createdAt
      })
        .from(stockMovements)
        .leftJoin(products, eq(stockMovements.productId, products.id))
        .leftJoin(brands, eq(products.brandId, brands.id))
        .orderBy(desc(stockMovements.createdAt))
        .limit(500);

      res.json(movements);
    } catch (error) {
      logger.error('Error fetching stock movements:', error);
      res.status(500).json({ error: 'Failed to fetch stock movements' });
    }
  });

  app.post('/api/stock-movements/bulk', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const { movements } = req.body;

      if (!movements || !Array.isArray(movements)) {
        return res.status(400).json({ error: 'Movements array is required' });
      }

      // Single transaction for the whole batch: each per-product
      // SELECT ... FOR UPDATE serialises against any concurrent
      // stock-mutating route, so previousStock/newStock recorded
      // on stock_movements always reflect what actually landed.
      const audits: Array<{ productId: number; productName: string; productSku: string; quantityChange: number; previousStock: number; newStock: number }> = [];
      const results = await db.transaction(async (tx) => {
        const created: typeof stockMovements.$inferSelect[] = [];

        for (const movement of movements) {
          const { productId, quantity, movementType, notes } = movement;

          if (!productId || !quantity || quantity <= 0) {
            continue;
          }

          const [product] = await tx.select().from(products)
            .where(eq(products.id, productId))
            .for('update')
            .limit(1);

          if (!product) {
            continue;
          }

          const previousStock = product.stockQuantity || 0;
          const quantityChange = movementType === 'out' ? -quantity : quantity;
          const newStock = previousStock + quantityChange;

          const insertValues: InsertStockMovement = {
            productId,
            movementType: movementType || 'adjustment',
            quantity,
            previousStock,
            newStock,
            unitCost: product.costPrice || '0.00',
            notes: notes || 'Initial stock entry',
            createdBy: req.user!.id,
          };

          const [stockMovement] = await tx.insert(stockMovements).values(insertValues).returning();

          await tx.update(products)
            .set({
              stockQuantity: newStock,
              updatedAt: new Date(),
            })
            .where(eq(products.id, productId));

          created.push(stockMovement);
          audits.push({
            productId,
            productName: product.name,
            productSku: product.sku,
            quantityChange,
            previousStock,
            newStock,
          });
        }

        return created;
      });

      // Emit audit rows only after the tx commits so a rolled-back
      // batch leaves no audit-log evidence of writes that didn't land.
      for (const a of audits) {
        writeAuditLog({
          actor: req.user!.id,
          actorName: req.user?.username || String(req.user!.id),
          targetId: String(a.productId),
          targetType: 'product',
          action: 'UPDATE',
          details: `Bulk stock movement for '${a.productName}' (SKU: ${a.productSku}): ${a.quantityChange >= 0 ? '+' : ''}${a.quantityChange} — ${a.previousStock} → ${a.newStock}`,
        });
      }

      res.json({
        success: true,
        created: results.length,
        movements: results
      });
    } catch (error) {
      logger.error('Error creating bulk stock movements:', error);
      res.status(500).json({ error: 'Failed to create stock movements' });
    }
  });
}
