import type { Express } from "express";
import { quotations, quotationItems, products, recycleBin, companySettings, auditLog, invoices } from "@shared/schema";
import { insertQuotationSchema } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../middleware";
import { logger } from "../logger";

export function registerQuotationRoutes(app: Express) {
  app.get('/api/quotations', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { page, pageSize, search, status, customerId, dateFrom, dateTo, excludeYears } = req.query as Record<string, string>;
      const result = await businessStorage.getQuotations({
        page: page ? parseInt(page) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
        search: search || undefined,
        status: status || undefined,
        customerId: customerId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        excludeYears: excludeYears || undefined,
      });
      res.json(result);
    } catch (error) {
      logger.error('Error fetching quotations:', error);
      res.status(500).json({ error: 'Failed to fetch quotations' });
    }
  });

  app.post('/api/quotations', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    if (!req.body.customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }
    if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required to save a quotation' });
    }
    try {
      const [quoteNumber, quoteSettingsRow] = await Promise.all([
        businessStorage.generateQuotationNumber(),
        db.select().from(companySettings).limit(1),
      ]);
      const quoteCompanySnapshot = quoteSettingsRow[0] ? {
        companyName: quoteSettingsRow[0].companyName,
        address: quoteSettingsRow[0].address,
        phone: quoteSettingsRow[0].phone,
        email: quoteSettingsRow[0].email,
        vatNumber: quoteSettingsRow[0].vatNumber,
        taxNumber: quoteSettingsRow[0].taxNumber,
        logo: quoteSettingsRow[0].logo,
      } : null;

      const requestData = {
        ...req.body,
        quoteNumber,
        createdBy: req.user!.id,
        quoteDate: req.body.quoteDate ? new Date(req.body.quoteDate) : undefined,
        validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined,
        referenceDate: req.body.reference_date ? new Date(req.body.reference_date) : undefined
      };

      const validatedData = insertQuotationSchema.parse(requestData);
      const quoteCustomerName = req.body.customerName || `Customer ID ${req.body.customerId || 'unknown'}`;

      // Task #405 (F9): header insert + items loop + companySnapshot
      // update + audit row all in one db.transaction so a partial
      // failure cannot leave a half-built quotation behind.
      const quotation = await db.transaction(async (tx) => {
        const created = await businessStorage.createQuotation(validatedData, tx);

        for (const item of req.body.items) {
          if (item.product_id && Number(item.quantity) > 0) {
            await tx.insert(quotationItems).values({
              quoteId: created.id,
              productId: parseInt(item.product_id),
              quantity: Number(item.quantity),
              unitPrice: item.unit_price.toString(),
              discount: item.discount ? item.discount.toString() : "0.00",
              vatRate: item.vat_rate ? item.vat_rate.toString() : "0.05",
              lineTotal: item.line_total.toString()
            });
          }
        }

        if (quoteCompanySnapshot) {
          await tx.update(quotations)
            .set({ companySnapshot: quoteCompanySnapshot })
            .where(eq(quotations.id, created.id));
        }

        // Task #421 (B4): aggregate header totals from the just-inserted
        // line items so the Quotations list column shows the correct
        // subtotal / VAT / total immediately on creation instead of
        // AED 0.00. Merge the result into the created row so the POST
        // response body is consistent with what the list will show.
        const totals = await businessStorage.recomputeQuotationHeaderTotals(created.id, tx);

        await tx.insert(auditLog).values({
          actor: req.user!.id,
          actorName: req.user?.username || String(req.user!.id),
          targetId: String(created.id),
          targetType: 'quotation',
          action: 'CREATE',
          details: `Quotation #${created.quoteNumber} created for ${quoteCustomerName}`,
        });

        return { ...created, ...totals };
      });

      res.status(201).json(quotation);
    } catch (error) {
      logger.error('Error creating quotation:', error);
      res.status(500).json({ error: 'Failed to create quotation' });
    }
  });

  app.get('/api/quotations/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextQuotationNumber();
      res.json({ nextNumber });
    } catch (error) {
      logger.error('Error getting next quotation number:', error);
      res.status(500).json({ error: 'Failed to get next quotation number' });
    }
  });

  app.get('/api/quotations/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const quotation = await businessStorage.getQuotationWithItems(id);
      if (!quotation) {
        return res.status(404).json({ error: 'Quotation not found' });
      }
      res.json(quotation);
    } catch (error) {
      logger.error('Error fetching quotation:', error);
      res.status(500).json({ error: 'Failed to fetch quotation' });
    }
  });

  app.get('/api/quotations/:id/items', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const quoteId = parseInt(req.params.id);

      const items = await db.select({
        id: quotationItems.id,
        productId: quotationItems.productId,
        productName: products.name,
        productSku: products.sku,
        quantity: quotationItems.quantity,
        unitPrice: quotationItems.unitPrice,
        discount: quotationItems.discount,
        vatRate: quotationItems.vatRate,
        lineTotal: quotationItems.lineTotal,
        description: products.name
      })
        .from(quotationItems)
        .leftJoin(products, eq(quotationItems.productId, products.id))
        .where(eq(quotationItems.quoteId, quoteId));

      res.json(items);
    } catch (error) {
      logger.error('Error fetching quotation items:', error);
      res.status(500).json({ error: 'Failed to fetch quotation items' });
    }
  });

  // Task #420 (B5): /convert is a thin compatibility wrapper around the
  // single canonical conversion flow — `createInvoiceFromQuotation`.
  // This endpoint used to flip status without ever creating an invoice
  // (and lied in the audit log). It now atomically:
  //   1. creates the invoice (using quote items as-is), AND
  //   2. flips the quote to 'converted', AND
  //   3. writes a truthful audit entry,
  // all in one transaction. Failures roll back together — no more
  // orphaned 'converted' quotes.
  app.patch('/api/quotations/:id/convert', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid quotation ID' });
      }

      const { companySettings } = await import('@shared/schema');
      const [nextNumber, csRows] = await Promise.all([
        businessStorage.generateInvoiceNumber(),
        db.select().from(companySettings).limit(1),
      ]);

      const result = await db.transaction(async (tx) => {
        // Use the same canonical path as POST /api/invoices/from-quotation.
        // It creates the invoice, copies items, and sets the quote to
        // 'converted' atomically. It throws if the quote is already
        // converted or has no customer.
        const inv = await businessStorage.createInvoiceFromQuotation(
          id,
          nextNumber,
          parseInt(req.user!.id),
          tx,
        );

        if (csRows[0]) {
          const cs = csRows[0];
          await tx.update(invoices).set({ companySnapshot: {
            companyName: cs.companyName,
            address: cs.address,
            phone: cs.phone,
            email: cs.email,
            vatNumber: cs.vatNumber,
            taxNumber: cs.taxNumber,
            logo: cs.logo,
          } }).where(eq(invoices.id, inv.id));
        }

        await tx.insert(auditLog).values({
          actor: req.user!.id,
          actorName: req.user?.username || String(req.user!.id),
          targetId: String(id),
          targetType: 'quotation',
          action: 'UPDATE',
          details: `Quotation marked as converted; created Invoice #${inv.invoiceNumber}`,
        });

        return { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber };
      });

      // Return the updated quotation so existing callers (which use the
      // response body) keep working; include the new invoice id so the
      // client can navigate to it.
      const updated = await businessStorage.getQuotationById(id);
      return res.status(200).json({ ...updated, createdInvoiceId: result.invoiceId, createdInvoiceNumber: result.invoiceNumber });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      // createInvoiceFromQuotation throws plain Error for known cases.
      if (/not found/i.test(msg)) return res.status(404).json({ error: msg });
      if (/already been converted/i.test(msg)) return res.status(409).json({ error: msg });
      if (/cannot be converted/i.test(msg)) return res.status(409).json({ error: msg });
      if (/no customer assigned/i.test(msg)) return res.status(400).json({ error: msg });
      logger.error('Error converting quotation:', error);
      return res.status(500).json({ error: 'Failed to convert quotation' });
    }
  });

  app.put('/api/quotations/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      // Validate ID before any DB work — bare parseInt('abc') yields NaN
      // which then crashed inside the Drizzle query and surfaced as a 500
      // (Task #320). Strict digits-only check also rejects mixed strings
      // like "1abc" that parseInt would silently coerce to 1 and target
      // the wrong row.
      if (!/^\d+$/.test(req.params.id)) {
        return res.status(400).json({ error: 'Invalid quotation ID' });
      }
      const id = parseInt(req.params.id, 10);
      if (id <= 0) {
        return res.status(400).json({ error: 'Invalid quotation ID' });
      }

      const { companySnapshot: _ignoredQUOSnapshot, ...bodyWithoutSnapshot } = req.body;
      const processedData = {
        ...bodyWithoutSnapshot,
        referenceDate: bodyWithoutSnapshot.reference_date
          ? new Date(bodyWithoutSnapshot.reference_date)
          : bodyWithoutSnapshot.referenceDate
            ? new Date(bodyWithoutSnapshot.referenceDate)
            : undefined,
      };
      if (processedData.quoteDate && typeof processedData.quoteDate === 'string') {
        processedData.quoteDate = new Date(processedData.quoteDate);
      }
      if (processedData.validUntil && typeof processedData.validUntil === 'string') {
        processedData.validUntil = new Date(processedData.validUntil);
      }

      const validatedData = insertQuotationSchema.partial().parse(processedData);
      const newStatus = req.body.status;

      // Task #405 (F10): lock the row, validate transition, write, and
      // audit in one tx. Concurrent edits queue on the row lock instead
      // of both passing the same pre-state check.
      const ALLOWED_TRANSITIONS: Record<string, string[]> = {
        draft:     ['submitted', 'sent', 'cancelled'],
        sent:      ['submitted', 'accepted', 'rejected', 'cancelled'],
        submitted: ['accepted', 'rejected', 'cancelled'],
        accepted:  ['cancelled'],
        rejected:  ['cancelled'],
      };

      const result = await db.transaction(async (tx) => {
        const [existing] = await tx.select({ status: quotations.status })
          .from(quotations).where(eq(quotations.id, id)).for('update');
        if (!existing) return { status: 404 as const, body: { error: 'Quotation not found' } };
        if (existing.status === 'cancelled') {
          return { status: 400 as const, body: { error: 'Cancelled quotations cannot be reactivated' } };
        }
        if (existing.status === 'converted') {
          return { status: 400 as const, body: { error: 'Converted quotations cannot be modified' } };
        }
        if (newStatus && newStatus !== existing.status) {
          const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
          if (!allowed.includes(newStatus)) {
            return { status: 400 as const, body: { error: `Cannot transition quotation from '${existing.status}' to '${newStatus}'` } };
          }
        }
        let updatedQuote = await businessStorage.updateQuotation(id, validatedData, tx);

        // Task #421 (B4): if the caller supplied a fresh items array,
        // replace the line items in the same tx so header totals are
        // recomputed against the new lines. An omitted items key is a
        // legitimate header-only edit; we still recompute totals after
        // it in case a previous save left the header at zero.
        if (Array.isArray(req.body.items)) {
          await tx.delete(quotationItems).where(eq(quotationItems.quoteId, id));
          for (const item of req.body.items) {
            if (item.product_id && Number(item.quantity) > 0) {
              await tx.insert(quotationItems).values({
                quoteId: id,
                productId: parseInt(item.product_id),
                quantity: Number(item.quantity),
                unitPrice: item.unit_price.toString(),
                discount: item.discount ? item.discount.toString() : "0.00",
                vatRate: item.vat_rate ? item.vat_rate.toString() : "0.05",
                lineTotal: item.line_total.toString(),
              });
            }
          }
        }
        const totals = await businessStorage.recomputeQuotationHeaderTotals(id, tx);
        // Merge so the PUT response body reflects the freshly persisted
        // header totals (matches POST behavior — callers shouldn't have
        // to refetch just to read the new subtotal/VAT/grand total).
        updatedQuote = { ...updatedQuote, ...totals };

        await tx.insert(auditLog).values({
          actor: req.user!.id,
          actorName: req.user?.username || String(req.user!.id),
          targetId: String(id),
          targetType: 'quotation',
          action: 'UPDATE',
          details: `Quotation #${updatedQuote.quoteNumber} updated (status: ${updatedQuote.status})`,
        });
        return { status: 200 as const, body: updatedQuote };
      });
      res.status(result.status).json(result.body);
    } catch (error) {
      logger.error('Error updating quotation:', error);
      res.status(500).json({ error: 'Failed to update quotation' });
    }
  });

  app.delete('/api/quotations/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userEmail = req.user?.email || req.user?.username || 'unknown';

      const [quoteHeader] = await db.select().from(quotations).where(eq(quotations.id, id));
      if (!quoteHeader) {
        return res.status(404).json({ error: 'Quotation not found' });
      }
      if (quoteHeader.status === 'cancelled') {
        return res.status(400).json({ error: 'Cancelled quotations cannot be deleted. The document is retained for audit purposes.' });
      }
      const lineItems = await db.select().from(quotationItems).where(eq(quotationItems.quoteId, id));
      const header = quoteHeader;

      await db.transaction(async (tx) => {
        await tx.insert(recycleBin).values({
          documentType: 'Quotation',
          documentId: id.toString(),
          documentNumber: header.quoteNumber,
          documentData: JSON.stringify({ header, items: lineItems }),
          deletedBy: userEmail,
          originalStatus: header.status,
          canRestore: true,
        });
        await tx.delete(quotationItems).where(eq(quotationItems.quoteId, id));
        await tx.delete(quotations).where(eq(quotations.id, id));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'quotation', action: 'DELETE', details: `Quotation #${quoteHeader.quoteNumber} moved to recycle bin` });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting quotation:', error);
      res.status(500).json({ error: 'Failed to delete quotation' });
    }
  });
}
