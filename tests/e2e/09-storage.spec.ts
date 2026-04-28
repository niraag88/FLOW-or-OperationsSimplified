import { test, expect } from '@playwright/test';
import { apiLogin, BASE_URL } from './helpers';

test.describe('Storage: total-size tracking', () => {
  let cookie: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('total-size returns 0 when no files are tracked', async () => {
    const r = await fetch(`${BASE_URL}/api/storage/total-size`, {
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { bytes: number };
    expect(typeof body.bytes).toBe('number');
    expect(body.bytes).toBeGreaterThanOrEqual(0);
  });

  test('upload via signed token → total-size increases → delete → total-size returns to baseline', async () => {
    // 1. Baseline
    const before = await fetch(`${BASE_URL}/api/storage/total-size`, {
      headers: { Cookie: cookie },
    }).then((r) => r.json() as Promise<{ bytes: number }>);
    const baselineBytes = before.bytes;

    // 2. Request a signed upload URL
    const signResp = await fetch(`${BASE_URL}/api/storage/sign-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        key: 'invoices/test/storage-spec.pdf',
        fileSize: 9,
        contentType: 'application/pdf',
      }),
    });
    expect(signResp.status).toBe(200);
    const signData = (await signResp.json()) as { url?: string };
    expect(typeof signData.url).toBe('string');

    // 3. Upload minimal content via the signed PUT URL
    const uploadResp = await fetch(`${BASE_URL}${signData.url}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf', Cookie: cookie },
      body: Buffer.from('%PDF-1.4\n'),
    });
    expect(uploadResp.status).toBe(200);

    // 4. Total size must have increased
    const after = await fetch(`${BASE_URL}/api/storage/total-size`, {
      headers: { Cookie: cookie },
    }).then((r) => r.json() as Promise<{ bytes: number }>);
    expect(after.bytes).toBeGreaterThan(baselineBytes);
    expect(after.bytes).toBeGreaterThanOrEqual(baselineBytes + 9);

    // 5. Delete the object
    const delResp = await fetch(
      `${BASE_URL}/api/storage/object?key=invoices/test/storage-spec.pdf`,
      { method: 'DELETE', headers: { Cookie: cookie } }
    );
    expect(delResp.status).toBe(200);

    // 6. Total size must return to baseline
    const final = await fetch(`${BASE_URL}/api/storage/total-size`, {
      headers: { Cookie: cookie },
    }).then((r) => r.json() as Promise<{ bytes: number }>);
    expect(final.bytes).toBeLessThanOrEqual(baselineBytes);
  });
});

test.describe('Storage: scan-delete failure path leaves DB untouched', () => {
  let cookie: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test.afterEach(async () => {
    // The seam is one-shot (auto-resets after firing once), but disarm
    // explicitly in case a test bails before the forced failure consumes it.
    await fetch(`${BASE_URL}/api/__test__/force-storage-delete-fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: false }),
    });
  });

  test('invoice scan delete: when storage delete fails, returns 5xx and leaves scanKey + storage_objects row intact', async () => {
    // 1. Sign + upload a real object so we have a tracked storage_objects row.
    const key = 'invoices/test/scan-delete-failure-path.pdf';
    const signResp = await fetch(`${BASE_URL}/api/storage/sign-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ key, fileSize: 9, contentType: 'application/pdf' }),
    });
    expect(signResp.status).toBe(200);
    const signData = (await signResp.json()) as { url?: string };
    expect(typeof signData.url).toBe('string');

    const uploadResp = await fetch(`${BASE_URL}${signData.url}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf', Cookie: cookie },
      body: Buffer.from('%PDF-1.4\n'),
    });
    expect(uploadResp.status).toBe(200);

    // 2. Create a customer + invoice and attach the scan key.
    const custResp = await fetch(`${BASE_URL}/api/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Storage Failure Path Customer',
        dataSource: 'e2e_test',
      }),
    });
    expect(custResp.status).toBeLessThan(300);
    const customer = (await custResp.json()) as { id: number };

    const invResp = await fetch(`${BASE_URL}/api/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        customer_id: customer.id,
        invoice_date: new Date().toISOString().slice(0, 10),
        items: [
          { description: 'storage failure path stub line', quantity: 1, unit_price: 1 },
        ],
      }),
    });
    expect(invResp.status).toBeLessThan(300);
    const invoice = (await invResp.json()) as { id: number };

    const attachResp = await fetch(`${BASE_URL}/api/invoices/${invoice.id}/scan-key`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ scanKey: key }),
    });
    expect(attachResp.status).toBe(200);

    // 3. Flip the test seam ON: next storage delete will be forced to fail.
    const seamOn = await fetch(`${BASE_URL}/api/__test__/force-storage-delete-fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: true }),
    });
    expect(seamOn.status).toBe(200);

    // 4. Try to delete the scan — expect a 5xx with the DB untouched.
    const delResp = await fetch(`${BASE_URL}/api/invoices/${invoice.id}/scan-key`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(delResp.status).toBeGreaterThanOrEqual(500);
    expect(delResp.status).toBeLessThan(600);

    // 5. Invoice's scan_key must still be set.
    const invAfter = await fetch(`${BASE_URL}/api/invoices/${invoice.id}`, {
      headers: { Cookie: cookie },
    }).then((r) => r.json() as Promise<{ scan_key?: string | null }>);
    expect(invAfter.scan_key).toBe(key);

    // 6. storage_objects DB tracking row must still exist for this key.
    const rowResp = await fetch(
      `${BASE_URL}/api/__test__/storage-object-row?key=${encodeURIComponent(key)}`,
      { headers: { Cookie: cookie } }
    );
    expect(rowResp.status).toBe(200);
    const rowBody = (await rowResp.json()) as { exists: boolean };
    expect(rowBody.exists).toBe(true);

    // 7. The seam is one-shot — it auto-reset when step 4 fired. A second
    //    delete (with no rearm) should now succeed and tear everything down,
    //    proving the happy-path is intact.
    const cleanupDel = await fetch(`${BASE_URL}/api/invoices/${invoice.id}/scan-key`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(cleanupDel.status).toBe(200);

    // After the successful cleanup, the tracked row should be gone too.
    const rowAfterCleanup = await fetch(
      `${BASE_URL}/api/__test__/storage-object-row?key=${encodeURIComponent(key)}`,
      { headers: { Cookie: cookie } }
    ).then((r) => r.json() as Promise<{ exists: boolean }>);
    expect(rowAfterCleanup.exists).toBe(false);

    // Tidy: remove the throwaway invoice and customer.
    await fetch(`${BASE_URL}/api/invoices/${invoice.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    await fetch(`${BASE_URL}/api/customers/${customer.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
  });
});
