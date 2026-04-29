import type { Express } from "express";
import { businessStorage } from "../../businessStorage";
import { requireAuth, type AuthenticatedRequest } from "../../middleware";

export function registerPurchaseOrderListRoutes(app: Express) {
  app.get('/api/purchase-orders', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const { page, pageSize, search, status, supplierId, dateFrom, dateTo, excludeYears, paymentStatus } = req.query as Record<string, string>;
      const result = await businessStorage.getPurchaseOrders({
        page: page ? parseInt(page) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
        search: search || undefined,
        status: status || undefined,
        supplierId: supplierId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        excludeYears: excludeYears || undefined,
        paymentStatus: paymentStatus || undefined,
      });
      res.json(result);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      res.status(500).json({ error: 'Failed to fetch purchase orders' });
    }
  });

  app.get('/api/purchase-orders/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextPoNumber();
      res.json({ nextNumber });
    } catch (error) {
      console.error('Error getting next PO number:', error);
      res.status(500).json({ error: 'Failed to get next PO number' });
    }
  });
}
