import { test, expect } from '@playwright/test';
import {
  apiLogin, apiPost, apiDelete, apiGet, BASE_URL,
  toProductList, productPrice, ApiInvoice, ApiProduct,
} from './helpers';

// Task #367 (RF-4): doc-bound scan keys must reject a direct re-upload to a
// key that already holds a scan, returning 409 with the message
//   'A scan already exists at that key. Use the replace flow.'
// The audited remove-then-upload replace flow remains the ONLY sanctioned
// way to swap an existing scan. The matching 409 for anonymous staging
// keys (added in #353) must remain working — the new check is parallel to
// it, not a replacement, and uses a distinct message so the two paths can
// be told apart in logs.

function multipartBody(boundary: string, filename: string, ct: string, content: Buffer) {
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${ct}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return Buffer.concat([head, content, tail]);
}

async function uploadScan(cookie: string, key: string, content: Buffer) {
  const boundary = '----flow-overwrite-test-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const body = multipartBody(boundary, 'scan.png', 'image/png', content);
  return fetch(`${BASE_URL}/api/storage/upload-scan`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'x-storage-key': key,
      'x-content-type': 'image/png',
      'x-file-size': String(content.length),
      Cookie: cookie,
    },
    body,
  });
}

// A minimal valid-enough PNG payload: the validator only checks the first
// four magic bytes (0x89 0x50 0x4E 0x47). Pad to a non-trivial size so the
// content is identifiable in storage-objects size tracking.
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  Buffer.alloc(64, 0x00),
]);

test.describe('Scan upload — doc-bound overwrite is rejected (Task #367)', () => {
  let cookie: string;
  let customerId: number;
  let invoiceId: number;
  let invoiceNumber: string;
  let invoiceYear: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();

    const { data: cData } = await apiPost(
      '/api/customers',
      { name: 'E2E Customer (Scan Overwrite)', dataSource: 'e2e_test' },
      cookie,
    );
    customerId = (cData as { id: number }).id;

    const today = new Date();
    invoiceYear = today.getUTCFullYear();
    const invDate = today.toISOString().slice(0, 10);

    // Pull a real product so the line item is well-formed; the totals
    // resolver requires at least one item.
    let prods: ApiProduct[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = await apiGet('/api/products', cookie);
      const list = toProductList(raw);
      if (list.length > 0) { prods = list; break; }
      await new Promise((r) => setTimeout(r, 400));
    }
    test.skip(prods.length === 0, 'Requires at least one product in the database');
    const p = prods[0];
    const items = [{
      product_id: p.id,
      description: p.name,
      product_code: p.sku,
      quantity: 1,
      unit_price: productPrice(p),
      line_total: productPrice(p),
    }];
    const subtotal = items[0].line_total;
    const vat = subtotal * 0.05;

    const { status, data } = await apiPost(
      '/api/invoices',
      {
        customer_id: customerId,
        invoice_date: invDate,
        status: 'Draft',
        tax_amount: vat.toFixed(2),
        total_amount: (subtotal + vat).toFixed(2),
        items,
      },
      cookie,
    );
    expect(status).toBe(201);
    const inv = data as ApiInvoice;
    invoiceId = inv.id;
    invoiceNumber = (inv as ApiInvoice & { invoice_number?: string }).invoice_number
      ?? (inv as unknown as { invoiceNumber?: string }).invoiceNumber!;
    expect(invoiceNumber).toBeTruthy();
  });

  test.afterAll(async () => {
    if (invoiceId) await apiDelete(`/api/invoices/${invoiceId}`, cookie);
    if (customerId) await apiDelete(`/api/customers/${customerId}`, cookie);
  });

  test('first upload to a fresh doc-bound key for a real invoice succeeds', async () => {
    const ts = Date.now();
    const key = `invoices/${invoiceYear}/${invoiceNumber}/${ts}-first.png`;
    const r = await uploadScan(cookie, key, PNG_BYTES);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { success?: boolean; key?: string };
    expect(body.success).toBe(true);
    expect(body.key).toBe(key);

    // Sanity: the storage_objects row must now exist (so the next test
    // exercises the new collision check, not the existence check).
    const row = await fetch(
      `${BASE_URL}/api/__test__/storage-object-row?key=${encodeURIComponent(key)}`,
      { headers: { Cookie: cookie } },
    ).then((rr) => rr.json() as Promise<{ exists: boolean }>);
    expect(row.exists).toBe(true);
  });

  test('repeating the upload to the same doc-bound key is rejected with 409', async () => {
    // Reconstruct the same key the previous test used. We pick a fixed
    // timestamp inside the test rather than reusing the prior random ts,
    // so this test stands alone if run in isolation: do a first upload,
    // then a second one to the same key, and assert only the second 409s.
    const ts = Date.now() + 1;
    const key = `invoices/${invoiceYear}/${invoiceNumber}/${ts}-overwrite.png`;

    const first = await uploadScan(cookie, key, PNG_BYTES);
    expect(first.status).toBe(200);

    const second = await uploadScan(cookie, key, PNG_BYTES);
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error?: string };
    expect(body.error).toBe('A scan already exists at that key. Use the replace flow.');
  });

  test('anonymous GRN staging collision (Task #353) is preserved with its original message', async () => {
    // Pin the year segment to the current year — the staging branch
    // requires it. Use a flat key (no folder) so the parser treats it as
    // an anonymous staging upload.
    const yr = new Date().getUTCFullYear();
    const ts = Date.now() + 2;
    const key = `goods-receipts/${yr}/${ts}-staged.png`;

    const first = await uploadScan(cookie, key, PNG_BYTES);
    expect(first.status).toBe(200);

    const second = await uploadScan(cookie, key, PNG_BYTES);
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error?: string };
    // Original #353 message — distinct from the doc-bound 409 above.
    expect(body.error).toBe('Storage key already in use');
  });
});
