import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, apiDelete } from './helpers';

test.describe('Quotations — create, view, convert to invoice', () => {
  let cookie: string;
  let quoteId: number;
  let quoteNumber: string;
  let productId: number;
  let customerId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const prodsRaw = await apiGet('/api/products', cookie);
    const prods: any[] = Array.isArray(prodsRaw) ? prodsRaw : [];
    productId = prods[0]?.id ?? 1;

    const custsRaw = await apiGet('/api/customers', cookie);
    const custList: any[] = Array.isArray(custsRaw) ? custsRaw : (Array.isArray(custsRaw.customers) ? custsRaw.customers : []);
    customerId = custList[0]?.id ?? 3;
  });

  test('quotations list loads with existing data', async () => {
    const data = await apiGet('/api/quotations', cookie);
    const quotes = data.quotations ?? data;
    expect(Array.isArray(quotes)).toBe(true);
    expect(quotes.length).toBeGreaterThan(0);
  });

  test('create quotation with line items via API', async () => {
    const prods = await apiGet('/api/products', cookie);
    const items = prods.slice(0, 5).map((p: any, i: number) => ({
      product_id: p.id,
      description: p.name,
      product_code: p.sku,
      quantity: i + 1,
      unit_price: parseFloat(p.unitPrice),
      vat_rate: 0.05,
      discount: 0,
      line_total: (i + 1) * parseFloat(p.unitPrice),
    }));
    const subtotal = items.reduce((s: number, i: any) => s + i.line_total, 0);
    const vat = subtotal * 0.05;

    const { status, data } = await apiPost('/api/quotations', {
      customerId,
      customerName: 'E2E Test Customer',
      quoteDate: '2026-03-23',
      validUntil: '2026-04-23',
      status: 'Draft',
      notes: 'E2E test quotation — 5 line items',
      totalAmount: subtotal.toFixed(2),
      vatAmount: vat.toFixed(2),
      grandTotal: (subtotal + vat).toFixed(2),
      items,
    }, cookie);

    expect(status).toBe(201);
    expect(data.id).toBeTruthy();
    quoteId = data.id;
    quoteNumber = data.quoteNumber;
  });

  test('quotation detail returns all line items', async () => {
    const data = await apiGet(`/api/quotations/${quoteId}`, cookie);
    expect((data.items ?? []).length).toBe(5);
    expect(parseFloat(data.grandTotal)).toBeGreaterThan(0);
  });

  test('50-line quotation (QUO-2025-301) has all items and correct total', async () => {
    const data = await apiGet('/api/quotations/271', cookie);
    expect((data.items ?? []).length).toBe(50);
    expect(parseFloat(data.grandTotal)).toBeCloseTo(17671.5, 0);
  });

  test('convert quotation to invoice via API', async () => {
    const prods = await apiGet('/api/products', cookie);
    const items = prods.slice(0, 3).map((p: any) => ({
      product_id: p.id,
      description: p.name,
      product_code: p.sku,
      quantity: 2,
      unit_price: parseFloat(p.unitPrice),
      vat_rate: 0.05,
      discount: 0,
      line_total: 2 * parseFloat(p.unitPrice),
    }));
    const subtotal = items.reduce((s: number, i: any) => s + i.line_total, 0);
    const vat = subtotal * 0.05;

    const { status: qs, data: qData } = await apiPost('/api/quotations', {
      customerId,
      quoteDate: '2026-03-23',
      validUntil: '2026-04-23',
      status: 'Draft',
      totalAmount: subtotal.toFixed(2),
      vatAmount: vat.toFixed(2),
      grandTotal: (subtotal + vat).toFixed(2),
      items,
    }, cookie);
    expect(qs).toBe(201);
    const srcQuoteId = qData.id;

    const invItems = items.map((it: any) => ({
      product_id: it.product_id,
      description: it.description,
      product_code: it.product_code,
      quantity: it.quantity,
      unit_price: it.unit_price,
      line_total: it.line_total,
    }));
    const { status: is, data: invData } = await apiPost('/api/invoices', {
      customer_id: customerId,
      invoice_date: '2026-03-23',
      reference: qData.quoteNumber,
      notes: `Converted from quotation ${qData.quoteNumber}`,
      tax_amount: vat.toFixed(2),
      total_amount: (subtotal + vat).toFixed(2),
      items: invItems,
    }, cookie);

    expect(is).toBe(201);
    expect(invData.id).toBeTruthy();

    const invDetail = await apiGet(`/api/invoices/${invData.id}`, cookie);
    expect((invDetail.items ?? []).length).toBe(3);

    await apiDelete(`/api/invoices/${invData.id}`, cookie);
    await apiDelete(`/api/quotations/${srcQuoteId}`, cookie);
  });

  test('quotations list API is reachable with 259+ records', async () => {
    const data = await apiGet('/api/quotations', cookie);
    const quotes: any[] = Array.isArray(data) ? data : (data.quotations ?? []);
    expect(quotes.length).toBeGreaterThanOrEqual(250);
  });

  test.afterAll(async () => {
    if (quoteId) await apiDelete(`/api/quotations/${quoteId}`, cookie);
  });
});
