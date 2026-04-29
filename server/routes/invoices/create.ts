import type { Express } from "express";
import { invoices, invoiceLineItems } from "@shared/schema";
import { type InsertInvoice } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../../businessStorage";
import { requireAuth, writeAuditLog, updateProductStock, type AuthenticatedRequest } from "../../middleware";
import { resolveDocumentTotals, isTotalsError, resolveAuthoritativeTaxTreatment } from "../../utils/totals";

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
}
