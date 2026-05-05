import type { Express } from "express";
import { deliveryOrders, deliveryOrderItems, auditLog, products } from "@shared/schema";
import { db } from "../../db";
import { inArray } from "drizzle-orm";
import { businessStorage } from "../../businessStorage";
import { requireAuth, updateProductStock, type AuthenticatedRequest } from "../../middleware";
import { resolveDocumentTotals, isTotalsError, resolveAuthoritativeTaxTreatment } from "../../utils/totals";
import { isProductsStockNonNegativeViolation } from "../../utils/pgError";
import { logger } from "../../logger";

export function registerDeliveryOrderCreateRoutes(app: Express) {
  app.post('/api/delivery-orders', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    type Shortfall = { name: string; sku: string; requested: number; available: number };
    let shortfalls: Shortfall[] = [];
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

      // Task #404: header insert + items loop + delivered-stock deductions
      // + audit-log row are all one db.transaction so a partial failure
      // cannot leave a half-built DO behind.
      const headerPayload: typeof deliveryOrders.$inferInsert = {
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
      };

      // Sentinel for friendly negative-stock 409 (Task #414).
      const INSUFFICIENT_STOCK = '__do_insufficient_stock__';

      const doRecord = await db.transaction(async (tx) => {
        // Lock-and-validate stock BEFORE any insert when this create
        // would actually deduct stock (status === 'delivered'). The
        // user gets a clean 409 naming each shortfall product instead
        // of a generic 500 from the products_stock_quantity_non_negative_chk
        // CHECK constraint backstop.
        if (newStatus === 'delivered') {
          const reqByProduct = new Map<number, number>();
          for (const item of resolved.items) {
            if (item.product_id == null) continue;
            const pid = parseInt(String(item.product_id));
            reqByProduct.set(pid, (reqByProduct.get(pid) ?? 0) + item.quantity);
          }
          const productIds = Array.from(reqByProduct.keys());
          if (productIds.length > 0) {
            const locked = await tx
              .select({
                id: products.id,
                name: products.name,
                sku: products.sku,
                stockQuantity: products.stockQuantity,
              })
              .from(products)
              .where(inArray(products.id, productIds))
              .for('update');
            const byId = new Map(locked.map(p => [p.id, p]));
            const found: Shortfall[] = [];
            for (const [pid, requested] of reqByProduct) {
              const row = byId.get(pid);
              const available = row?.stockQuantity ?? 0;
              if (requested > available) {
                found.push({
                  name: row?.name ?? `Product #${pid}`,
                  sku: row?.sku ?? '',
                  requested,
                  available,
                });
              }
            }
            if (found.length > 0) {
              shortfalls = found;
              throw new Error(INSUFFICIENT_STOCK);
            }
          }
        }

        const [created] = await tx.insert(deliveryOrders).values(headerPayload).returning();

        const insertedItems: Array<{ productId: number | null; quantity: number }> = [];
        for (const item of resolved.items) {
          const productId = item.product_id ? parseInt(String(item.product_id)) : null;
          await tx.insert(deliveryOrderItems).values({
            doId: created.id,
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

        // Stock deduction for delivered DOs runs through the same tx so
        // a failure rolls back the header, items, AND any earlier deductions.
        if (newStatus === 'delivered') {
          for (const item of insertedItems) {
            if (item.productId) {
              await updateProductStock(
                item.productId,
                -item.quantity,
                'sale',
                created.id,
                'delivery_order',
                0,
                `Stock deducted: DO #${created.orderNumber} delivered`,
                req.user!.id,
                tx,
              );
            }
          }
        }

        // Audit row in-tx so a successful create always carries its
        // audit record and a rolled-back create leaves none.
        await tx.insert(auditLog).values({
          actor: req.user!.id,
          actorName: req.user?.username || String(req.user!.id),
          targetId: String(created.id),
          targetType: 'delivery_order',
          action: 'CREATE',
          details: `DO #${created.orderNumber} created for ${customerName}${newStatus === 'delivered' ? ' — stock deducted' : ''}`,
        });

        return created;
      });

      res.status(201).json({ ...doRecord, do_number: doRecord.orderNumber, items: body.items || [] });
    } catch (error) {
      // Friendly negative-stock 409 from the in-tx sentinel (Task #414).
      if (error instanceof Error && error.message === '__do_insufficient_stock__') {
        const lines = shortfalls.map(s =>
          `'${s.name}${s.sku ? ` (${s.sku})` : ''}' — only ${s.available} available, you tried to ship ${s.requested}.`
        );
        return res.status(409).json({
          error: 'insufficient_stock',
          message: `Not enough stock for ${lines.join(' ')}`,
          shortfalls,
        });
      }
      // Defensive backstop: rare race caught by the DB CHECK constraint.
      // Drizzle wraps pg errors as DrizzleQueryError, so walk the .cause chain.
      if (isProductsStockNonNegativeViolation(error)) {
        return res.status(409).json({
          error: 'insufficient_stock',
          message: 'Not enough stock to fulfil this delivery order. Please refresh and try again.',
        });
      }
      logger.error('Error creating delivery order:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create delivery order' });
      }
    }
  });
}
