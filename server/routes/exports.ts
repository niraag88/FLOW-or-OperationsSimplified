import type { Express } from "express";
import { invoices, quotations, purchaseOrders, invoiceLineItems, deliveryOrderItems, quotationItems, purchaseOrderItems, products, brands, customers, suppliers, companySettings } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, generateDOPDF, type AuthenticatedRequest } from "../middleware";

export function registerExportRoutes(app: Express) {
  app.get('/api/export/invoice', requireAuth(), async (req, res) => {
    try {
      const { invoiceId } = req.query;

      if (!invoiceId) {
        return res.status(400).json({ error: 'invoiceId parameter is required' });
      }

      const [invoice] = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerName: invoices.customerName,
        customerId: invoices.customerId,
        status: invoices.status,
        invoiceDate: invoices.invoiceDate,
        createdAt: invoices.createdAt,
        amount: invoices.amount,
        vatAmount: invoices.vatAmount,
        notes: invoices.notes,
        reference: invoices.reference,
        referenceDate: invoices.referenceDate,
        paymentStatus: invoices.paymentStatus,
        paymentReceivedDate: invoices.paymentReceivedDate,
        paymentRemarks: invoices.paymentRemarks,
        companySnapshot: invoices.companySnapshot,
        customerContactPerson: customers.contactPerson,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerBillingAddress: customers.billingAddress,
        customerShippingAddress: customers.shippingAddress,
        customerVatNumber: customers.vatNumber,
        customerVatTreatment: customers.vatTreatment,
      }).from(invoices)
        .leftJoin(customers, eq(customers.id, invoices.customerId))
        .where(eq(invoices.id, parseInt(invoiceId as string)));

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const [companySettingsData] = await db.select().from(companySettings).limit(1);
      const defaultVatRate = companySettingsData?.defaultVatRate ? parseFloat(companySettingsData.defaultVatRate) : 0.05;
      const vatEnabled = companySettingsData?.vatEnabled ?? true;

      const storedTotal = parseFloat(invoice.amount) || 0;
      const storedVat = parseFloat(invoice.vatAmount || '0') || 0;
      const isInternational = invoice.customerVatTreatment === 'International';

      let totalAmount: number, taxAmount: number, subtotal: number, applicableVatRate: number;
      if (storedVat > 0 || storedTotal > 0) {
        totalAmount = storedTotal;
        taxAmount = storedVat;
        subtotal = totalAmount - taxAmount;
        applicableVatRate = subtotal > 0 ? taxAmount / subtotal : 0;
      } else {
        subtotal = storedTotal;
        applicableVatRate = (isInternational || !vatEnabled) ? 0 : defaultVatRate;
        taxAmount = subtotal * applicableVatRate;
        totalAmount = subtotal + taxAmount;
      }

      const storedItems = await db.select({
        productCode: invoiceLineItems.productCode,
        description: invoiceLineItems.description,
        productSku: products.sku,
        productSize: products.size,
        productName: products.name,
        quantity: invoiceLineItems.quantity,
        unitPrice: invoiceLineItems.unitPrice,
        lineTotal: invoiceLineItems.lineTotal,
      }).from(invoiceLineItems)
        .leftJoin(products, eq(products.id, invoiceLineItems.productId))
        .where(eq(invoiceLineItems.invoiceId, parseInt(invoiceId as string)));

      const invoiceItemsList = storedItems.map(item => ({
        product_code: item.productCode || item.productSku || '',
        description: item.description || item.productName || '',
        size: item.productSize || '',
        quantity: item.quantity,
        unit_price: parseFloat(item.unitPrice),
        line_total: parseFloat(item.lineTotal),
      }));

      const invoiceWithItems = {
        id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        invoice_date: invoice.invoiceDate || invoice.createdAt,
        reference: invoice.reference,
        reference_date: invoice.referenceDate,
        subtotal,
        tax_amount: taxAmount,
        vat_rate: Math.round(applicableVatRate * 100),
        total_amount: totalAmount,
        status: invoice.status,
        remarks: invoice.notes || '',
        companySnapshot: invoice.companySnapshot || null,
        customer: {
          name: invoice.customerName,
          contact_name: invoice.customerContactPerson || '',
          email: invoice.customerEmail || '',
          phone: invoice.customerPhone || '',
          address: invoice.customerBillingAddress || invoice.customerShippingAddress || '',
          trn_number: invoice.customerVatNumber || '',
          type: invoice.customerVatTreatment || 'Local'
        },
        items: invoiceItemsList
      };

      res.json({
        success: true,
        data: invoiceWithItems,
        message: 'Invoice data for print view'
      });
    } catch (error) {
      console.error('Error exporting invoice:', error);
      res.status(500).json({ error: 'Failed to export invoice' });
    }
  });

  app.get('/api/export/do', requireAuth(), async (req, res) => {
    try {
      const { doId } = req.query;

      if (!doId) {
        return res.status(400).json({ error: 'doId parameter is required' });
      }

      const { deliveryOrders: doTable, deliveryOrderItems: doItemsTable } = await import('@shared/schema');

      const [deliveryOrder] = await db.select().from(doTable).where(eq(doTable.id, parseInt(doId as string)));

      if (!deliveryOrder) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }

      const doItems = await db.select({
        productCode: products.sku,
        description: deliveryOrderItems.description,
        quantity: deliveryOrderItems.quantity,
        unitPrice: deliveryOrderItems.unitPrice,
        lineTotal: deliveryOrderItems.lineTotal,
      }).from(deliveryOrderItems)
        .leftJoin(products, eq(products.id, deliveryOrderItems.productId))
        .where(eq(deliveryOrderItems.doId, deliveryOrder.id));

      let company: { name: string; address: string; phone: string; email: string } | null = null;
      if (deliveryOrder.companySnapshot) {
        const snap = deliveryOrder.companySnapshot as Record<string, string>;
        company = {
          name: snap.companyName || '',
          address: snap.address || '',
          phone: snap.phone || '',
          email: snap.email || '',
        };
      } else {
        const [companySetting] = await db.select().from(companySettings).limit(1);
        company = companySetting ? {
          name: companySetting.companyName || '',
          address: companySetting.address || '',
          phone: companySetting.phone || '',
          email: companySetting.email || '',
        } : null;
      }

      const puppeteer = await import('puppeteer');

      const templateHtml = await generateDOPDF(deliveryOrder, doItems, company);

      const browser = await puppeteer.default.launch({
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ],
        headless: true
      });

      const page = await browser.newPage();
      await page.setContent(templateHtml, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '1.2cm', right: '1.2cm', bottom: '1.2cm', left: '1.2cm' }
      });

      await browser.close();

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="delivery-order-${deliveryOrder.orderNumber}.pdf"`,
        'Content-Length': pdfBuffer.length
      });

      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error exporting delivery order:', error);
      res.status(500).json({ error: 'Failed to export delivery order' });
    }
  });

  app.get('/api/export/po', requireAuth(), async (req, res) => {
    try {
      const { poId } = req.query;

      if (!poId) {
        return res.status(400).json({ error: 'poId parameter is required' });
      }

      const [purchaseOrder] = await db.select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        supplierId: purchaseOrders.supplierId,
        status: purchaseOrders.status,
        orderDate: purchaseOrders.orderDate,
        expectedDelivery: purchaseOrders.expectedDelivery,
        totalAmount: purchaseOrders.totalAmount,
        currency: purchaseOrders.currency,
        fxRateToAed: purchaseOrders.fxRateToAed,
        notes: purchaseOrders.notes,
        paymentStatus: purchaseOrders.paymentStatus,
        paymentMadeDate: purchaseOrders.paymentMadeDate,
        paymentRemarks: purchaseOrders.paymentRemarks,
        companySnapshot: purchaseOrders.companySnapshot,
        supplierName: suppliers.name,
        supplierAddress: suppliers.address,
        supplierContactPerson: suppliers.contactPerson,
        supplierEmail: suppliers.email,
        supplierPhone: suppliers.phone,
        brandName: brands.name,
        brandAddress: brands.description,
        brandContactPerson: brands.contactPerson,
        brandContactEmail: brands.contactEmail,
        brandContactPhone: brands.contactPhone,
      }).from(purchaseOrders)
        .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .leftJoin(brands, eq(purchaseOrders.brandId, brands.id))
        .where(eq(purchaseOrders.id, parseInt(poId as string)));

      if (!purchaseOrder) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      const items = await db.select({
        productCode: products.sku,
        description: products.name,
        size: products.size,
        quantity: purchaseOrderItems.quantity,
        unitPrice: purchaseOrderItems.unitPrice,
        lineTotal: purchaseOrderItems.lineTotal
      }).from(purchaseOrderItems)
        .leftJoin(products, eq(purchaseOrderItems.productId, products.id))
        .where(eq(purchaseOrderItems.poId, parseInt(poId as string)));

      const resolvedSupplierName = purchaseOrder.supplierName || purchaseOrder.brandName;
      const resolvedSupplierAddress = purchaseOrder.supplierAddress || purchaseOrder.brandAddress;
      const resolvedContactPerson = purchaseOrder.supplierContactPerson || purchaseOrder.brandContactPerson;
      const resolvedEmail = purchaseOrder.supplierEmail || purchaseOrder.brandContactEmail;
      const resolvedPhone = purchaseOrder.supplierPhone || purchaseOrder.brandContactPhone;

      const purchaseOrderWithItems = {
        ...purchaseOrder,
        supplierName: resolvedSupplierName,
        supplierAddress: resolvedSupplierAddress,
        supplierContactPerson: resolvedContactPerson,
        supplierEmail: resolvedEmail,
        supplierPhone: resolvedPhone,
        items: items.map(item => ({
          product_code: item.productCode,
          description: item.description,
          size: item.size,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          line_total: item.lineTotal
        }))
      };

      res.json({
        success: true,
        data: purchaseOrderWithItems,
        message: 'Use frontend PDF generation'
      });
    } catch (error) {
      console.error('Error exporting purchase order:', error);
      res.status(500).json({ error: 'Failed to export purchase order' });
    }
  });

  app.get('/api/export/quotation', requireAuth(), async (req, res) => {
    try {
      const { quotationId } = req.query;

      if (!quotationId) {
        return res.status(400).json({ error: 'quotationId parameter is required' });
      }

      const [quotation] = await db.select({
        id: quotations.id,
        quoteNumber: quotations.quoteNumber,
        customerId: quotations.customerId,
        status: quotations.status,
        quoteDate: quotations.quoteDate,
        validUntil: quotations.validUntil,
        totalAmount: quotations.totalAmount,
        vatAmount: quotations.vatAmount,
        grandTotal: quotations.grandTotal,
        notes: quotations.notes,
        showRemarks: quotations.showRemarks,
        terms: quotations.terms,
        reference: quotations.reference,
        referenceDate: quotations.referenceDate,
        companySnapshot: quotations.companySnapshot,
        customerName: customers.name,
        customerBillingAddress: customers.billingAddress,
        customerShippingAddress: customers.shippingAddress,
        customerContactPerson: customers.contactPerson,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerVatNumber: customers.vatNumber,
        customerVatTreatment: customers.vatTreatment,
      }).from(quotations)
        .leftJoin(customers, eq(quotations.customerId, customers.id))
        .where(eq(quotations.id, parseInt(quotationId as string)));

      if (!quotation) {
        return res.status(404).json({ error: 'Quotation not found' });
      }

      const [companySettingsData] = await db.select().from(companySettings).limit(1);
      const defaultVatRate = companySettingsData?.defaultVatRate ? parseFloat(companySettingsData.defaultVatRate) : 0.05;
      const vatEnabled = companySettingsData?.vatEnabled ?? true;

      const isInternational = quotation.customerVatTreatment === 'International';
      const subtotal = parseFloat(quotation.totalAmount || '0') || 0;

      const applicableVatRate = (isInternational || !vatEnabled) ? 0 : defaultVatRate;
      const recalculatedVatAmount = subtotal * applicableVatRate;
      const recalculatedGrandTotal = subtotal + recalculatedVatAmount;

      const items = await db.select({
        productCode: products.sku,
        description: products.name,
        size: products.size,
        quantity: quotationItems.quantity,
        unitPrice: quotationItems.unitPrice,
        discount: quotationItems.discount,
        vatRate: quotationItems.vatRate,
        lineTotal: quotationItems.lineTotal
      }).from(quotationItems)
        .leftJoin(products, eq(quotationItems.productId, products.id))
        .where(eq(quotationItems.quoteId, parseInt(quotationId as string)));

      const quotationWithItems = {
        ...quotation,
        vatAmount: recalculatedVatAmount,
        grandTotal: recalculatedGrandTotal,
        vat_rate_percentage: applicableVatRate * 100,
        items: items.map(item => ({
          product_code: item.productCode,
          description: item.description,
          size: item.size,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount: item.discount,
          vat_rate: item.vatRate,
          line_total: item.lineTotal
        }))
      };

      res.json({
        success: true,
        data: quotationWithItems,
        message: 'Quotation data for print view'
      });
    } catch (error) {
      console.error('Error exporting quotation:', error);
      res.status(500).json({ error: 'Failed to export quotation' });
    }
  });

  app.get('/api/export/invoices-list', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { search, status, customerId, paymentStatus, dateFrom, dateTo, excludeYears } = req.query as Record<string, string>;

      const allInvoices = await businessStorage.getInvoices({
        search: search || undefined,
        status: status || undefined,
        customerId: customerId || undefined,
        paymentStatus: paymentStatus || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        excludeYears: excludeYears || undefined,
      });

      const data = Array.isArray(allInvoices) ? allInvoices : (allInvoices.data || []);

      const [companyRow] = await db.select().from(companySettings).limit(1);
      const company = companyRow ? {
        companyName: companyRow.companyName,
        address: companyRow.address,
        phone: companyRow.phone,
        email: companyRow.email,
        vatNumber: companyRow.vatNumber,
      } : {};

      res.json({ invoices: data, company });
    } catch (error) {
      console.error('Error exporting invoices list:', error);
      res.status(500).json({ error: 'Failed to export invoices list' });
    }
  });

  app.get('/api/export/quotations-list', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { search, status, customerId, dateFrom, dateTo, excludeYears } = req.query as Record<string, string>;

      const allQuotations = await businessStorage.getQuotations({
        search: search || undefined,
        status: status || undefined,
        customerId: customerId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        excludeYears: excludeYears || undefined,
      });

      const [companyRow] = await db.select().from(companySettings).limit(1);
      const company = companyRow ? {
        companyName: companyRow.companyName,
        address: companyRow.address,
        phone: companyRow.phone,
        email: companyRow.email,
        vatNumber: companyRow.vatNumber,
      } : {};

      res.json({ quotations: allQuotations, company });
    } catch (error) {
      console.error('Error exporting quotations list:', error);
      res.status(500).json({ error: 'Failed to export quotations list' });
    }
  });
}
