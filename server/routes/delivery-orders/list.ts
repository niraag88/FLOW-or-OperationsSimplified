import type { Express } from "express";
import { deliveryOrders, deliveryOrderItems, customers, brands, products } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../../businessStorage";
import { requireAuth, type AuthenticatedRequest } from "../../middleware";
import { logger } from "../../logger";

export function registerDeliveryOrderListRoutes(app: Express) {
  app.get('/api/delivery-orders', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { page, pageSize, search, status, customerId, dateFrom, dateTo, taxTreatment, excludeYears } = req.query as Record<string, string>;
      const result = await businessStorage.getDeliveryOrders({
        page: page ? parseInt(page) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
        search: search || undefined,
        status: status || undefined,
        customerId: customerId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        taxTreatment: taxTreatment || undefined,
        excludeYears: excludeYears || undefined,
      });
      const mapDO = (d: any) => ({
        ...d,
        do_number: d.do_number || d.orderNumber,
        customer_name: d.customer_name || d.customerName,
        order_date: d.order_date || d.orderDate,
        tax_amount: d.tax_amount ?? d.taxAmount,
        total_amount: d.total_amount ?? d.totalAmount,
      });
      if (Array.isArray(result)) {
        res.json(result.map(mapDO));
      } else {
        res.json({ data: (result as any).data.map(mapDO), total: (result as any).total });
      }
    } catch (error) {
      logger.error('Error fetching delivery orders:', error);
      res.status(500).json({ error: 'Failed to fetch delivery orders' });
    }
  });

  app.get('/api/delivery-orders/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextDoNumber();
      res.json({ nextNumber });
    } catch (error) {
      logger.error('Error getting next delivery order number:', error);
      res.status(500).json({ error: 'Failed to get next delivery order number' });
    }
  });

  app.get('/api/delivery-orders/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const [doRecord] = await db.select({
        id: deliveryOrders.id,
        orderNumber: deliveryOrders.orderNumber,
        customerId: deliveryOrders.customerId,
        customerName: deliveryOrders.customerName,
        showRemarks: deliveryOrders.showRemarks,
        orderDate: deliveryOrders.orderDate,
        reference: deliveryOrders.reference,
        referenceDate: deliveryOrders.referenceDate,
        subtotal: deliveryOrders.subtotal,
        taxAmount: deliveryOrders.taxAmount,
        totalAmount: deliveryOrders.totalAmount,
        currency: deliveryOrders.currency,
        notes: deliveryOrders.notes,
        taxRate: deliveryOrders.taxRate,
        taxTreatment: deliveryOrders.taxTreatment,
        status: deliveryOrders.status,
        companySnapshot: deliveryOrders.companySnapshot,
        scanKey: deliveryOrders.scanKey,
        customerVatTreatment: customers.vatTreatment,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerBillingAddress: customers.billingAddress,
        customerContactPerson: customers.contactPerson,
        customerVatNumber: customers.vatNumber,
      }).from(deliveryOrders)
        .leftJoin(customers, eq(customers.id, deliveryOrders.customerId))
        .where(eq(deliveryOrders.id, id));

      if (!doRecord) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }

      const lineItems = await db.select({
        id: deliveryOrderItems.id,
        productId: deliveryOrderItems.productId,
        brandId: deliveryOrderItems.brandId,
        brandName: brands.name,
        productCode: deliveryOrderItems.productCode,
        description: deliveryOrderItems.description,
        productName: products.name,
        productSku: products.sku,
        productSize: products.size,
        quantity: deliveryOrderItems.quantity,
        unitPrice: deliveryOrderItems.unitPrice,
        lineTotal: deliveryOrderItems.lineTotal,
      }).from(deliveryOrderItems)
        .leftJoin(products, eq(products.id, deliveryOrderItems.productId))
        .leftJoin(brands, eq(brands.id, deliveryOrderItems.brandId))
        .where(eq(deliveryOrderItems.doId, id));

      const taxAmt = parseFloat(doRecord.taxAmount || '0');
      const taxRt = doRecord.taxRate ? parseFloat(doRecord.taxRate) : 0.05;
      const doSubtotal = parseFloat(doRecord.subtotal || '0');
      const doTotal = parseFloat(doRecord.totalAmount || '0');
      res.json({
        id: doRecord.id,
        do_number: doRecord.orderNumber,
        customer_id: doRecord.customerId,
        customer_name: doRecord.customerName,
        order_date: doRecord.orderDate ? String(doRecord.orderDate).split('T')[0] : '',
        reference: doRecord.reference || '',
        reference_date: doRecord.referenceDate ? String(doRecord.referenceDate).split('T')[0] : '',
        subtotal: doSubtotal,
        tax_amount: taxAmt,
        total_amount: doTotal,
        currency: doRecord.currency || 'AED',
        remarks: doRecord.notes || '',
        show_remarks: doRecord.showRemarks || false,
        tax_rate: taxRt,
        tax_treatment: doRecord.taxTreatment || 'ZeroRated',
        status: doRecord.status,
        company_snapshot: doRecord.companySnapshot || null,
        scan_key: doRecord.scanKey || null,
        customer: {
          name: doRecord.customerName,
          email: doRecord.customerEmail || null,
          phone: doRecord.customerPhone || null,
          address: doRecord.customerBillingAddress || null,
          contact_name: doRecord.customerContactPerson || null,
          trn_number: doRecord.customerVatNumber || null,
        },
        items: lineItems.map(item => ({
          id: item.id,
          product_id: item.productId,
          product_name: item.productName || item.description,
          product_code: item.productCode || item.productSku || '',
          description: item.description || item.productName || '',
          size: item.productSize || '',
          brand_id: item.brandId,
          brand_name: item.brandName || '',
          quantity: Number(item.quantity),
          unit_price: parseFloat(item.unitPrice) || 0,
          line_total: parseFloat(item.lineTotal) || 0,
        }))
      });
    } catch (error) {
      logger.error('Error fetching delivery order:', error);
      res.status(500).json({ error: 'Failed to fetch delivery order' });
    }
  });
}
