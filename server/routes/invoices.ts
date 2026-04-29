import type { Express } from "express";
import { invoices, invoiceLineItems, customers, brands, products, recycleBin, storageObjects } from "@shared/schema";
import { type InsertInvoice } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, updateProductStock, deleteStorageObjectSafely, type AuthenticatedRequest } from "../middleware";
import { resolveDocumentTotals, isTotalsError, normalizeTaxTreatment, resolveAuthoritativeTaxTreatment } from "../utils/totals";

export function registerInvoiceRoutes(app: Express) {
  app.get('/api/invoices', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { page, pageSize, search, status, customerId, dateFrom, dateTo, taxTreatment, excludeYears, paymentStatus } = req.query as Record<string, string>;
      const result = await businessStorage.getInvoices({
        page: page ? parseInt(page) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
        search: search || undefined,
        status: status || undefined,
        customerId: customerId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        taxTreatment: taxTreatment || undefined,
        excludeYears: excludeYears || undefined,
        paymentStatus: paymentStatus || undefined,
      });
      res.json(result);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  app.get('/api/invoices/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextInvoiceNumber();
      res.json({ nextNumber });
    } catch (error) {
      console.error('Error getting next invoice number:', error);
      res.status(500).json({ error: 'Failed to get next invoice number' });
    }
  });

  app.get('/api/invoices/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const [invoice] = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
        customerName: invoices.customerName,
        invoiceDate: invoices.invoiceDate,
        amount: invoices.amount,
        vatAmount: invoices.vatAmount,
        status: invoices.status,
        notes: invoices.notes,
        currency: invoices.currency,
        reference: invoices.reference,
        referenceDate: invoices.referenceDate,
        createdAt: invoices.createdAt,
        objectKey: invoices.objectKey,
        scanKey: invoices.scanKey,
        paymentMethod: invoices.paymentMethod,
        paymentStatus: invoices.paymentStatus,
        paymentReceivedDate: invoices.paymentReceivedDate,
        paymentRemarks: invoices.paymentRemarks,
        customerContactPerson: customers.contactPerson,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerBillingAddress: customers.billingAddress,
        customerVatNumber: customers.vatNumber,
        customerVatTreatment: customers.vatTreatment,
        companySnapshot: invoices.companySnapshot,
      }).from(invoices)
        .leftJoin(customers, eq(customers.id, invoices.customerId))
        .where(eq(invoices.id, id));

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const lineItems = await db.select({
        id: invoiceLineItems.id,
        productId: invoiceLineItems.productId,
        brandId: invoiceLineItems.brandId,
        brandName: brands.name,
        productCode: invoiceLineItems.productCode,
        description: invoiceLineItems.description,
        productName: products.name,
        productSku: products.sku,
        productSize: products.size,
        quantity: invoiceLineItems.quantity,
        unitPrice: invoiceLineItems.unitPrice,
        lineTotal: invoiceLineItems.lineTotal,
      }).from(invoiceLineItems)
        .leftJoin(products, eq(products.id, invoiceLineItems.productId))
        .leftJoin(brands, eq(brands.id, invoiceLineItems.brandId))
        .where(eq(invoiceLineItems.invoiceId, id));

      const totalAmount = parseFloat(invoice.amount) || 0;
      const vatAmount = parseFloat(invoice.vatAmount || '0') || 0;
      const subtotal = totalAmount - vatAmount;

      let derivedTaxRate: number;
      let derivedTaxTreatment: string;
      if (vatAmount > 0 && subtotal > 0) {
        derivedTaxTreatment = 'StandardRated';
        derivedTaxRate = Math.round(vatAmount / subtotal * 10000) / 10000;
      } else {
        const localTreatments = ['Local', 'standard', 'Standard', 'local'];
        const isLocal = localTreatments.includes(invoice.customerVatTreatment || '');
        derivedTaxTreatment = isLocal ? 'StandardRated' : 'ZeroRated';
        derivedTaxRate = 0.05;
      }

      const invoiceWithItems = {
        id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        customer_id: invoice.customerId,
        customer_name: invoice.customerName,
        invoice_date: invoice.invoiceDate ? String(invoice.invoiceDate).split('T')[0] : '',
        subtotal,
        tax_amount: vatAmount,
        total_amount: totalAmount,
        tax_rate: derivedTaxRate,
        tax_treatment: derivedTaxTreatment,
        currency: invoice.currency || 'AED',
        status: invoice.status,
        remarks: invoice.notes || '',
        show_remarks: !!(invoice.notes),
        reference: invoice.reference || '',
        reference_date: invoice.referenceDate ? String(invoice.referenceDate).split('T')[0] : '',
        object_key: invoice.objectKey || null,
        scan_key: invoice.scanKey || null,
        payment_method: invoice.paymentMethod || null,
        payment_status: invoice.paymentStatus || 'outstanding',
        payment_received_date: invoice.paymentReceivedDate ? String(invoice.paymentReceivedDate).split('T')[0] : null,
        payment_remarks: invoice.paymentRemarks || null,
        attachments: [],
        customer: invoice.customerId ? {
          contact_name: invoice.customerContactPerson || '',
          email: invoice.customerEmail || '',
          phone: invoice.customerPhone || '',
          address: invoice.customerBillingAddress || '',
          trn_number: invoice.customerVatNumber || '',
          vat_treatment: invoice.customerVatTreatment || 'Local',
        } : null,
        companySnapshot: invoice.companySnapshot || null,
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
      };

      res.json(invoiceWithItems);
    } catch (error) {
      console.error('Error fetching invoice:', error);
      res.status(500).json({ error: 'Failed to fetch invoice' });
    }
  });

  app.post('/api/invoices/from-quotation', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { quotationId } = req.body;

      if (!quotationId) {
        return res.status(400).json({ error: 'quotationId is required' });
      }

      const { companySettings } = await import('@shared/schema');
      const [nextNumber, companySettingsForSnapshot] = await Promise.all([
        businessStorage.generateInvoiceNumber(),
        db.select().from(companySettings).limit(1),
      ]);

      const invoice = await businessStorage.createInvoiceFromQuotation(
        parseInt(quotationId),
        nextNumber,
        parseInt(req.user!.id),
      );

      if (companySettingsForSnapshot[0]) {
        const cs = companySettingsForSnapshot[0];
        const snapshot = {
          companyName: cs.companyName,
          address: cs.address,
          phone: cs.phone,
          email: cs.email,
          vatNumber: cs.vatNumber,
          taxNumber: cs.taxNumber,
          logo: cs.logo,
        };
        await db.update(invoices).set({ companySnapshot: snapshot }).where(eq(invoices.id, invoice.id));
      }

      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(invoice.id),
        targetType: 'invoice',
        action: 'CREATE',
        details: `Invoice #${invoice.invoiceNumber} created from Quotation id=${quotationId}`,
      });

      res.status(201).json(invoice);
    } catch (error) {
      console.error('Error creating invoice from quotation:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create invoice from quotation' });
      }
    }
  });

  app.post('/api/invoices', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body;

      if (!body.customer_id) {
        return res.status(400).json({ error: 'customer_id is required' });
      }

      const { companySettings } = await import('@shared/schema');
      const [nextNumber, invSettingsRow, customer] = await Promise.all([
        businessStorage.generateInvoiceNumber(),
        db.select().from(companySettings).limit(1),
        businessStorage.getCustomerById(parseInt(body.customer_id)),
      ]);
      if (!customer) {
        return res.status(400).json({ error: `Customer with id ${body.customer_id} not found` });
      }
      const customerName = customer.name;
      const customerId = customer.id;
      const invCompanySnapshot = invSettingsRow[0] ? {
        companyName: invSettingsRow[0].companyName,
        address: invSettingsRow[0].address,
        phone: invSettingsRow[0].phone,
        email: invSettingsRow[0].email,
        vatNumber: invSettingsRow[0].vatNumber,
        taxNumber: invSettingsRow[0].taxNumber,
        logo: invSettingsRow[0].logo,
      } : null;

      // Resolve and validate all line items + totals BEFORE any DB write.
      // Server is the source of truth for line_total / subtotal / vat / total —
      // any client-supplied values for those fields are silently overridden.
      const defaultVatRate = invSettingsRow[0]?.defaultVatRate
        ? parseFloat(invSettingsRow[0].defaultVatRate)
        : 0.05;
      // Customer is authoritative for VAT — a zero-rated/exempt/reverse-
      // charge/international customer always resolves to ZeroRated, even
      // if the client tries to force StandardRated.
      const requestedTreatment = resolveAuthoritativeTaxTreatment(
        body.tax_treatment,
        null,
        customer.vatTreatment,
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

      const invoiceData: InsertInvoice = {
        invoiceNumber: nextNumber,
        customerName,
        amount: resolved.totalAmount.toFixed(2),
        status: body.status || 'draft',
        customerId: customerId,
        vatAmount: resolved.vatAmount.toFixed(2),
        invoiceDate: body.invoice_date || undefined,
        reference: body.reference || undefined,
        referenceDate: body.reference_date || undefined,
        notes: body.remarks || body.notes || undefined,
        currency: body.currency || 'AED',
        paymentMethod: body.payment_method || undefined,
        objectKey: undefined,
        scanKey: undefined,
      };

      const invoice = await businessStorage.createInvoice(invoiceData);
      // Persist resolved tax treatment (column exists but is not in the
      // InsertInvoice pick set).
      await db.update(invoices).set({ taxTreatment: resolved.taxTreatment }).where(eq(invoices.id, invoice.id));

      for (const item of resolved.items) {
        await db.insert(invoiceLineItems).values({
          invoiceId: invoice.id,
          productId: item.product_id ? parseInt(String(item.product_id)) : null,
          brandId: item.brand_id ? parseInt(String(item.brand_id)) : null,
          productCode: (item.product_code as string) || null,
          description: (item.description as string) || (item.product_name as string) || '',
          quantity: item.quantity,
          unitPrice: item.unit_price.toFixed(2),
          lineTotal: item.line_total.toFixed(2),
        });
      }

      if (invCompanySnapshot) {
        await db.update(invoices).set({ companySnapshot: invCompanySnapshot }).where(eq(invoices.id, invoice.id));
      }

      if (body.status === 'delivered') {
        await db.transaction(async (tx) => {
          const items = await tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoice.id));
          for (const item of items) {
            if (item.productId) {
              await updateProductStock(
                item.productId,
                -item.quantity,
                'sale',
                invoice.id,
                'invoice',
                parseFloat(item.unitPrice.toString()),
                `Sale from Invoice #${invoice.invoiceNumber}`,
                req.user!.id,
                tx
              );
            }
          }
          await tx.update(invoices).set({ stockDeducted: true }).where(eq(invoices.id, invoice.id));
        });
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(invoice.id), targetType: 'invoice', action: 'CREATE', details: `Invoice #${invoice.invoiceNumber} created for ${customerName}${body.status === 'delivered' ? ' — stock deducted' : ''}` });
      res.status(201).json({ ...invoice, items: body.items || [] });
    } catch (error) {
      console.error('Error creating invoice:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create invoice' });
      }
    }
  });

  app.put('/api/invoices/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const body = req.body ?? {};

      // Reject an explicit empty/invalid items field BEFORE any DB read or
      // write. An omitted items key is a legitimate header-only edit and
      // falls through to the existing recompute-from-stored-items path.
      // But if the caller explicitly supplies items, it must be a non-empty
      // array of objects — otherwise the saved-document contract (every
      // invoice must have at least one valid line) is violated and we
      // would silently keep stale items. Mirrors the no_line_items
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

      let customerName = body.customer_name || 'Unknown Customer';
      let customerId: number | undefined = undefined;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
        }
      }

      const [existingInvoice] = await db.select({
        status: invoices.status,
        stockDeducted: invoices.stockDeducted,
        invoiceNumber: invoices.invoiceNumber,
        taxTreatment: invoices.taxTreatment,
        customerId: invoices.customerId,
        customerName: invoices.customerName,
      }).from(invoices).where(eq(invoices.id, id));

      if (!existingInvoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (existingInvoice.status === 'cancelled') {
        return res.status(409).json({ error: 'Cannot edit a cancelled invoice' });
      }

      // Default the new status to the existing one so header-only edits don't accidentally revert it.
      const newStatus = body.status || existingInvoice.status || 'draft';

      // Cancellation must go through PATCH /api/invoices/:id/cancel — never via PUT.
      if (newStatus === 'cancelled') {
        return res.status(400).json({
          error: 'Use the cancel action to cancel an invoice. The normal update endpoint cannot cancel.',
        });
      }

      // Block reverting a stock-deducted invoice back to draft or submitted.
      // Stock has already been moved out; reverting would silently desync inventory.
      // Fast-fail using the pre-tx snapshot; the in-tx lock check is authoritative.
      if (existingInvoice.stockDeducted && (newStatus === 'draft' || newStatus === 'submitted')) {
        return res.status(400).json({
          error: 'Delivered invoices cannot be reverted. Use Cancel to reverse stock.',
        });
      }

      const willReplaceItems = Array.isArray(body.items) && body.items.length > 0;
      // (The "submittable status requires at least one item" check moved
      // inside the transaction so it runs against the locked items snapshot —
      // a concurrent line-item delete cannot slip a submit through.)

      // Resolve and validate items + totals BEFORE any DB write. If items
      // are not in the body (header-only edit), recompute totals from the
      // existing stored line items so the saved totals always match the
      // saved items. Either way, validation runs before delete/insert so a
      // 400 cannot leave the document with no lines.
      const { companySettings } = await import('@shared/schema');
      const [putSettingsRow] = await db.select().from(companySettings).limit(1);
      const defaultVatRate = putSettingsRow?.defaultVatRate
        ? parseFloat(putSettingsRow.defaultVatRate)
        : 0.05;

      // Authoritative VAT resolution. Customer wins when explicitly
      // zero-rated/exempt/reverse-charge/international (no VAT can be
      // added, even if the client requested StandardRated). Otherwise
      // fall back through body > existing > customer-inferred.
      // CRITICAL: when the body omits customer_id, fall back to the
      // existing invoice's customer so authority still applies.
      const effectiveCustomerIdForVat = customerId ?? existingInvoice.customerId ?? null;
      let putCustomerVatTreatment: string | null = null;
      if (effectiveCustomerIdForVat) {
        const cust = await businessStorage.getCustomerById(effectiveCustomerIdForVat);
        putCustomerVatTreatment = cust?.vatTreatment ?? null;
      }
      const treatmentInput = resolveAuthoritativeTaxTreatment(
        body.tax_treatment,
        existingInvoice.taxTreatment,
        putCustomerVatTreatment,
      );

      let resolvedTreatment: 'StandardRated' | 'ZeroRated' = 'StandardRated';
      let resolvedItems: Array<{
        product_id: number | null;
        brand_id: number | null;
        product_code: string | null;
        description: string;
        quantity: number;
        unit_price: number;
        line_total: number;
      }> = [];
      let resolvedSubtotal = 0;
      let resolvedVatAmount = 0;
      let resolvedTotal = 0;

      if (willReplaceItems) {
        let resolved;
        try {
          resolved = resolveDocumentTotals({
            items: body.items,
            taxTreatment: treatmentInput,
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
      // NOTE: header-only totals recompute moved inside the transaction so
      // it sees the locked items snapshot.

      // Sentinels thrown from inside the transaction so we can map them to
      // the correct HTTP status outside (mirrors the pattern used by the
      // delivery-orders PUT and the invoice cancel route).
      const NOT_FOUND = '__inv_not_found__';
      const ALREADY_CANCELLED = '__inv_already_cancelled__';
      const STOCK_REVERT_BLOCKED = '__inv_stock_revert_blocked__';
      const SUBMIT_REQUIRES_ITEMS = '__inv_submit_requires_items__';

      let becomingDelivered = false;
      let needsStockDeduction = false;
      let needsReconciliation = false;
      let lockedNewStatus = newStatus;
      let reconciledCount = 0;

      const invoiceNum = existingInvoice.invoiceNumber || String(id);
      // Preserve the existing customer linkage when the body omits
      // customer fields. Otherwise a header-only edit would silently
      // null out customerId and break VAT authority on the next edit.
      const persistCustomerId = customerId ?? existingInvoice.customerId ?? null;
      const persistCustomerName =
        body.customer_name
        ?? (customerId ? customerName : existingInvoice.customerName)
        ?? 'Unknown Customer';

      try {
        await db.transaction(async (tx) => {
          // Lock the invoice row so a concurrent PUT or cancel cannot race
          // with us. Without this, two simultaneous edits on the same
          // delivered invoice could both pass the pre-write status check
          // and both reconcile stock against the same stale snapshot,
          // double-adjusting product counts. Mirrors the row lock added
          // to the delivery-orders PUT in Task #306 and the cancel route.
          const [locked] = await tx.select({
            status: invoices.status,
            stockDeducted: invoices.stockDeducted,
          }).from(invoices).where(eq(invoices.id, id)).for('update');

          if (!locked) throw new Error(NOT_FOUND);
          if (locked.status === 'cancelled') throw new Error(ALREADY_CANCELLED);

          // Re-derive newStatus against the locked row. A header-only edit
          // (no body.status) must default to the *current* persisted status,
          // not a pre-tx snapshot — otherwise a concurrent transition that
          // committed between the pre-tx read and the lock would be silently
          // overwritten.
          lockedNewStatus = body.status || locked.status || 'draft';

          // Re-check the stock-revert guard against locked.stockDeducted
          // (the source of truth for inventory).
          if (locked.stockDeducted && (lockedNewStatus === 'draft' || lockedNewStatus === 'submitted')) {
            throw new Error(STOCK_REVERT_BLOCKED);
          }

          // In-lock items snapshot used for both header-only totals
          // recompute and the submit-requires-items pre-check.
          const lockedExistingItems = await tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));

          const submittableStatuses = ['submitted', 'paid', 'delivered'];
          if (submittableStatuses.includes(lockedNewStatus) && !willReplaceItems && lockedExistingItems.length === 0) {
            throw new Error(SUBMIT_REQUIRES_ITEMS);
          }

          // Header-only edits: recompute totals from the locked items
          // snapshot so persisted totals stay consistent with persisted lines.
          if (!willReplaceItems) {
            if (lockedExistingItems.length === 0) {
              // Nothing to recompute against — keep zeros. Run the raw chain
              // value through the same normaliser so unknown/missing
              // tax_treatment falls back to ZeroRated, never silently
              // adding 5% VAT.
              resolvedTreatment = normalizeTaxTreatment(treatmentInput);
            } else {
              const recomputeInput = lockedExistingItems.map(it => ({
                product_id: it.productId,
                quantity: it.quantity,
                unit_price: parseFloat(it.unitPrice.toString()),
              }));
              const resolved = resolveDocumentTotals({
                items: recomputeInput,
                taxTreatment: treatmentInput,
                defaultVatRate,
              });
              resolvedTreatment = resolved.taxTreatment;
              resolvedSubtotal = resolved.subtotal;
              resolvedVatAmount = resolved.vatAmount;
              resolvedTotal = resolved.totalAmount;
            }
          }

          // Re-derive stock flags from the locked snapshot — must reflect
          // what the row currently looks like, not the pre-tx read.
          becomingDelivered = lockedNewStatus === 'delivered' && locked.status !== 'delivered';
          needsStockDeduction = becomingDelivered && !locked.stockDeducted;
          // Reconcile when stock has already been deducted AND the user is
          // replacing line items. Source of truth is locked.stockDeducted.
          needsReconciliation = !!locked.stockDeducted && willReplaceItems;

          // 1. Update header — totals are server-computed; client values are ignored.
          await tx.update(invoices).set({
            customerName: persistCustomerName,
            customerId: persistCustomerId,
            amount: resolvedTotal.toFixed(2),
            vatAmount: resolvedVatAmount.toFixed(2),
            status: lockedNewStatus,
            invoiceDate: body.invoice_date || null,
            reference: body.reference || null,
            referenceDate: body.reference_date || null,
            notes: body.remarks || body.notes || null,
            currency: body.currency || 'AED',
            taxTreatment: resolvedTreatment,
            paymentMethod: body.payment_method || null,
          }).where(eq(invoices.id, id));

          // 2. Snapshot OLD items before delete (only needed if we'll reconcile).
          //    Reuse the locked snapshot we already have to save a redundant SELECT.
          let oldItems: Array<{ productId: number | null; quantity: number; unitPrice: string }> = [];
          if (willReplaceItems && needsReconciliation) {
            oldItems = lockedExistingItems.map(it => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
            }));
          }

          // 3. Replace line items if provided — using resolver-validated values.
          if (willReplaceItems) {
            await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
            for (const item of resolvedItems) {
              await tx.insert(invoiceLineItems).values({
                invoiceId: id,
                productId: item.product_id,
                brandId: item.brand_id,
                productCode: item.product_code,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unit_price.toFixed(2),
                lineTotal: item.line_total.toFixed(2),
              });
            }
          }

          // 4a. Reconcile (already-deducted invoice with item edits): aggregate per productId,
          //     compute oldQty - newQty per product, apply each non-zero delta as an 'adjustment'.
          if (needsReconciliation) {
            const oldByProduct = new Map<number, { qty: number; unitPrice: number }>();
            for (const it of oldItems) {
              if (it.productId == null) continue;
              const cur = oldByProduct.get(it.productId);
              if (cur) {
                cur.qty += it.quantity;
              } else {
                oldByProduct.set(it.productId, {
                  qty: it.quantity,
                  unitPrice: parseFloat(it.unitPrice.toString()),
                });
              }
            }

            const newByProduct = new Map<number, { qty: number; unitPrice: number }>();
            for (const item of resolvedItems) {
              if (item.product_id == null) continue;
              const cur = newByProduct.get(item.product_id);
              if (cur) {
                cur.qty += item.quantity;
              } else {
                newByProduct.set(item.product_id, { qty: item.quantity, unitPrice: item.unit_price });
              }
            }

            const allProductIds = new Set<number>([...oldByProduct.keys(), ...newByProduct.keys()]);
            for (const pid of allProductIds) {
              const oldQty = oldByProduct.get(pid)?.qty ?? 0;
              const newQty = newByProduct.get(pid)?.qty ?? 0;
              const adjustment = oldQty - newQty; // +ve returns stock, -ve deducts more
              if (adjustment === 0) continue;
              const unitCost =
                newByProduct.get(pid)?.unitPrice ??
                oldByProduct.get(pid)?.unitPrice ??
                0;
              await updateProductStock(
                pid,
                adjustment,
                'adjustment',
                id,
                'invoice',
                unitCost,
                `Stock reconciled after editing delivered Invoice #${invoiceNum}`,
                req.user!.id,
                tx
              );
              reconciledCount++;
            }
            // Do NOT touch stockDeducted — it remains true.
          } else if (needsStockDeduction) {
            // 4b. First-time deduction: deduct full quantities for the now-saved items.
            const itemsToDeduct = await tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
            for (const item of itemsToDeduct) {
              if (!item.productId) continue;
              await updateProductStock(
                item.productId,
                -item.quantity,
                'sale',
                id,
                'invoice',
                parseFloat(item.unitPrice.toString()),
                `Sale from Invoice #${invoiceNum}`,
                req.user!.id,
                tx
              );
            }
            await tx.update(invoices).set({ stockDeducted: true }).where(eq(invoices.id, id));
          }
        });
      } catch (txError) {
        if (txError instanceof Error) {
          if (txError.message === NOT_FOUND) {
            return res.status(404).json({ error: 'Invoice not found' });
          }
          if (txError.message === ALREADY_CANCELLED) {
            return res.status(409).json({ error: 'Cannot edit a cancelled invoice' });
          }
          if (txError.message === STOCK_REVERT_BLOCKED) {
            return res.status(400).json({ error: 'Delivered invoices cannot be reverted. Use Cancel to reverse stock.' });
          }
          if (txError.message === SUBMIT_REQUIRES_ITEMS) {
            return res.status(400).json({ error: 'At least one item is required to submit an invoice' });
          }
        }
        throw txError;
      }

      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      const stockSuffix = needsStockDeduction
        ? ' — stock deducted'
        : (reconciledCount > 0
          ? ` — stock reconciled (${reconciledCount} product${reconciledCount === 1 ? '' : 's'})`
          : '');
      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(id),
        targetType: 'invoice',
        action: 'UPDATE',
        details: `Invoice #${updated.invoiceNumber} updated (status: ${updated.status})${stockSuffix}`,
      });
      res.json({ ...updated, items: body.items || [] });
    } catch (error) {
      console.error('Error updating invoice:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update invoice' });
      }
    }
  });

  app.patch('/api/invoices/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { scanKey } = req.body;
      if (!scanKey || typeof scanKey !== 'string') {
        return res.status(400).json({ error: 'scanKey is required' });
      }
      await db.update(invoices).set({ scanKey }).where(eq(invoices.id, id));
      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'UPLOAD', details: `Scan attached to Invoice #${updated.invoiceNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error updating invoice scan key:', error);
      res.status(500).json({ error: 'Failed to update scan key' });
    }
  });

  app.delete('/api/invoices/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (invoice.scanKey) {
        const storageResult = await deleteStorageObjectSafely(invoice.scanKey);
        if (!storageResult.ok) {
          console.error(
            `Failed to delete invoice scan from storage: type=invoice id=${id} key=${invoice.scanKey} error=${storageResult.error}`
          );
          return res.status(502).json({ error: 'Could not delete file from storage. Please try again.' });
        }
        await db.delete(storageObjects).where(eq(storageObjects.key, invoice.scanKey));
      }
      await db.update(invoices).set({ scanKey: null }).where(eq(invoices.id, id));
      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'REMOVE_FILE', details: `Scan removed from Invoice #${invoice.invoiceNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error removing invoice scan key:', error);
      res.status(500).json({ error: 'Failed to remove file' });
    }
  });

  app.patch('/api/invoices/:id/payment', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { paymentStatus, paymentReceivedDate, paymentRemarks } = req.body;
      if (!paymentStatus || !['outstanding', 'paid'].includes(paymentStatus)) {
        return res.status(400).json({ error: 'paymentStatus must be "outstanding" or "paid"' });
      }
      const [existingForPayment] = await db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, id));
      if (!existingForPayment) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (existingForPayment.status === 'cancelled') {
        return res.status(409).json({ error: 'Cannot update payment on a cancelled invoice' });
      }
      if (paymentStatus === 'paid' && !paymentReceivedDate) {
        return res.status(400).json({ error: 'paymentReceivedDate is required when marking as paid' });
      }
      const updateData: Record<string, any> = { paymentStatus };
      if (paymentStatus === 'paid') {
        updateData.paymentReceivedDate = paymentReceivedDate || null;
        updateData.paymentRemarks = paymentRemarks || null;
      } else {
        updateData.paymentReceivedDate = null;
        updateData.paymentRemarks = null;
      }
      const [updated] = await db.update(invoices).set(updateData).where(eq(invoices.id, id)).returning();
      if (!updated) return res.status(404).json({ error: 'Invoice not found' });
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'UPDATE', details: `Payment status set to ${paymentStatus} on Invoice #${updated.invoiceNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error updating invoice payment status:', error);
      res.status(500).json({ error: 'Failed to update payment status' });
    }
  });

  app.post('/api/invoices/:id/process-sale', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) return res.status(400).json({ error: 'Invalid ID' });

      const [invoice] = await db.select({ stockDeducted: invoices.stockDeducted, invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, invoiceId));
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (invoice.stockDeducted) {
        return res.status(409).json({ error: `Stock already deducted for Invoice #${invoice.invoiceNumber}` });
      }

      const items = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));

      if (items.length === 0) {
        return res.status(400).json({ error: 'No items found for this invoice' });
      }

      await db.transaction(async (tx) => {
        for (const item of items) {
          if (!item.productId) continue;
          await updateProductStock(
            item.productId,
            -item.quantity,
            'sale',
            invoiceId,
            'invoice',
            parseFloat(item.unitPrice.toString()),
            `Sale from Invoice #${invoice.invoiceNumber}`,
            req.user!.id,
            tx
          );
        }
        await tx.update(invoices).set({ stockDeducted: true }).where(eq(invoices.id, invoiceId));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(invoiceId), targetType: 'invoice', action: 'UPDATE', details: `Invoice #${invoice.invoiceNumber} processed: stock deducted for ${items.length} products` });
      res.json({
        message: `Stock deducted for ${items.length} products from Invoice #${invoice.invoiceNumber}`
      });
    } catch (error) {
      console.error('Error processing invoice sale:', error);
      res.status(500).json({ error: 'Failed to process invoice sale' });
    }
  });

  // PATCH /api/invoices/:id/cancel
  // Cancellation is strictly all-or-nothing for inventory: a delivered
  // invoice's full stock effect is reversed, exactly once per product, before
  // the invoice flips to `cancelled`. Partial reversal is rejected at the
  // door — partial returns / customer-kept items / goodwill cases must be
  // handled with a separate sale, write-off, or credit note.
  app.patch('/api/invoices/:id/cancel', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      // Reject any attempt to scope reversal to a subset of products. We
      // check for the *presence* of the field, not its value, so an empty
      // array also fails — that prevents callers from cancelling a delivered
      // invoice without reversing any stock.
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'productIdsToReverse')) {
        return res.status(400).json({
          error: 'partial_stock_reversal_not_allowed',
          message: 'Invoice cancellation is all-or-nothing. To keep some items with the customer, restore stock now and record a separate sale or write-off for those items.',
        });
      }

      const [invoice] = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        stockDeducted: invoices.stockDeducted,
      }).from(invoices).where(eq(invoices.id, id));

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (invoice.status === 'cancelled') {
        return res.status(409).json({ error: 'Invoice is already cancelled' });
      }

      let stockReversed = false;
      const ALREADY_CANCELLED = '__invoice_already_cancelled__';

      try {
        await db.transaction(async (tx) => {
          // Lock the invoice row so two concurrent cancellations can't both
          // post reversal movements.
          const [locked] = await tx.select({
            id: invoices.id,
            status: invoices.status,
            stockDeducted: invoices.stockDeducted,
          }).from(invoices).where(eq(invoices.id, id)).for('update');
          if (!locked || locked.status === 'cancelled') {
            // Another concurrent cancel beat us to it. Bail out of the tx
            // and let the outer handler return 409 — do not write a
            // misleading "cancelled — no stock to reverse" audit log.
            throw new Error(ALREADY_CANCELLED);
          }

          if (locked.stockDeducted) {
            const items = await tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));

            // Aggregate by productId so duplicate product lines collapse to a
            // single reversal entry per product. Skip items with no productId
            // (free-form lines produce no stock movement).
            type Agg = { quantity: number; unitPrice: number };
            const byProduct = new Map<number, Agg>();
            for (const item of items) {
              if (!item.productId) continue;
              const existing = byProduct.get(item.productId);
              const unitPrice = parseFloat(item.unitPrice.toString());
              if (existing) {
                existing.quantity += item.quantity;
                // Keep the first non-zero unit price for the audit trail.
                if (!existing.unitPrice && unitPrice) existing.unitPrice = unitPrice;
              } else {
                byProduct.set(item.productId, { quantity: item.quantity, unitPrice });
              }
            }

            for (const [productId, agg] of byProduct.entries()) {
              if (agg.quantity <= 0) continue;
              await updateProductStock(
                productId,
                agg.quantity,
                'invoice_cancellation',
                id,
                'invoice',
                agg.unitPrice,
                `Stock reversed — Invoice #${invoice.invoiceNumber} cancelled`,
                req.user!.id,
                tx,
              );
            }

            await tx.update(invoices).set({ stockDeducted: false }).where(eq(invoices.id, id));
            stockReversed = byProduct.size > 0;
          }

          // Flip status only after every reversal has succeeded.
          await tx.update(invoices).set({ status: 'cancelled' }).where(eq(invoices.id, id));
        });
      } catch (txError) {
        if (txError instanceof Error && txError.message === ALREADY_CANCELLED) {
          return res.status(409).json({ error: 'Invoice is already cancelled' });
        }
        throw txError;
      }

      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(id),
        targetType: 'invoice',
        action: 'UPDATE',
        details: stockReversed
          ? `Invoice #${invoice.invoiceNumber} cancelled — full stock reversed`
          : `Invoice #${invoice.invoiceNumber} cancelled — no stock to reverse`,
      });

      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      res.json(updated);
    } catch (error) {
      console.error('Error cancelling invoice:', error);
      res.status(500).json({ error: 'Failed to cancel invoice' });
    }
  });

  app.delete('/api/invoices/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const userEmail = req.user?.email || req.user?.username || 'unknown';

      const [invoiceHeader] = await db.select().from(invoices).where(eq(invoices.id, id));
      if (!invoiceHeader) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (invoiceHeader.status === 'cancelled') {
        return res.status(400).json({ error: 'Cancelled invoices cannot be deleted. The document is retained for audit purposes.' });
      }
      // Task #363 (RF-1): Block delete on delivered invoices and on any
      // invoice whose stock has already been deducted. Such invoices have
      // produced stock movements that the recycle-bin path does not
      // reverse — they must go through PATCH /api/invoices/:id/cancel,
      // which is the all-or-nothing inventory reversal contract documented
      // above the cancel handler. Defence-in-depth: we check
      // stockDeducted in addition to status === 'delivered' so a future
      // status that retains stock effects (or a row that drifted out of
      // sync) is still caught here. The frontend hides the Delete option
      // for these rows, so this gate only fires for direct API callers
      // and as a backstop against UI bugs.
      if (invoiceHeader.status === 'delivered' || invoiceHeader.stockDeducted) {
        return res.status(400).json({
          error: 'invoice_delete_requires_cancel',
          message: 'Delivered invoices have already produced stock movements. Use Cancel Invoice to reverse stock and retain the audit record — they cannot be moved to the recycle bin.',
        });
      }
      const lineItems = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));

      await db.transaction(async (tx) => {
        await tx.insert(recycleBin).values({
          documentType: 'Invoice',
          documentId: id.toString(),
          documentNumber: invoiceHeader.invoiceNumber,
          documentData: JSON.stringify({ header: invoiceHeader, items: lineItems }),
          deletedBy: userEmail,
          originalStatus: invoiceHeader.status,
          canRestore: true,
        });
        await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
        await tx.delete(invoices).where(eq(invoices.id, id));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'DELETE', details: `Invoice #${invoiceHeader.invoiceNumber} moved to recycle bin` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting invoice:', error);
      res.status(500).json({ error: 'Failed to delete invoice' });
    }
  });
}
