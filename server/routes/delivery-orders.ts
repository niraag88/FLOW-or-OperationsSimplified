import type { Express } from "express";
import { deliveryOrders, deliveryOrderItems, customers, brands, products, recycleBin, storageObjects, stockMovements } from "@shared/schema";
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, objectStorageClient, updateProductStock, type AuthenticatedRequest } from "../middleware";

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

      const newStatus = body.status || 'draft';
      const [doRecord] = await db.insert(deliveryOrders).values({
        orderNumber: body.do_number || nextNumber,
        customerName,
        customerId: customerId || null,
        deliveryAddress: '',
        status: newStatus,
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

      const insertedItems: Array<{ productId: number | null; quantity: number }> = [];
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
            insertedItems.push({ productId: item.product_id ? parseInt(item.product_id) : null, quantity: Number(item.quantity) });
          }
        }
      }

      // Deduct stock if creating directly as delivered
      if (newStatus === 'delivered') {
        for (const item of insertedItems) {
          if (item.productId) {
            await updateProductStock(
              item.productId,
              -item.quantity,
              'sale',
              doRecord.id,
              'delivery_order',
              0,
              `Stock deducted: DO #${doRecord.orderNumber} delivered`,
              req.user!.id,
            );
          }
        }
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(doRecord.id), targetType: 'delivery_order', action: 'CREATE', details: `DO #${doRecord.orderNumber} created for ${customerName}${newStatus === 'delivered' ? ' — stock deducted' : ''}` });
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
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const body = req.body;

      // Fetch existing DO and items before any changes
      const [existingDO] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!existingDO) return res.status(404).json({ error: 'Delivery order not found' });

      const oldItems = await db.select().from(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));

      let customerName = body.customer_name || 'Unknown Customer';
      let customerId: number | undefined = undefined;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
        }
      }

      const newStatus = body.status || 'draft';

      await db.update(deliveryOrders).set({
        customerName,
        customerId: customerId || null,
        status: newStatus,
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

      const newItems: Array<{ productId: number | null; quantity: number }> = [];
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
            newItems.push({ productId: item.product_id ? parseInt(item.product_id) : null, quantity: Number(item.quantity) });
          }
        }
      }

      // Stock movement logic based on status transitions
      const becomingDelivered = newStatus === 'delivered' && existingDO.status !== 'delivered';
      const remainingDelivered = newStatus === 'delivered' && existingDO.status === 'delivered';

      if (becomingDelivered) {
        // Deduct stock for all items with a product ID
        for (const item of newItems) {
          if (item.productId) {
            await updateProductStock(
              item.productId,
              -item.quantity,
              'sale',
              id,
              'delivery_order',
              0,
              `Stock deducted: DO #${existingDO.orderNumber} delivered`,
              req.user!.id,
            );
          }
        }
      } else if (remainingDelivered) {
        // Reconcile stock: compare old vs new quantities per product
        const oldQtyMap = new Map<number, number>();
        for (const item of oldItems) {
          if (item.productId) {
            oldQtyMap.set(item.productId, (oldQtyMap.get(item.productId) || 0) + Number(item.quantity));
          }
        }
        const newQtyMap = new Map<number, number>();
        for (const item of newItems) {
          if (item.productId) {
            newQtyMap.set(item.productId, (newQtyMap.get(item.productId) || 0) + item.quantity);
          }
        }
        const allProductIds = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
        for (const productId of allProductIds) {
          const oldQty = oldQtyMap.get(productId) || 0;
          const newQty = newQtyMap.get(productId) || 0;
          const delta = oldQty - newQty; // positive = returned stock, negative = more deducted
          if (delta !== 0) {
            await updateProductStock(
              productId,
              delta,
              'adjustment',
              id,
              'delivery_order',
              0,
              `Stock adjusted: DO #${existingDO.orderNumber} edited while delivered`,
              req.user!.id,
            );
          }
        }
      }

      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'UPDATE', details: `DO #${updated.orderNumber} updated (status: ${updated.status})${becomingDelivered ? ' — stock deducted' : ''}` });
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

  app.patch('/api/delivery-orders/:id/cancel', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const [doRecord] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!doRecord) return res.status(404).json({ error: 'Delivery order not found' });

      if (doRecord.status === 'cancelled') {
        return res.status(400).json({ error: 'Delivery order is already cancelled' });
      }
      if (doRecord.status === 'draft') {
        return res.status(400).json({ error: 'Draft delivery orders should be deleted, not cancelled' });
      }

      // Reverse stock movements if the DO was delivered
      if (doRecord.status === 'delivered') {
        const doMovements = await db.select().from(stockMovements)
          .where(and(
            eq(stockMovements.referenceType, 'delivery_order'),
            eq(stockMovements.referenceId, id),
          ));

        for (const movement of doMovements) {
          await updateProductStock(
            movement.productId,
            -movement.quantity,
            'adjustment',
            id,
            'delivery_order_cancel',
            0,
            `Stock reversed: DO #${doRecord.orderNumber} cancelled`,
            req.user!.id,
          );
        }
      }

      await db.update(deliveryOrders).set({ status: 'cancelled' }).where(eq(deliveryOrders.id, id));
      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));

      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(id),
        targetType: 'delivery_order',
        action: 'UPDATE',
        details: `DO #${doRecord.orderNumber} cancelled${doRecord.status === 'delivered' ? ' — stock reversed' : ''}`,
      });

      res.json({ ...updated, do_number: updated.orderNumber });
    } catch (error) {
      console.error('Error cancelling delivery order:', error);
      res.status(500).json({ error: 'Failed to cancel delivery order' });
    }
  });

  app.patch('/api/delivery-orders/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
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
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
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
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const userEmail = req.user?.email || req.user?.username || 'unknown';

      const [doHeader] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!doHeader) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }

      // Delivered DOs must be cancelled first, not deleted directly
      if (doHeader.status === 'delivered') {
        return res.status(400).json({ error: 'Delivered orders cannot be deleted. Use Cancel instead.' });
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
