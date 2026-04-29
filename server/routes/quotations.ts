import type { Express } from "express";
import { quotations, quotationItems, products, recycleBin, companySettings } from "@shared/schema";
import { insertQuotationSchema } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../middleware";

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
      console.error('Error fetching quotations:', error);
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
      const quotation = await businessStorage.createQuotation(validatedData);

      if (req.body.items && Array.isArray(req.body.items) && req.body.items.length > 0) {
        for (const item of req.body.items) {
          if (item.product_id && Number(item.quantity) > 0) {
            await db.insert(quotationItems).values({
              quoteId: quotation.id,
              productId: parseInt(item.product_id),
              quantity: Number(item.quantity),
              unitPrice: item.unit_price.toString(),
              discount: item.discount ? item.discount.toString() : "0.00",
              vatRate: item.vat_rate ? item.vat_rate.toString() : "0.05",
              lineTotal: item.line_total.toString()
            });
          }
        }
      }

      if (quoteCompanySnapshot) {
        await db.update(quotations).set({ companySnapshot: quoteCompanySnapshot }).where(eq(quotations.id, quotation.id));
      }

      const quoteCustomerName = req.body.customerName || `Customer ID ${req.body.customerId || 'unknown'}`;
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(quotation.id), targetType: 'quotation', action: 'CREATE', details: `Quotation #${quotation.quoteNumber} created for ${quoteCustomerName}` });
      res.status(201).json(quotation);
    } catch (error) {
      console.error('Error creating quotation:', error);
      res.status(500).json({ error: 'Failed to create quotation' });
    }
  });

  app.get('/api/quotations/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextQuotationNumber();
      res.json({ nextNumber });
    } catch (error) {
      console.error('Error getting next quotation number:', error);
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
      console.error('Error fetching quotation:', error);
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
      console.error('Error fetching quotation items:', error);
      res.status(500).json({ error: 'Failed to fetch quotation items' });
    }
  });

  app.patch('/api/quotations/:id/convert', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const [existing] = await db.select({ id: quotations.id, status: quotations.status, quoteNumber: quotations.quoteNumber })
        .from(quotations).where(eq(quotations.id, id));
      if (!existing) return res.status(404).json({ error: 'Quotation not found' });
      const ELIGIBLE = ['draft', 'sent', 'submitted', 'accepted'];
      if (!ELIGIBLE.includes(existing.status)) {
        return res.status(409).json({ error: `Quotation is already in status '${existing.status}' and cannot be converted` });
      }
      const updatedQuote = await businessStorage.updateQuotation(id, { status: 'converted' });
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'quotation', action: 'UPDATE', details: `Quotation #${existing.quoteNumber} marked as converted (invoice created)` });
      res.json(updatedQuote);
    } catch (error) {
      console.error('Error converting quotation:', error);
      res.status(500).json({ error: 'Failed to convert quotation' });
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

      // Enforce status transition rules
      const [existing] = await db.select({ status: quotations.status }).from(quotations).where(eq(quotations.id, id));
      if (!existing) return res.status(404).json({ error: 'Quotation not found' });
      if (existing.status === 'cancelled') {
        return res.status(400).json({ error: 'Cancelled quotations cannot be reactivated' });
      }
      if (existing.status === 'converted') {
        return res.status(400).json({ error: 'Converted quotations cannot be modified' });
      }
      const newStatus = req.body.status;
      if (newStatus && newStatus !== existing.status) {
        // Allowed status transition map (one-way flow enforcement)
        // 'sent' is treated as a legacy alias for 'submitted'
        const ALLOWED_TRANSITIONS: Record<string, string[]> = {
          draft:     ['submitted', 'sent', 'cancelled'],
          sent:      ['submitted', 'accepted', 'rejected', 'cancelled'],
          submitted: ['accepted', 'rejected', 'cancelled'],
          accepted:  ['cancelled'],
          rejected:  ['cancelled'],
        };
        const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
        if (!allowed.includes(newStatus)) {
          return res.status(400).json({ error: `Cannot transition quotation from '${existing.status}' to '${newStatus}'` });
        }
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
      const updatedQuote = await businessStorage.updateQuotation(id, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'quotation', action: 'UPDATE', details: `Quotation #${updatedQuote.quoteNumber} updated (status: ${updatedQuote.status})` });
      res.json(updatedQuote);
    } catch (error) {
      console.error('Error updating quotation:', error);
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
      console.error('Error deleting quotation:', error);
      res.status(500).json({ error: 'Failed to delete quotation' });
    }
  });
}
