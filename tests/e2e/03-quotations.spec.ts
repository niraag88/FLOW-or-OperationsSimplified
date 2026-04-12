import { test, expect } from '@playwright/test';
import {
  apiLogin, apiGet, apiPost, apiDelete, apiPut,
  toProductList, toQuotationList, productPrice, ApiProduct,
} from './helpers';

test.describe('Quotations — create, view, convert to invoice', () => {
  let cookie: string;
  let quoteId: number;
  let quoteNumber: string;
  let largeQuoteId: number;
  let productId: number;
  let customerId: number;
  let testCustomerId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();

    let prods: ApiProduct[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = await apiGet('/api/products', cookie);
      const list = toProductList(raw);
      if (list.length > 0) { prods = list; break; }
      await new Promise((r) => setTimeout(r, 500));
    }
    productId = prods[0]?.id ?? 0;

    // Create a dedicated test customer so tests are self-contained
    const { data: cData } = await apiPost('/api/customers', { name: 'E2E Test Customer (Quotations)', dataSource: 'e2e_test' }, cookie);
    testCustomerId = (cData as { id: number }).id;
    customerId = testCustomerId;

    const items = prods.slice(0, 10).map((p, i) => ({
      product_id: p.id,
      description: p.name,
      product_code: p.sku,
      quantity: i + 1,
      unit_price: productPrice(p),
      vat_rate: 0.05,
      discount: 0,
      line_total: (i + 1) * productPrice(p),
    }));
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
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
      largeQuoteId = (data as { id: number }).id;
    }
  });

  test.afterAll(async () => {
    if (quoteId) await apiDelete(`/api/quotations/${quoteId}`, cookie);
    if (largeQuoteId) await apiDelete(`/api/quotations/${largeQuoteId}`, cookie);
    if (testCustomerId) await apiDelete(`/api/customers/${testCustomerId}`, cookie);
  });

  test('quotations list is reachable', async () => {
    const raw = await apiGet('/api/quotations', cookie);
    const quotes = toQuotationList(raw);
    expect(Array.isArray(quotes)).toBe(true);
    // At least the large quote created in beforeAll should be present
    expect(quotes.length).toBeGreaterThanOrEqual(largeQuoteId ? 1 : 0);
  });

  test('create quotation with 5 line items via API', async () => {
    test.skip(!productId, 'Requires at least one product in the database');
    let prods: ApiProduct[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await apiGet('/api/products', cookie);
      const list = toProductList(r);
      if (list.length > 0) { prods = list; break; }
      await new Promise((res) => setTimeout(res, 400));
    }
    const items = prods.slice(0, 5).map((p, i) => ({
      product_id: p.id,
      description: p.name,
      product_code: p.sku,
      quantity: i + 1,
      unit_price: productPrice(p),
      vat_rate: 0.05,
      discount: 0,
      line_total: (i + 1) * productPrice(p),
    }));
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
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
    const created = data as { id: number; quoteNumber: string };
    expect(created.id).toBeTruthy();
    quoteId = created.id;
    quoteNumber = created.quoteNumber;
  });

  test('quotation detail returns all 5 line items', async () => {
    test.skip(!quoteId, 'Depends on quotation created in previous test');
    const data = await apiGet(`/api/quotations/${quoteId}`, cookie) as {
      items?: unknown[]; grandTotal?: string;
    };
    expect((data.items ?? []).length).toBe(5);
    expect(parseFloat(data.grandTotal ?? '0')).toBeGreaterThan(0);
  });

  test('large (10-line) quotation loads correctly — all items and non-zero total', async () => {
    test.skip(!productId || !largeQuoteId, 'Requires products and a seeded large quotation');
    expect(largeQuoteId).toBeTruthy();
    const data = await apiGet(`/api/quotations/${largeQuoteId}`, cookie) as {
      items?: unknown[]; grandTotal?: string; vatAmount?: string;
    };
    expect((data.items ?? []).length).toBe(10);
    expect(parseFloat(data.grandTotal ?? '0')).toBeGreaterThan(0);
    expect(parseFloat(data.vatAmount ?? '0')).toBeGreaterThan(0);
  });

  test('convert quotation to invoice via POST /api/invoices/from-quotation (dedicated conversion route)', async () => {
    test.skip(!productId, 'Requires at least one product in the database');
    let prods: ApiProduct[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await apiGet('/api/products', cookie);
      const list = toProductList(r);
      if (list.length > 0) { prods = list; break; }
      await new Promise((res) => setTimeout(res, 400));
    }
    const items = prods.slice(0, 3).map((p) => ({
      product_id: p.id,
      description: p.name,
      product_code: p.sku,
      quantity: 2,
      unit_price: productPrice(p),
      vat_rate: 0.05,
      discount: 0,
      line_total: 2 * productPrice(p),
    }));
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;

    // Create source quotation
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
    const srcQuote = qData as { id: number; quoteNumber: string };
    const srcQuoteId = srcQuote.id;

    // Use the dedicated conversion route — this is the actual conversion path,
    // not a manual invoice creation + separate status update.
    const { status: is, data: invData } = await apiPost('/api/invoices/from-quotation', {
      quotationId: srcQuoteId,
    }, cookie);
    expect(is).toBe(201);
    const inv = invData as { id: number; invoiceNumber?: string; reference?: string; notes?: string; items?: unknown[] };
    expect(inv.id).toBeTruthy();

    // Verify the invoice was created with the quotation's items and reference
    const invDetail = await apiGet(`/api/invoices/${inv.id}`, cookie) as {
      items?: unknown[]; reference?: string; notes?: string; status?: string;
    };
    expect((invDetail.items ?? []).length).toBe(3);
    expect(invDetail.reference ?? invDetail.notes).toMatch(
      new RegExp(srcQuote.quoteNumber.replace(/[-]/g, '\\-')),
    );

    // Verify the source quotation status was automatically set to 'Converted'
    const updatedQuote = await apiGet(`/api/quotations/${srcQuoteId}`, cookie) as { status?: string };
    expect(updatedQuote.status).toBe('Converted');

    // Cleanup
    await apiDelete(`/api/invoices/${inv.id}`, cookie);
    await apiDelete(`/api/quotations/${srcQuoteId}`, cookie);
  });

  test('quotations list returns array with valid shape', async () => {
    const raw = await apiGet('/api/quotations', cookie);
    const quotes = toQuotationList(raw);
    expect(Array.isArray(quotes)).toBe(true);
    expect(quotes.length).toBeGreaterThanOrEqual(0);
  });
});
