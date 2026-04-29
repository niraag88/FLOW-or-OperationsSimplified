import type { Express } from "express";
import { deliveryOrders, deliveryOrderItems } from "@shared/schema";
import { db } from "../../db";
import { businessStorage } from "../../businessStorage";
import { requireAuth, writeAuditLog, updateProductStock, type AuthenticatedRequest } from "../../middleware";
import { resolveDocumentTotals, isTotalsError, resolveAuthoritativeTaxTreatment } from "../../utils/totals";
import { logger } from "../../logger";

export function registerDeliveryOrderCreateRoutes(app: Express) {
  app.post('/api/delivery-orders', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
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
      let customerVatTreatment: string | null = null;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
          customerVatTreatment = customer.vatTreatment ?? null;
        }
      }

      // Resolve and validate items + totals BEFORE any DB write. Server is
      // the source of truth — client subtotal / tax / total are ignored.
      const defaultVatRate = doSettingsRow[0]?.defaultVatRate
        ? parseFloat(doSettingsRow[0].defaultVatRate)
        : 0.05;
      // Customer is authoritative for VAT — a zero-rated/exempt/reverse-
      // charge/international customer always resolves to ZeroRated, even
      // if the client tries to force StandardRated.
      const requestedTreatment = resolveAuthoritativeTaxTreatment(
        body.tax_treatment,
        null,
        customerVatTreatment,
      );
      let resolved;
      try {
        resolved = resolveDocumentTotals({
          items: body.items,
          taxTreatment: requestedTreatment,
          defaultVatRate,
        });
      } catch (err) {
        if (isTotalsError(err)) {
          return res.status(400).json({ error: err.code, message: err.message });
        }
        throw err;
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
        subtotal: resolved.subtotal.toFixed(2),
        taxAmount: resolved.vatAmount.toFixed(2),
        totalAmount: resolved.totalAmount.toFixed(2),
        currency: body.currency || 'AED',
        notes: body.remarks || body.notes || null,
        taxRate: resolved.vatRate.toFixed(4),
        taxTreatment: resolved.taxTreatment,
        showRemarks: body.show_remarks || false,
        companySnapshot: doCompanySnapshot,
      }).returning();

      const insertedItems: Array<{ productId: number | null; quantity: number }> = [];
      for (const item of resolved.items) {
        const productId = item.product_id ? parseInt(String(item.product_id)) : null;
        await db.insert(deliveryOrderItems).values({
          doId: doRecord.id,
          productId,
          brandId: item.brand_id ? parseInt(String(item.brand_id)) : null,
          productCode: (item.product_code as string) || null,
          description: (item.description as string) || (item.product_name as string) || '',
          quantity: item.quantity,
          unitPrice: item.unit_price.toFixed(2),
          lineTotal: item.line_total.toFixed(2),
        });
        insertedItems.push({ productId, quantity: item.quantity });
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
      logger.error('Error creating delivery order:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create delivery order' });
      }
    }
  });
}
