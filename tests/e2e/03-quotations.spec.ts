import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, apiDelete, apiPut } from './helpers';

test.describe('Quotations — create, view, convert to invoice', () => {
  let cookie: string;
  let quoteId: number;
  let quoteNumber: string;
  let largeQuoteId: number;
  let productId: number;
  let customerId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();

    // Retry products fetch up to 3 times to handle transient failures
    let prods: any[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const prodsRaw = await apiGet('/api/products', cookie);
      if (Array.isArray(prodsRaw) && prodsRaw.length > 0) {
        prods = prodsRaw;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    productId = prods[0]?.id ?? 1;

    const custsRaw = await apiGet('/api/customers', cookie);
    const custList: any[] = Array.isArray(custsRaw) ? custsRaw : (Array.isArray(custsRaw.customers) ? custsRaw.customers : []);
    customerId = custList[0]?.id ?? 3;

    // Create a large (10-line) quotation for the large-document tests
    const items = prods.slice(0, 10).map((p: any, i: number) => ({
      product_id: p.id,
      description: p.name,
      product_code: p.sku,
      quantity: i + 1,
      unit_price: parseFloat(p.unitPrice),
      vat_rate: 0.05,
      discount: 0,
      line_total: (i + 1) * parseFloat(p.unitPrice),
    }));
    const subtotal = items.reduce((s: number, it: any) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost('/api/quotations', {
      customerId,
      customerName: 'E2E Large Quote Test',
      quoteDate: '2026-03-23',
      validUntil: '2026-04-23',
      status: 'Draft',
      notes: 'E2E large document test quotation — 10 line items',
      totalAmount: subtotal.toFixed(2),
      vatAmount: vat.toFixed(2),
      grandTotal: (subtotal + vat).toFixed(2),
      items,
    }, cookie);
    if (status === 201) {
      largeQuoteId = data.id;
    }
  });

  test.afterAll(async () => {
    if (quoteId) await apiDelete(`/api/quotations/${quoteId}`, cookie);
    if (largeQuoteId) await apiDelete(`/api/quotations/${largeQuoteId}`, cookie);
  });

  test('quotations list loads with existing data', async () => {
    const data = await apiGet('/api/quotations', cookie);
    const quotes = data.quotations ?? data;
    expect(Array.isArray(quotes)).toBe(true);
    expect(quotes.length).toBeGreaterThan(0);
  });

  test('create quotation with 5 line items via API', async () => {
    let prods: any[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await apiGet('/api/products', cookie);
      if (Array.isArray(r) && r.length > 0) { prods = r; break; }
      await new Promise(res => setTimeout(res, 400));
    }
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

  test('quotation detail returns all 5 line items', async () => {
    const data = await apiGet(`/api/quotations/${quoteId}`, cookie);
    expect((data.items ?? []).length).toBe(5);
    expect(parseFloat(data.grandTotal)).toBeGreaterThan(0);
  });

  test('large (10-line) quotation loads correctly — all items and non-zero total', async () => {
    expect(largeQuoteId).toBeTruthy();
    const data = await apiGet(`/api/quotations/${largeQuoteId}`, cookie);
    expect((data.items ?? []).length).toBe(10);
    expect(parseFloat(data.grandTotal)).toBeGreaterThan(0);
    expect(parseFloat(data.vatAmount)).toBeGreaterThan(0);
  });

  test('convert quotation to invoice: create invoice referencing quote, then mark quote Converted', async () => {
    let prods: any[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await apiGet('/api/products', cookie);
      if (Array.isArray(r) && r.length > 0) { prods = r; break; }
      await new Promise(res => setTimeout(res, 400));
    }
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

    // Step 1: Create source quotation
    const { status: qs, data: qData } = await apiPost('/api/quotations', {
      customerId,
      quoteDate: '2026-03-23',
      validUntil: '2026-04-23',
      status: 'Sent',
      totalAmount: subtotal.toFixed(2),
      vatAmount: vat.toFixed(2),
      grandTotal: (subtotal + vat).toFixed(2),
      items,
    }, cookie);
    expect(qs).toBe(201);
    const srcQuoteId = qData.id;

    // Step 2: Create invoice from quotation data (conversion)
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

    // Step 3: Verify invoice has 3 items and references the quotation
    const invDetail = await apiGet(`/api/invoices/${invData.id}`, cookie);
    expect((invDetail.items ?? []).length).toBe(3);
    expect(invDetail.reference ?? invDetail.notes).toMatch(new RegExp(qData.quoteNumber.replace('-', '\\-')));

    // Step 4: Mark quotation as Converted (simulates the UI conversion flow)
    const { status: us, data: updated } = await apiPut(`/api/quotations/${srcQuoteId}`, {
      status: 'Converted',
    }, cookie);
    expect(us).toBe(200);
    expect(updated.status).toBe('Converted');

    // Cleanup
    await apiDelete(`/api/invoices/${invData.id}`, cookie);
    await apiDelete(`/api/quotations/${srcQuoteId}`, cookie);
  });

  test('quotations list has 250+ records', async () => {
    const data = await apiGet('/api/quotations', cookie);
    const quotes: any[] = Array.isArray(data) ? data : (data.quotations ?? []);
    expect(quotes.length).toBeGreaterThanOrEqual(250);
  });
});
