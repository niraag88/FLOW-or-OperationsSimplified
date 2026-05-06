import type { Express } from "express";
import { invoices, invoiceLineItems, auditLog, products, quotations } from "@shared/schema";
import { type InsertInvoice } from "@shared/schema";
import { db } from "../../db";
import { eq, inArray } from "drizzle-orm";
import { businessStorage } from "../../businessStorage";
import { requireAuth, updateProductStock, type AuthenticatedRequest } from "../../middleware";
import { resolveDocumentTotals, isTotalsError, resolveAuthoritativeTaxTreatment } from "../../utils/totals";
import { isProductsStockNonNegativeViolation } from "../../utils/pgError";
import { logger } from "../../logger";

export function registerInvoiceCreateRoutes(app: Express) {
  app.post('/api/invoices/from-quotation', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
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

      // One tx covers conversion + snapshot + audit so a failure
      // never leaves a "converted" quotation whose invoice didn't land.
      const invoice = await db.transaction(async (tx) => {
        const inv = await businessStorage.createInvoiceFromQuotation(
          parseInt(quotationId),
          nextNumber,
          parseInt(req.user!.id),
          tx,
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
          await tx.update(invoices).set({ companySnapshot: snapshot }).where(eq(invoices.id, inv.id));
        }

        await tx.insert(auditLog).values({
          actor: req.user!.id,
          actorName: req.user?.username || String(req.user!.id),
          targetId: String(inv.id),
          targetType: 'invoice',
          action: 'CREATE',
          details: `Invoice #${inv.invoiceNumber} created from Quotation id=${quotationId}`,
        });

        return inv;
      });

      res.status(201).json(invoice);
    } catch (error) {
      logger.error('Error creating invoice from quotation:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create invoice from quotation' });
      }
    }
  });

  app.post('/api/invoices', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    type Shortfall = { name: string; sku: string; requested: number; available: number };
    let shortfalls: Shortfall[] = [];
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

      // Header + items + snapshot + delivered-stock + audit row all
      // share one tx so a partial failure leaves no rows behind.
      const insertPayload: typeof invoices.$inferInsert = {
        ...invoiceData,
        taxTreatment: resolved.taxTreatment,
      };
      // Sentinel for friendly negative-stock 409 (Task #414).
      const INSUFFICIENT_STOCK = '__inv_insufficient_stock__';

      const invoice = await db.transaction(async (tx) => {
        // Lock-and-validate stock BEFORE any insert when this create
        // would actually deduct stock (status === 'delivered'). Mirrors
        // the lock-then-sentinel pattern used by invoice update so the
        // user sees a clean 409 with the shortfall product names instead
        // of a generic 500 from the products_stock_quantity_non_negative_chk
        // CHECK constraint backstop.
        if (body.status === 'delivered') {
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

        const [created] = await tx
          .insert(invoices)
          .values(insertPayload)
          .returning();

        for (const item of resolved.items) {
          await tx.insert(invoiceLineItems).values({
            invoiceId: created.id,
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
          await tx.update(invoices)
            .set({ companySnapshot: invCompanySnapshot })
            .where(eq(invoices.id, created.id));
        }

        if (body.status === 'delivered') {
          for (const item of resolved.items) {
            if (item.product_id) {
              await updateProductStock(
                parseInt(String(item.product_id)),
                -item.quantity,
                'sale',
                created.id,
                'invoice',
                Number(item.unit_price),
                `Sale from Invoice #${created.invoiceNumber}`,
                req.user!.id,
                tx
              );
            }
          }
          await tx.update(invoices)
            .set({ stockDeducted: true })
            .where(eq(invoices.id, created.id));
        }

        // Task #420 (B5): when this invoice was created from a quotation
        // via the UI's editable form, atomically mark the source quote
        // as converted in the same transaction. Validates eligibility
        // (status + customer match) so a caller cannot pair an invoice
        // with an unrelated or terminal quote. This — together with
        // /convert and /from-quotation routing through createInvoiceFromQuotation —
        // means there is now exactly one canonical conversion outcome:
        // an invoice exists for every 'converted' quote.
        let convertedQuoteSummary: string | null = null;
        const rawSrcQuoteId = body.source_quotation_id ?? body.sourceQuotationId;
        if (rawSrcQuoteId !== undefined && rawSrcQuoteId !== null) {
          const srcQuoteId = typeof rawSrcQuoteId === 'number'
            ? rawSrcQuoteId
            : (typeof rawSrcQuoteId === 'string' && /^\d+$/.test(rawSrcQuoteId) ? parseInt(rawSrcQuoteId, 10) : NaN);
          if (!Number.isFinite(srcQuoteId) || srcQuoteId <= 0) {
            throw new Error('Invalid source_quotation_id');
          }
          const [srcQuote] = await tx.select({
            id: quotations.id,
            status: quotations.status,
            quoteNumber: quotations.quoteNumber,
            customerId: quotations.customerId,
          }).from(quotations).where(eq(quotations.id, srcQuoteId)).for('update');
          if (!srcQuote) throw new Error(`Source quotation ${srcQuoteId} not found`);
          const ELIGIBLE = ['draft', 'sent', 'submitted', 'accepted'];
          if (!ELIGIBLE.includes(srcQuote.status)) {
            throw new Error(`Source quotation ${srcQuote.quoteNumber} is in status '${srcQuote.status}' and cannot be converted`);
          }
          if (srcQuote.customerId !== customerId) {
            throw new Error(`Source quotation ${srcQuote.quoteNumber} belongs to a different customer than this invoice`);
          }
          await tx.update(quotations)
            .set({ status: 'converted', updatedAt: new Date() })
            .where(eq(quotations.id, srcQuoteId));
          convertedQuoteSummary = `${srcQuote.quoteNumber} (id=${srcQuoteId})`;
        }

        await tx.insert(auditLog).values({
          actor: req.user!.id,
          actorName: req.user?.username || String(req.user!.id),
          targetId: String(created.id),
          targetType: 'invoice',
          action: 'CREATE',
          details: `Invoice #${created.invoiceNumber} created for ${customerName}`
            + (body.status === 'delivered' ? ' — stock deducted' : '')
            + (convertedQuoteSummary ? ` — Quotation ${convertedQuoteSummary} marked as converted` : ''),
        });

        return created;
      });

      res.status(201).json({ ...invoice, items: body.items || [] });
    } catch (error) {
      // Friendly negative-stock 409 from the in-tx sentinel (Task #414).
      if (error instanceof Error && error.message === '__inv_insufficient_stock__') {
        const lines = shortfalls.map(s =>
          `'${s.name}${s.sku ? ` (${s.sku})` : ''}' — only ${s.available} available, you tried to ship ${s.requested}.`
        );
        return res.status(409).json({
          error: 'insufficient_stock',
          message: `Not enough stock for ${lines.join(' ')}`,
          shortfalls,
        });
      }
      // Defensive backstop: rare race where stock changed between the
      // pre-check and the deduct, caught by products_stock_quantity_non_negative_chk.
      // Drizzle wraps pg errors as DrizzleQueryError, so walk the .cause chain.
      if (isProductsStockNonNegativeViolation(error)) {
        return res.status(409).json({
          error: 'insufficient_stock',
          message: 'Not enough stock to fulfil this invoice. Please refresh and try again.',
        });
      }
      logger.error('Error creating invoice:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create invoice' });
      }
    }
  });
}
