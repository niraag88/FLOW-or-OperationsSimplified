import type { Express } from "express";
import { invoices, invoiceLineItems, customers, brands, products, recycleBin, storageObjects } from "@shared/schema";
import { type InsertInvoice } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, updateProductStock, objectStorageClient, type AuthenticatedRequest } from "../middleware";

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

      const invoiceData: InsertInvoice = {
        invoiceNumber: nextNumber,
        customerName,
        amount: body.total_amount ? body.total_amount.toString() : '0',
        status: body.status || 'draft',
        customerId: customerId,
        vatAmount: body.tax_amount ? body.tax_amount.toString() : undefined,
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

      if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        for (const item of body.items) {
          if (Number(item.quantity) > 0 && Number(item.unit_price) >= 0) {
            await db.insert(invoiceLineItems).values({
              invoiceId: invoice.id,
              productId: item.product_id ? parseInt(item.product_id) : null,
              brandId: item.brand_id ? parseInt(item.brand_id) : null,
              productCode: item.product_code || null,
              description: item.description || item.product_name || '',
              quantity: Number(item.quantity),
              unitPrice: item.unit_price.toString(),
              lineTotal: item.line_total.toString(),
            });
          }
        }
      }

      if (invCompanySnapshot) {
        await db.update(invoices).set({ companySnapshot: invCompanySnapshot }).where(eq(invoices.id, invoice.id));
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(invoice.id), targetType: 'invoice', action: 'CREATE', details: `Invoice #${invoice.invoiceNumber} created for ${customerName}` });
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
      const body = req.body;

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
      }).from(invoices).where(eq(invoices.id, id));

      if (!existingInvoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (existingInvoice.status === 'cancelled') {
        return res.status(409).json({ error: 'Cannot edit a cancelled invoice' });
      }

      const newStatus = body.status || 'draft';
      const becomingDelivered = newStatus === 'delivered' && existingInvoice?.status !== 'delivered';
      const needsStockDeduction = becomingDelivered && !existingInvoice?.stockDeducted;

      await db.update(invoices).set({
        customerName,
        customerId: customerId || null,
        amount: body.total_amount ? body.total_amount.toString() : '0',
        vatAmount: body.tax_amount ? body.tax_amount.toString() : '0',
        status: newStatus,
        invoiceDate: body.invoice_date || null,
        reference: body.reference || null,
        referenceDate: body.reference_date || null,
        notes: body.remarks || body.notes || null,
        currency: body.currency || 'AED',
        paymentMethod: body.payment_method || null,
      }).where(eq(invoices.id, id));

      if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
        for (const item of body.items) {
          if (Number(item.quantity) > 0 && Number(item.unit_price) >= 0) {
            await db.insert(invoiceLineItems).values({
              invoiceId: id,
              productId: item.product_id ? parseInt(item.product_id) : null,
              brandId: item.brand_id ? parseInt(item.brand_id) : null,
              productCode: item.product_code || null,
              description: item.description || item.product_name || '',
              quantity: Number(item.quantity),
              unitPrice: item.unit_price.toString(),
              lineTotal: item.line_total.toString(),
            });
          }
        }
      }

      if (needsStockDeduction) {
        await db.transaction(async (tx) => {
          const items = await tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
          const invoiceNum = existingInvoice?.invoiceNumber || String(id);
          for (const item of items) {
            if (item.productId) {
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
          }
          await tx.update(invoices).set({ stockDeducted: true }).where(eq(invoices.id, id));
        });
      }

      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'UPDATE', details: `Invoice #${updated.invoiceNumber} updated (status: ${updated.status})${needsStockDeduction ? ' — stock deducted' : ''}` });
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
        try {
          await objectStorageClient.delete(invoice.scanKey);
          await db.delete(storageObjects).where(eq(storageObjects.key, invoice.scanKey));
        } catch (storageErr) {
          console.warn('Could not delete object from storage (clearing key anyway):', storageErr);
        }
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

  app.patch('/api/invoices/:id/cancel', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

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

      await db.transaction(async (tx) => {
        await tx.update(invoices).set({ status: 'cancelled' }).where(eq(invoices.id, id));

        if (invoice.stockDeducted) {
          const items = await tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
          for (const item of items) {
            if (!item.productId) continue;
            await updateProductStock(
              item.productId,
              item.quantity,
              'cancellation',
              id,
              'invoice',
              parseFloat(item.unitPrice.toString()),
              `Stock reversed — Invoice #${invoice.invoiceNumber} cancelled`,
              req.user!.id,
              tx
            );
          }
          await tx.update(invoices).set({ stockDeducted: false }).where(eq(invoices.id, id));
        }
      });

      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(id),
        targetType: 'invoice',
        action: 'UPDATE',
        details: `Invoice #${invoice.invoiceNumber} cancelled${invoice.stockDeducted ? ' — stock reversed' : ''}`,
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
