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
