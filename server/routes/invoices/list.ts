import type { Express } from "express";
import { invoices, invoiceLineItems, customers, brands, products } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../../businessStorage";
import { requireAuth, type AuthenticatedRequest } from "../../middleware";
import { logger } from "../../logger";

export function registerInvoiceListRoutes(app: Express) {
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
      logger.error('Error fetching invoices:', error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  app.get('/api/invoices/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextInvoiceNumber();
      res.json({ nextNumber });
    } catch (error) {
      logger.error('Error getting next invoice number:', error);
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
      logger.error('Error fetching invoice:', error);
      res.status(500).json({ error: 'Failed to fetch invoice' });
    }
  });
}
