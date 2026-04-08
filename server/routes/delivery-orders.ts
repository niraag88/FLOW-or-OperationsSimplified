import type { Express } from "express";
import { deliveryOrders, deliveryOrderItems, customers, brands, products, recycleBin, storageObjects } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, objectStorageClient, type AuthenticatedRequest } from "../middleware";

export function registerDeliveryOrderRoutes(app: Express) {
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
      console.error('Error fetching delivery orders:', error);
      res.status(500).json({ error: 'Failed to fetch delivery orders' });
    }
  });

  app.get('/api/delivery-orders/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextDoNumber();
      res.json({ nextNumber });
    } catch (error) {
      console.error('Error getting next delivery order number:', error);
      res.status(500).json({ error: 'Failed to get next delivery order number' });
    }
  });

  app.get('/api/delivery-orders/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
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
        status: deliveryOrders.status,
        companySnapshot: deliveryOrders.companySnapshot,
        customerVatTreatment: customers.vatTreatment,
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
        tax_treatment: (() => {
          if (taxAmt > 0) return 'StandardRated';
          const localTreatments = ['Local', 'standard', 'Standard', 'local'];
          return localTreatments.includes(doRecord.customerVatTreatment || '') ? 'StandardRated' : 'ZeroRated';
        })(),
        status: doRecord.status,
        company_snapshot: doRecord.companySnapshot || null,
        attachments: [],
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
      console.error('Error fetching delivery order:', error);
      res.status(500).json({ error: 'Failed to fetch delivery order' });
    }
  });

  app.post('/api/delivery-orders', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { companySettings } = await import('@shared/schema');
      const [nextNumber, doSettingsRow] = await Promise.all([
        businessStorage.generateDoNumber(),
        db.select().from(companySettings).limit(1),
      ]);
      const body = req.body;
      const doCompanySnapshot = doSettingsRow[0] ? {
        companyName: doSettingsRow[0].companyName,
        address: doSettingsRow[0].address,
        phone: doSettingsRow[0].phone,
        email: doSettingsRow[0].email,
        vatNumber: doSettingsRow[0].vatNumber,
        taxNumber: doSettingsRow[0].taxNumber,
        logo: doSettingsRow[0].logo,
      } : null;

      let customerName = body.customer_name || 'Unknown Customer';
      let customerId: number | undefined = undefined;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
        }
      }

      const [doRecord] = await db.insert(deliveryOrders).values({
        orderNumber: body.do_number || nextNumber,
        customerName,
        customerId: customerId || null,
        deliveryAddress: '',
        status: body.status || 'draft',
        orderDate: body.order_date || null,
        reference: body.reference || null,
        referenceDate: body.reference_date || null,
        subtotal: body.subtotal ? body.subtotal.toString() : '0',
        taxAmount: body.tax_amount ? body.tax_amount.toString() : '0',
        totalAmount: body.total_amount ? body.total_amount.toString() : '0',
        currency: body.currency || 'AED',
        notes: body.remarks || body.notes || null,
        taxRate: body.tax_rate ? body.tax_rate.toString() : '0.05',
        showRemarks: body.show_remarks || false,
        companySnapshot: doCompanySnapshot,
      }).returning();

      if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        for (const item of body.items) {
          if (Number(item.quantity) > 0 && Number(item.unit_price) >= 0) {
            await db.insert(deliveryOrderItems).values({
              doId: doRecord.id,
              productId: item.product_id ? parseInt(item.product_id) : null,
              brandId: item.brand_id ? parseInt(item.brand_id) : null,
              productCode: item.product_code || null,
              description: item.description || item.product_name || '',
              quantity: Number(item.quantity),
              unitPrice: item.unit_price.toString(),
              lineTotal: item.line_total.toString(),
            });
          }
        }
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(doRecord.id), targetType: 'delivery_order', action: 'CREATE', details: `DO #${doRecord.orderNumber} created for ${customerName}` });
      res.status(201).json({ ...doRecord, do_number: doRecord.orderNumber, items: body.items || [] });
    } catch (error) {
      console.error('Error creating delivery order:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create delivery order' });
      }
    }
  });

  app.put('/api/delivery-orders/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const body = req.body;

      let customerName = body.customer_name || 'Unknown Customer';
      let customerId: number | undefined = undefined;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
        }
      }

      await db.update(deliveryOrders).set({
        customerName,
        customerId: customerId || null,
        status: body.status || 'draft',
        orderDate: body.order_date || null,
        reference: body.reference || null,
        referenceDate: body.reference_date || null,
        subtotal: body.subtotal ? body.subtotal.toString() : '0',
        taxAmount: body.tax_amount ? body.tax_amount.toString() : '0',
        totalAmount: body.total_amount ? body.total_amount.toString() : '0',
        currency: body.currency || 'AED',
        notes: body.remarks || body.notes || null,
        taxRate: body.tax_rate ? body.tax_rate.toString() : '0.05',
        showRemarks: body.show_remarks || false,
      }).where(eq(deliveryOrders.id, id));

      await db.delete(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));
      if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        for (const item of body.items) {
          if (Number(item.quantity) > 0 && Number(item.unit_price) >= 0) {
            await db.insert(deliveryOrderItems).values({
              doId: id,
              productId: item.product_id ? parseInt(item.product_id) : null,
              brandId: item.brand_id ? parseInt(item.brand_id) : null,
              productCode: item.product_code || null,
              description: item.description || item.product_name || '',
              quantity: Number(item.quantity),
              unitPrice: item.unit_price.toString(),
              lineTotal: item.line_total.toString(),
            });
          }
        }
      }

      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'UPDATE', details: `DO #${updated.orderNumber} updated (status: ${updated.status})` });
      res.json({ ...updated, do_number: updated.orderNumber, items: body.items || [] });
    } catch (error) {
      console.error('Error updating delivery order:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update delivery order' });
      }
    }
  });

  app.patch('/api/delivery-orders/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const { scanKey } = req.body;
      if (!scanKey || typeof scanKey !== 'string') {
        return res.status(400).json({ error: 'scanKey is required' });
      }
      await db.update(deliveryOrders).set({ scanKey }).where(eq(deliveryOrders.id, id));
      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'UPLOAD', details: `Scan attached to DO #${updated.orderNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error updating delivery order scan key:', error);
      res.status(500).json({ error: 'Failed to update scan key' });
    }
  });

  app.delete('/api/delivery-orders/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const [doRecord] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!doRecord) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }
      if (doRecord.scanKey) {
        try {
          await objectStorageClient.delete(doRecord.scanKey);
          await db.delete(storageObjects).where(eq(storageObjects.key, doRecord.scanKey));
        } catch (storageErr) {
          console.warn('Could not delete object from storage (clearing key anyway):', storageErr);
        }
      }
      await db.update(deliveryOrders).set({ scanKey: null }).where(eq(deliveryOrders.id, id));
      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'REMOVE_FILE', details: `Scan removed from DO #${doRecord.orderNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error removing delivery order scan key:', error);
      res.status(500).json({ error: 'Failed to remove file' });
    }
  });

  app.delete('/api/delivery-orders/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userEmail = req.user?.email || req.user?.username || 'unknown';

      const [doHeader] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!doHeader) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }
      const lineItems = await db.select().from(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));

      await db.transaction(async (tx) => {
        await tx.insert(recycleBin).values({
          documentType: 'DeliveryOrder',
          documentId: id.toString(),
          documentNumber: doHeader.orderNumber,
          documentData: JSON.stringify({ header: doHeader, items: lineItems }),
          deletedBy: userEmail,
          originalStatus: doHeader.status,
          canRestore: true,
        });
        await tx.delete(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));
        await tx.delete(deliveryOrders).where(eq(deliveryOrders.id, id));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'DELETE', details: `DO #${doHeader.orderNumber} moved to recycle bin` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting delivery order:', error);
      res.status(500).json({ error: 'Failed to delete delivery order' });
    }
  });
}
