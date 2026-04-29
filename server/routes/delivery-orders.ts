import type { Express } from "express";
import { deliveryOrders, deliveryOrderItems, customers, brands, products, recycleBin, storageObjects, stockMovements } from "@shared/schema";
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, deleteStorageObjectSafely, updateProductStock, type AuthenticatedRequest } from "../middleware";
import { resolveDocumentTotals, isTotalsError, normalizeTaxTreatment, resolveAuthoritativeTaxTreatment } from "../utils/totals";

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
      const body = req.body ?? {};

      // Reject an explicit empty/invalid items field BEFORE any DB read or
      // write. An omitted items key is a legitimate header-only edit and
      // falls through to the existing recompute-from-stored-items path.
      // But if the caller explicitly supplies items, it must be a non-empty
      // array of objects — otherwise the saved-document contract (every
      // delivery order must have at least one valid line) is violated and
      // we would silently keep stale items. Mirrors the no_line_items
      // contract that POST already enforces via the totals resolver.
      if (typeof body === 'object' && body !== null && 'items' in body) {
        const rawItems = (body as { items?: unknown }).items;
        const isValidItemsArray =
          Array.isArray(rawItems)
          && rawItems.length > 0
          && rawItems.every((it) => it !== null && typeof it === 'object' && !Array.isArray(it));
        if (!isValidItemsArray) {
          return res.status(400).json({
            error: 'no_line_items',
            message: 'At least one valid line item is required',
          });
        }
      }

      // Fetch existing DO and items before any changes
      const [existingDO] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!existingDO) return res.status(404).json({ error: 'Delivery order not found' });

      const oldItems = await db.select().from(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));

      const bodyCustomerName: string | undefined = body.customer_name;
      let customerName = bodyCustomerName || 'Unknown Customer';
      let customerId: number | undefined = undefined;
      let customerVatTreatment: string | null = null;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
          customerVatTreatment = customer.vatTreatment ?? null;
        }
      } else if (existingDO.customerId) {
        // Body omitted customer_id — fall back to the existing DO's
        // customer so authoritative VAT resolution still applies (an
        // exempt customer must never be silently switched to VAT).
        const cust = await businessStorage.getCustomerById(existingDO.customerId);
        customerVatTreatment = cust?.vatTreatment ?? null;
      }
      // Preserve existing customer linkage on header-only edits so
      // future edits retain authoritative VAT.
      const persistCustomerId = customerId ?? existingDO.customerId ?? null;
      const persistCustomerName =
        bodyCustomerName
        ?? (customerId ? customerName : existingDO.customerName)
        ?? 'Unknown Customer';

      const newStatus = body.status || 'draft';

      // Block status downgrades from 'delivered' — use the cancel endpoint instead
      if (existingDO.status === 'delivered' && newStatus !== 'delivered') {
        return res.status(400).json({ error: 'Cannot change status of a delivered order. Use the Cancel action to cancel it.' });
      }

      // Resolve and validate items + totals BEFORE any DB write. If items
      // are not present in the body, recompute totals from the already-stored
      // items so persisted totals always match persisted lines. Validation
      // runs before delete/insert so a 400 cannot leave the DO without lines.
      const { companySettings } = await import('@shared/schema');
      const [putSettingsRow] = await db.select().from(companySettings).limit(1);
      const defaultVatRate = putSettingsRow?.defaultVatRate
        ? parseFloat(putSettingsRow.defaultVatRate)
        : 0.05;

      // Authoritative VAT resolution. Customer wins when explicitly
      // zero-rated/exempt/reverse-charge/international (no VAT can be
      // added, even if the client requested StandardRated). Otherwise
      // fall back through body > existing > customer-inferred.
      const requestedTreatment = resolveAuthoritativeTaxTreatment(
        body.tax_treatment,
        existingDO.taxTreatment,
        customerVatTreatment,
      );
      const willReplaceItems = Array.isArray(body.items) && body.items.length > 0;

      let resolvedTreatment: 'StandardRated' | 'ZeroRated' = 'StandardRated';
      let resolvedSubtotal = 0;
      let resolvedVatAmount = 0;
      let resolvedTotal = 0;
      let resolvedVatRate = 0;
      let resolvedItems: Array<{
        product_id: number | null;
        brand_id: number | null;
        product_code: string | null;
        description: string;
        quantity: number;
        unit_price: number;
        line_total: number;
      }> = [];

      if (willReplaceItems) {
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
        resolvedTreatment = resolved.taxTreatment;
        resolvedSubtotal = resolved.subtotal;
        resolvedVatAmount = resolved.vatAmount;
        resolvedTotal = resolved.totalAmount;
        resolvedVatRate = resolved.vatRate;
        resolvedItems = resolved.items.map(it => ({
          product_id: it.product_id ? parseInt(String(it.product_id)) : null,
          brand_id: it.brand_id ? parseInt(String(it.brand_id)) : null,
          product_code: (it.product_code as string) || null,
          description: (it.description as string) || (it.product_name as string) || '',
          quantity: it.quantity,
          unit_price: it.unit_price,
          line_total: it.line_total,
        }));
      }

      // Sentinels thrown from inside the transaction so we can map them to
      // the correct HTTP status outside (mirrors the cancel route's pattern).
      const NOT_FOUND = '__do_not_found__';
      const ALREADY_CANCELLED = '__do_already_cancelled__';
      const DOWNGRADE_BLOCKED = '__do_downgrade_blocked__';

      let becomingDelivered = false;

      try {
        await db.transaction(async (tx) => {
          // Lock the DO row so a concurrent PUT or cancel cannot race with
          // us. Without this, two simultaneous edits on the same delivered
          // DO could both pass the pre-write status check and both
          // reconcile stock against the same stale snapshot, double-
          // adjusting product counts.
          const [locked] = await tx.select({
            id: deliveryOrders.id,
            status: deliveryOrders.status,
          }).from(deliveryOrders).where(eq(deliveryOrders.id, id)).for('update');

          if (!locked) throw new Error(NOT_FOUND);
          if (locked.status === 'cancelled') throw new Error(ALREADY_CANCELLED);
          // Re-check the downgrade guard inside the lock — another request
          // may have transitioned this DO to 'delivered' between our
          // pre-tx read and acquiring the lock.
          if (locked.status === 'delivered' && newStatus !== 'delivered') {
            throw new Error(DOWNGRADE_BLOCKED);
          }

          // Re-read items inside the lock for a consistent snapshot. The
          // pre-tx oldItems read is no longer authoritative if another
          // request committed in between, so reconciliation and header-
          // only totals recompute must use this one.
          const lockedOldItems = await tx.select().from(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));

          if (!willReplaceItems) {
            if (lockedOldItems.length > 0) {
              const recomputeInput = lockedOldItems.map(it => ({
                product_id: it.productId,
                quantity: it.quantity,
                unit_price: parseFloat(it.unitPrice.toString()),
              }));
              const resolved = resolveDocumentTotals({
                items: recomputeInput,
                taxTreatment: requestedTreatment,
                defaultVatRate,
              });
              resolvedTreatment = resolved.taxTreatment;
              resolvedSubtotal = resolved.subtotal;
              resolvedVatAmount = resolved.vatAmount;
              resolvedTotal = resolved.totalAmount;
              resolvedVatRate = resolved.vatRate;
            } else {
              // No items to recompute against — keep zeros and run the raw
              // chain value through the same normaliser the resolver uses
              // so unknown or missing tax_treatment falls back to
              // ZeroRated, never silently adding 5% VAT.
              resolvedTreatment = normalizeTaxTreatment(requestedTreatment);
            }
          }

          await tx.update(deliveryOrders).set({
            customerName: persistCustomerName,
            customerId: persistCustomerId,
            status: newStatus,
            orderDate: body.order_date || null,
            reference: body.reference || null,
            referenceDate: body.reference_date || null,
            subtotal: resolvedSubtotal.toFixed(2),
            taxAmount: resolvedVatAmount.toFixed(2),
            totalAmount: resolvedTotal.toFixed(2),
            currency: body.currency || 'AED',
            notes: body.remarks || body.notes || null,
            taxRate: resolvedVatRate.toFixed(4),
            taxTreatment: resolvedTreatment,
            showRemarks: body.show_remarks || false,
          }).where(eq(deliveryOrders.id, id));

          const newItems: Array<{ productId: number | null; quantity: number }> = [];
          if (willReplaceItems) {
            await tx.delete(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));
            for (const item of resolvedItems) {
              await tx.insert(deliveryOrderItems).values({
                doId: id,
                productId: item.product_id,
                brandId: item.brand_id,
                productCode: item.product_code,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unit_price.toFixed(2),
                lineTotal: item.line_total.toFixed(2),
              });
              newItems.push({ productId: item.product_id, quantity: item.quantity });
            }
          } else {
            for (const it of lockedOldItems) {
              newItems.push({ productId: it.productId, quantity: Number(it.quantity) });
            }
          }

          // Stock movement logic based on the LOCKED status, not the pre-tx
          // existingDO.status — otherwise we could double-deduct if the DO
          // was concurrently transitioned to delivered.
          becomingDelivered = newStatus === 'delivered' && locked.status !== 'delivered';
          const remainingDelivered = newStatus === 'delivered' && locked.status === 'delivered';

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
                  tx,
                );
              }
            }
          } else if (remainingDelivered) {
            // Reconcile stock: compare locked old vs new quantities per product
            const oldQtyMap = new Map<number, number>();
            for (const item of lockedOldItems) {
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
                  tx,
                );
              }
            }
          }
        });
      } catch (txError) {
        if (txError instanceof Error) {
          if (txError.message === NOT_FOUND) {
            return res.status(404).json({ error: 'Delivery order not found' });
          }
          if (txError.message === ALREADY_CANCELLED) {
            return res.status(409).json({ error: 'Delivery order is already cancelled' });
          }
          if (txError.message === DOWNGRADE_BLOCKED) {
            return res.status(400).json({ error: 'Cannot change status of a delivered order. Use the Cancel action to cancel it.' });
          }
        }
        throw txError;
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

  // PATCH /api/delivery-orders/:id/cancel
  // Cancellation is strictly all-or-nothing for inventory: the DO's net
  // stock effect (including any edits made while delivered, which add their
  // own stock_movements rows) is reversed exactly once per product, then the
  // DO flips to `cancelled`. Submitted DOs cancel without stock movement.
  // Draft DOs must be deleted, not cancelled.
  app.patch('/api/delivery-orders/:id/cancel', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      // Reject partial-reversal payloads before touching anything.
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'productIdsToReverse')) {
        return res.status(400).json({
          error: 'partial_stock_reversal_not_allowed',
          message: 'Delivery order cancellation is all-or-nothing. To keep some items with the customer, restore stock now and record a separate sale or write-off for those items.',
        });
      }

      const [doRecord] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!doRecord) return res.status(404).json({ error: 'Delivery order not found' });

      if (doRecord.status === 'cancelled') {
        return res.status(409).json({ error: 'Delivery order is already cancelled' });
      }
      if (doRecord.status === 'draft') {
        return res.status(400).json({ error: 'Draft delivery orders should be deleted, not cancelled' });
      }

      let stockReversed = false;
      const ALREADY_CANCELLED = '__do_already_cancelled__';

      try {
        await db.transaction(async (tx) => {
          // Lock the DO row so concurrent cancellations cannot both post
          // reversals.
          const [locked] = await tx.select({
            id: deliveryOrders.id,
            status: deliveryOrders.status,
          }).from(deliveryOrders).where(eq(deliveryOrders.id, id)).for('update');
          if (!locked || locked.status === 'cancelled') {
            // Another concurrent cancel beat us to it — bail and let the
            // outer handler return 409 instead of a misleading 200.
            throw new Error(ALREADY_CANCELLED);
          }

          if (locked.status === 'delivered') {
            // Aggregate the existing stock_movements for this DO by productId.
            // This naturally captures both the original delivery movement and
            // any subsequent edit-time adjustment movements, so a delivered DO
            // that was edited mid-flight reverses the *net* effect.
            const doMovements = await tx.select().from(stockMovements)
              .where(and(
                eq(stockMovements.referenceType, 'delivery_order'),
                eq(stockMovements.referenceId, id),
              ));

            const netByProduct = new Map<number, number>();
            for (const m of doMovements) {
              netByProduct.set(m.productId, (netByProduct.get(m.productId) ?? 0) + m.quantity);
            }

            for (const [productId, net] of netByProduct.entries()) {
              if (net === 0) continue;
              await updateProductStock(
                productId,
                -net,
                'delivery_order_cancellation',
                id,
                'delivery_order',
                0,
                `Stock reversed — DO #${doRecord.orderNumber} cancelled`,
                req.user!.id,
                tx,
              );
              stockReversed = true;
            }
          }

          await tx.update(deliveryOrders).set({ status: 'cancelled' }).where(eq(deliveryOrders.id, id));
        });
      } catch (txError) {
        if (txError instanceof Error && txError.message === ALREADY_CANCELLED) {
          return res.status(409).json({ error: 'Delivery order is already cancelled' });
        }
        throw txError;
      }

      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));

      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(id),
        targetType: 'delivery_order',
        action: 'UPDATE',
        details: stockReversed
          ? `DO #${doRecord.orderNumber} cancelled — full stock reversed`
          : `DO #${doRecord.orderNumber} cancelled — no stock to reverse`,
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
        const storageResult = await deleteStorageObjectSafely(doRecord.scanKey);
        if (!storageResult.ok) {
          console.error(
            `Failed to delete delivery-order scan from storage: type=delivery_order id=${id} key=${doRecord.scanKey} error=${storageResult.error}`
          );
          return res.status(502).json({ error: 'Could not delete file from storage. Please try again.' });
        }
        await db.delete(storageObjects).where(eq(storageObjects.key, doRecord.scanKey));
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

  app.delete('/api/delivery-orders/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
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
      if (doHeader.status === 'cancelled') {
        return res.status(400).json({ error: 'Cancelled orders cannot be deleted. The document is retained for audit purposes.' });
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
