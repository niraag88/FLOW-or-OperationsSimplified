import type { Express } from "express";
import { products, brands, stockMovements } from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, type AuthenticatedRequest } from "../middleware";

export function registerInventoryRoutes(app: Express) {
  app.get('/api/dashboard', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const dashboardData = await businessStorage.getDashboardData();
      res.json(dashboardData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  app.get('/api/dashboard/stats', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const stats = await businessStorage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
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
      console.error('Error fetching stock movements:', error);
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
      console.error('Error fetching stock movements:', error);
      res.status(500).json({ error: 'Failed to fetch stock movements' });
    }
  });

  app.post('/api/stock-movements/bulk', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { movements } = req.body;

      if (!movements || !Array.isArray(movements)) {
        return res.status(400).json({ error: 'Movements array is required' });
      }

      const results: any[] = [];

      for (const movement of movements) {
        const { productId, quantity, movementType, notes } = movement;

        if (!productId || !quantity || quantity <= 0) {
          continue;
        }

        const [product] = await db.select().from(products)
          .where(eq(products.id, productId))
          .limit(1);

        if (!product) {
          continue;
        }

        const previousStock = product.stockQuantity || 0;
        const newStock = previousStock + quantity;

        const [stockMovement] = await db.insert(stockMovements).values({
          productId,
          movementType: movementType || 'adjustment',
          quantity,
          previousStock,
          newStock,
          unitCost: product.costPrice || '0.00',
          notes: notes || 'Initial stock entry',
          createdBy: req.user!.id
        }).returning();

        await db.update(products)
          .set({
            stockQuantity: newStock,
            updatedAt: new Date()
          })
          .where(eq(products.id, productId));

        results.push(stockMovement);
      }

      res.json({
        success: true,
        created: results.length,
        movements: results
      });
    } catch (error) {
      console.error('Error creating bulk stock movements:', error);
      res.status(500).json({ error: 'Failed to create stock movements' });
    }
  });
}
