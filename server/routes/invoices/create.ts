import type { Express } from "express";
import { invoices, invoiceLineItems, auditLog } from "@shared/schema";
import { type InsertInvoice } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../../businessStorage";
import { requireAuth, updateProductStock, type AuthenticatedRequest } from "../../middleware";
import { resolveDocumentTotals, isTotalsError, resolveAuthoritativeTaxTreatment } from "../../utils/totals";
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

      // Task #403 (F16): one tx covers invoice header + items +
      // taxTreatment + quotation status flip + companySnapshot update +
      // audit-log row. A failure anywhere rolls all of it back so the
      // database is never left with a half-converted quotation, an
      // invoice with no items, an invoice that renders without
      // company info, or a "converted" quotation whose invoice never
      // landed. Audit row is written via tx.insert(auditLog) (mirrors
      // the PO create-update tx in Task #366) so a successful create
      // is always accompanied by its audit record.
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

      // Task #403 (F16): mirror the PO create-update pattern (Task
      // #366). Header insert + taxTreatment update + line-items loop +
      // companySnapshot update + (optional) delivered-stock deduction
      // + audit-log row all run inside ONE db.transaction. Previously
      // steps 1-4 ran on bare db calls; only the delivered-stock
      // half had its own (nested) tx and the audit row was
      // fire-and-forget. A failure mid-flight could leave a header
      // with no items, an invoice with no companySnapshot, or a
      // "delivered" header whose stock was never deducted, with
      // nothing in the audit log to even prove the partial state
      // happened. Now: every write rolls back together.
      const invoice = await db.transaction(async (tx) => {
        // Persist tax treatment in the same insert — the column is
        // not part of InsertInvoice but is a valid column on the
        // invoices table, so we cast through unknown to set it
        // alongside the other header fields without a follow-up
        // UPDATE.
        const [created] = await tx
          .insert(invoices)
          .values({ ...invoiceData, taxTreatment: resolved.taxTreatment } as unknown as typeof invoices.$inferInsert)
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
          // Stock deduction is folded into the same outer tx (was a
          // separate nested db.transaction before #403). updateProductStock
          // already accepts a tx so the UPDATE products.stock_quantity
          // and the stock_movements INSERT it emits land atomically
          // with the invoice writes above.
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

        // Audit row inside the tx (mirrors PO create-update.ts:129).
        // Replaces the previous fire-and-forget writeAuditLog so a
        // rolled-back create no longer leaves a stranded audit row
        // and a successful create is always accompanied by one.
        await tx.insert(auditLog).values({
          actor: req.user!.id,
          actorName: req.user?.username || String(req.user!.id),
          targetId: String(created.id),
          targetType: 'invoice',
          action: 'CREATE',
          details: `Invoice #${created.invoiceNumber} created for ${customerName}${body.status === 'delivered' ? ' — stock deducted' : ''}`,
        });

        return created;
      });

      res.status(201).json({ ...invoice, items: body.items || [] });
    } catch (error) {
      logger.error('Error creating invoice:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create invoice' });
      }
    }
  });
}
