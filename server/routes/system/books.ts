import type { Express } from "express";
import { financialYears, invoices, quotations, purchaseOrders, deliveryOrders } from "@shared/schema";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import ExcelJS from 'exceljs';
import {
  requireAuth,
  writeAuditLog,
  type AuthenticatedRequest,
} from "../../middleware";
import { logger } from "../../logger";

export function registerBooksRoutes(app: Express) {
  app.get('/api/books', requireAuth(), async (req, res) => {
    try {
      const years = await db.select().from(financialYears).orderBy(desc(financialYears.year));
      res.json(years);
    } catch (error) {
      logger.error('Error fetching financial years:', error);
      res.status(500).json({ error: 'Failed to fetch financial years' });
    }
  });

  app.post('/api/books', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body;
      const year = parseInt(body.year);
      if (isNaN(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: 'Invalid year' });
      }
      const existing = await db.select().from(financialYears).where(eq(financialYears.year, year));
      if (existing.length > 0) {
        return res.status(409).json({ error: `Financial year ${year} already exists` });
      }
      const [created] = await db.insert(financialYears).values({
        year,
        startDate: body.start_date || `${year}-01-01`,
        endDate: body.end_date || `${year}-12-31`,
        status: 'Open',
      }).returning();
      writeAuditLog({ actor: req.user!.id, actorName: req.user!.username, targetId: String(created.id), targetType: 'financial_year', action: 'CREATE', details: `Financial year ${year} created` });
      res.status(201).json(created);
    } catch (error) {
      logger.error('Error creating financial year:', error);
      res.status(500).json({ error: 'Failed to create financial year' });
    }
  });

  app.put('/api/books/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const { status } = req.body;
      if (!['Open', 'Closed'].includes(status)) {
        return res.status(400).json({ error: 'Status must be Open or Closed' });
      }
      const [updated] = await db.update(financialYears)
        .set({ status })
        .where(eq(financialYears.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Financial year not found' });
      writeAuditLog({ actor: req.user!.id, actorName: req.user!.username, targetId: String(id), targetType: 'financial_year', action: 'UPDATE', details: `Financial year ${updated.year} set to ${status}` });
      res.json(updated);
    } catch (error) {
      logger.error('Error updating financial year:', error);
      res.status(500).json({ error: 'Failed to update financial year' });
    }
  });

  app.get('/api/books/:id/export', requireAuth(), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

      const [book] = await db.select().from(financialYears).where(eq(financialYears.id, id));
      if (!book) return res.status(404).json({ error: 'Financial year not found' });

      const startDate = new Date(book.startDate);
      const endDate = new Date(book.endDate);
      endDate.setHours(23, 59, 59, 999);

      const [allInvoices, allQuotations, allPOs, allDOs] = await Promise.all([
        db.select().from(invoices),
        db.select().from(quotations),
        db.select().from(purchaseOrders),
        db.select().from(deliveryOrders),
      ]);

      const inRange = (dateVal: string | Date | null | undefined) => {
        if (!dateVal) return false;
        const d = new Date(dateVal);
        return d >= startDate && d <= endDate;
      };

      const yearInvoices = allInvoices.filter(r => inRange(r.invoiceDate));
      const yearQuotations = allQuotations.filter(r => inRange(r.quoteDate));
      const yearPOs = allPOs.filter(r => inRange(r.orderDate));
      const yearDOs = allDOs.filter(r => inRange(r.orderDate));

      const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-GB') : '';
      const fmtNum = (n: any) => n ? parseFloat(String(n)).toFixed(2) : '0.00';
      // Invoice `amount` is VAT-inclusive; subtotal = amount − vatAmount.
      // Treat null / undefined / non-numeric inputs as 0 so the result is
      // never NaN.
      const safeNum = (n: any) => {
        const v = parseFloat(String(n ?? ''));
        return Number.isFinite(v) ? v : 0;
      };
      const fmtInvoiceSubtotal = (amount: any, vat: any) =>
        (safeNum(amount) - safeNum(vat)).toFixed(2);

      const wb = new ExcelJS.Workbook();

      const addJsonSheet = (sheetName: string, rows: Record<string, any>[], fallbackNote: string) => {
        const ws = wb.addWorksheet(sheetName);
        if (rows.length === 0) {
          ws.addRow(['Note']);
          ws.addRow([fallbackNote]);
        } else {
          const headers = Object.keys(rows[0]);
          ws.addRow(headers);
          for (const row of rows) {
            ws.addRow(headers.map(h => row[h] ?? ''));
          }
        }
      };

      addJsonSheet('Invoices', yearInvoices.map(r => ({
        'Invoice Number': r.invoiceNumber,
        'Customer': r.customerName,
        'Date': fmtDate(r.invoiceDate),
        'Status': r.status,
        'Subtotal (AED)': fmtInvoiceSubtotal(r.amount, r.vatAmount),
        'VAT (AED)': fmtNum(r.vatAmount),
        'Total (AED)': fmtNum(r.amount),
        'Reference': r.reference || '',
        'Notes': r.notes || '',
      })), 'No invoices in this period');

      addJsonSheet('Quotations', yearQuotations.map(r => ({
        'Quote Number': r.quoteNumber,
        'Customer ID': r.customerId,
        'Date': fmtDate(r.quoteDate),
        'Status': r.status,
        'Subtotal (AED)': fmtNum(r.totalAmount),
        'VAT (AED)': fmtNum(r.vatAmount),
        'Total (AED)': fmtNum(r.grandTotal),
        'Reference': r.reference || '',
        'Notes': r.notes || '',
      })), 'No quotations in this period');

      addJsonSheet('Purchase Orders', yearPOs.map(r => ({
        'PO Number': r.poNumber,
        'Date': fmtDate(r.orderDate),
        'Status': r.status,
        'Total': fmtNum(r.totalAmount),
        'VAT': fmtNum(r.vatAmount),
        'Grand Total': fmtNum(r.grandTotal),
        'Notes': r.notes || '',
      })), 'No purchase orders in this period');

      addJsonSheet('Delivery Orders', yearDOs.map(r => ({
        'DO Number': r.orderNumber,
        'Customer': r.customerName,
        'Date': fmtDate(r.orderDate),
        'Status': r.status,
        'Subtotal (AED)': fmtNum(r.subtotal),
        'VAT (AED)': fmtNum(r.taxAmount),
        'Total (AED)': fmtNum(r.totalAmount),
        'Reference': r.reference || '',
        'Notes': r.notes || '',
      })), 'No delivery orders in this period');

      const xlsxBuffer = await wb.xlsx.writeBuffer();
      const filename = `FLOW_Year_${book.year}_Export.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(xlsxBuffer));
    } catch (error) {
      logger.error('Error exporting financial year:', error);
      res.status(500).json({ error: 'Failed to export financial year' });
    }
  });
}
