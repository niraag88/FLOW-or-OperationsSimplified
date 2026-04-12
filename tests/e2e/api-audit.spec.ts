/**
 * API & Backend Code Audit Suite
 * Tests every API endpoint for: happy paths, failure paths, auth/role enforcement,
 * business logic correctness, and HTTP status code accuracy.
 *
 * Bugs found are annotated with BUG comments in the test body and collected
 * in the `bugs[]` array, printed to console at the end.
 * Documented (non-breaking) behaviours are collected in `notes[]`.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5000';

// ── Shared helpers ──────────────────────────────────────────────────────────

async function loginAs(username: string, password: string, retries = 3): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (resp.status === 429) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 5000 * attempt));
        continue;
      }
      throw new Error(`Login as ${username} rate-limited after ${retries} attempts`);
    }
    if (!resp.ok && resp.status !== 200) throw new Error(`Login as ${username} failed: ${resp.status}`);
    const cookie = resp.headers.get('set-cookie')?.split(';')[0] ?? '';
    if (!cookie) throw new Error(`Login as ${username} returned no session cookie`);
    return cookie;
  }
  throw new Error(`Login as ${username} failed after ${retries} attempts`);
}

async function api(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  cookie: string,
  body?: object,
): Promise<{ status: number; data: unknown; ms: number }> {
  const start = Date.now();
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = Date.now() - start;
  let data: unknown;
  try { data = await resp.json(); } catch { data = null; }
  return { status: resp.status, data, ms };
}

// Shared mutable ids — set during test runs, cleaned up at end
const IDs = {
  brand: 0,
  brand2: 0,
  product: 0,
  customer: 0,
  supplier: 0,
  po: 0,
  poItem: 0,
  grn: 0,
  quotation: 0,
  invoice: 0,
  viewerUserId: '',
};

const bugs: string[] = [];
const notes: string[] = [];
function bug(label: string) { bugs.push(label); }
function note(label: string) { notes.push(label); }

// ── Auth ────────────────────────────────────────────────────────────────────

test.describe('Auth', () => {
  test('login with valid credentials returns 200 + session cookie', async () => {
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    expect(resp.status).toBe(200);
    const cookie = resp.headers.get('set-cookie');
    expect(cookie).toBeTruthy();
    const data = await resp.json() as { user: { username: string } };
    expect(data.user?.username).toBe('admin');
  });

  test('login with wrong password returns 401', async () => {
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong_password_audit' }),
    });
    expect(resp.status).toBe(401);
  });

  test('login with missing password field returns 400', async () => {
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin' }),
    });
    expect(resp.status).toBe(400);
  });

  test('GET /api/auth/me with valid session returns user object', async () => {
    const cookie = await loginAs('admin', 'admin123');
    const { status, data } = await api('GET', '/api/auth/me', cookie);
    expect(status).toBe(200);
    const user = (data as { user?: { username: string } })?.user;
    expect(user?.username).toBe('admin');
    note('/api/auth/me is the correct session check endpoint (not /api/auth/user)');
  });

  test('GET /api/auth/me without session cookie returns 401', async () => {
    const { status } = await api('GET', '/api/auth/me', '');
    expect(status).toBe(401);
  });

  test('GET /api/auth/user (wrong endpoint) — documents that route does not exist as a JSON API', async () => {
    const cookie = await loginAs('admin', 'admin123');
    const resp = await fetch(`${BASE_URL}/api/auth/user`, {
      headers: { Cookie: cookie },
    });
    const ct = resp.headers.get('content-type') ?? '';
    // Falls through to SPA index.html (200 HTML) OR proper 404/401 from server
    if (resp.status === 200 && ct.includes('text/html')) {
      note('GET /api/auth/user: undefined route falls through to Vite SPA handler → 200 HTML. Server has no /api/* catch-all to return JSON 404. Correct path is /api/auth/me');
      test.info().annotations.push({ type: 'NOTE', description: 'Undefined /api/auth/user route falls through to Vite SPA (returns HTML 200). There is no server-level 404 catch-all for unknown /api/* routes.' });
    } else {
      expect([401, 404]).toContain(resp.status);
    }
  });

  test('logout invalidates session: subsequent /api/auth/me → 401', async () => {
    const cookie = await loginAs('admin', 'admin123');
    const logoutResp = await api('POST', '/api/auth/logout', cookie);
    expect(logoutResp.status).toBe(200);
    const afterLogout = await api('GET', '/api/auth/me', cookie);
    expect(afterLogout.status).toBe(401);
  });
});

// ── Users ───────────────────────────────────────────────────────────────────

test.describe('Users', () => {
  let adminCookie = '';
  let viewerCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
  });

  test('GET /api/users Admin sees all users in { users: [...] } shape', async () => {
    const { status, data } = await api('GET', '/api/users', adminCookie);
    expect(status).toBe(200);
    const users = (data as { users?: unknown[] })?.users;
    expect(Array.isArray(users)).toBe(true);
    expect(users!.length).toBeGreaterThan(0);
    note('GET /api/users returns { users: [...] } wrapped object (not a bare array)');
  });

  test('POST /api/users creates viewer user → 201', async () => {
    // Delete leftover from previous run first
    const { data: listData } = await api('GET', '/api/users', adminCookie);
    const existingList = ((listData as { users?: Array<{ id: string; username: string }> })?.users) ?? [];
    const existing = existingList.find(u => u.username === 'viewer_audit_test');
    if (existing) {
      await api('DELETE', `/api/users/${existing.id}`, adminCookie);
    }

    const { status, data } = await api('POST', '/api/users', adminCookie, {
      username: 'viewer_audit_test',
      password: 'Viewer123!',
      role: 'Staff',
      firstName: 'Audit',
      lastName: 'Viewer',
      email: 'viewer@audit.test',
    });
    expect(status).toBe(201);
    const user = (data as { user?: { id: string; username: string } })?.user;
    expect(user?.username).toBe('viewer_audit_test');
    IDs.viewerUserId = user?.id ?? '';
    expect(IDs.viewerUserId).toBeTruthy();
  });

  test('POST /api/users with missing username → 400', async () => {
    const { status } = await api('POST', '/api/users', adminCookie, {
      password: 'test123',
      role: 'Staff',
    });
    expect(status).toBe(400);
  });

  test('POST /api/users with duplicate username → 400 (not 409)', async () => {
    const { status } = await api('POST', '/api/users', adminCookie, {
      username: 'viewer_audit_test',
      password: 'other123',
      role: 'Staff',
    });
    expect([400, 409]).toContain(status);
    if (status === 400) {
      note('POST /api/users duplicate returns 400, not the conventional 409 Conflict');
    }
  });

  test('Viewer (Staff role) can login successfully', async () => {
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'viewer_audit_test', password: 'Viewer123!' }),
    });
    expect(resp.status).toBe(200);
    viewerCookie = resp.headers.get('set-cookie')!.split(';')[0];
    expect(viewerCookie).toBeTruthy();
  });

  test('GET /api/users by Viewer (Staff role) → 403', async () => {
    if (!viewerCookie) return;
    const { status } = await api('GET', '/api/users', viewerCookie);
    expect(status).toBe(403);
  });

  test('PUT /api/users/:id updates firstName → 200', async () => {
    if (!IDs.viewerUserId) return;
    const { status, data } = await api('PUT', `/api/users/${IDs.viewerUserId}`, adminCookie, {
      firstName: 'UpdatedAudit',
    });
    expect(status).toBe(200);
    const user = (data as { user?: { firstName: string } })?.user;
    expect(user?.firstName).toBe('UpdatedAudit');
  });

  test('PUT /api/users/:id with too-short password → 400', async () => {
    if (!IDs.viewerUserId) return;
    const { status } = await api('PUT', `/api/users/${IDs.viewerUserId}`, adminCookie, {
      password: 'abc',
    });
    expect(status).toBe(400);
  });

  test('DELETE /api/users/:id self-delete → 400', async () => {
    const meResp = await api('GET', '/api/auth/me', adminCookie);
    const adminId = ((meResp.data as { user?: { id: string } })?.user)?.id;
    if (!adminId) return;
    const { status } = await api('DELETE', `/api/users/${adminId}`, adminCookie);
    expect(status).toBe(400);
  });

  test('DELETE /api/users/:id non-existent ID → 404', async () => {
    const { status } = await api('DELETE', '/api/users/00000000-0000-0000-0000-000000000000', adminCookie);
    expect(status).toBe(404);
  });
});

// ── Company Settings ─────────────────────────────────────────────────────────

test.describe('Company Settings', () => {
  let adminCookie = '';
  let viewerCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
    viewerCookie = await loginAs('viewer_audit_test', 'Viewer123!').catch(() => '');
  });

  test('GET /api/company-settings → 200 with object, < 500ms', async () => {
    const { status, data, ms } = await api('GET', '/api/company-settings', adminCookie);
    expect(status).toBe(200);
    expect(typeof data).toBe('object');
    expect(ms).toBeLessThan(500);
  });

  test('PUT /api/company-settings updates companyName → 200, verified on subsequent GET', async () => {
    const { status } = await api('PUT', '/api/company-settings', adminCookie, {
      companyName: 'FLOW Audit Test Co',
      vatNumber: 'TRN100123456789012',
    });
    expect(status).toBe(200);
    const { data } = await api('GET', '/api/company-settings', adminCookie);
    const settings = data as { companyName?: string };
    expect(settings.companyName).toBe('FLOW Audit Test Co');
  });

  test('PUT /api/company-settings by Viewer (Staff) → 403', async () => {
    if (!viewerCookie) return;
    const { status } = await api('PUT', '/api/company-settings', viewerCookie, {
      companyName: 'Should Not Change',
    });
    expect(status).toBe(403);
  });

  test('GET /api/company-settings by Viewer (Staff) → 200 (read-only access)', async () => {
    if (!viewerCookie) return;
    const { status } = await api('GET', '/api/company-settings', viewerCookie);
    expect(status).toBe(200);
  });
});

// ── Brands ───────────────────────────────────────────────────────────────────

test.describe('Brands', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');

    // Step 1: Find audit brand IDs so we can match POs
    const brandsResp = await api('GET', '/api/brands', adminCookie);
    const allBrandsData = brandsResp.data as Array<{ id: number; name: string }>;
    const auditBrandIds = new Set<number>();
    if (Array.isArray(allBrandsData)) {
      for (const b of allBrandsData) {
        if (b.name?.startsWith('AuditBrand_')) auditBrandIds.add(b.id);
      }
    }

    // Step 2: Delete audit quotations (their items FK-reference the audit product)
    const quotationsResp = await api('GET', '/api/quotations', adminCookie);
    const quotationsList = quotationsResp.data as Array<{ id: number; customerName?: string; customer_name?: string }>;
    if (Array.isArray(quotationsList)) {
      for (const q of quotationsList) {
        const name = (q.customerName ?? q.customer_name ?? '').toLowerCase();
        if (name.includes('audit')) {
          await api('DELETE', `/api/quotations/${q.id}`, adminCookie);
        }
      }
    }

    // Step 3: Delete audit invoices (their items FK-reference the audit product)
    const invoicesResp = await api('GET', '/api/invoices', adminCookie);
    const invoicesList = invoicesResp.data as Array<{ id: number; customerName?: string; customer_name?: string }>;
    if (Array.isArray(invoicesList)) {
      for (const inv of invoicesList) {
        const name = (inv.customerName ?? inv.customer_name ?? '').toLowerCase();
        if (name.includes('audit')) {
          await api('DELETE', `/api/invoices/${inv.id}`, adminCookie);
        }
      }
    }

    // Step 4: Delete GRNs and POs that reference audit brands (POs FK-reference brands)
    if (auditBrandIds.size > 0) {
      const posResp = await api('GET', '/api/purchase-orders?pageSize=500', adminCookie);
      const posRaw = posResp.data as Array<{ id: number; brandId?: number; notes?: string }> | { data?: Array<{ id: number; brandId?: number; notes?: string }> };
      const posList = Array.isArray(posRaw) ? posRaw : ((posRaw as { data?: Array<{ id: number; brandId?: number; notes?: string }> }).data ?? []);
      if (Array.isArray(posList)) {
        for (const po of posList) {
          if (auditBrandIds.has(po.brandId ?? 0) || (po.notes ?? '').toLowerCase().includes('audit')) {
            // Delete GRNs for this PO first
            const grnsResp = await api('GET', `/api/goods-receipts?poId=${po.id}`, adminCookie);
            const grns = grnsResp.data as Array<{ id: number }>;
            if (Array.isArray(grns)) {
              for (const grn of grns) {
                await api('DELETE', `/api/goods-receipts/${grn.id}`, adminCookie);
              }
            }
            // Then delete the PO
            await api('DELETE', `/api/purchase-orders/${po.id}`, adminCookie);
          }
        }
      }
    }

    // Step 5: Delete any leftover audit products (they FK-reference brands)
    const pResp = await api('GET', '/api/products?search=Audit', adminCookie);
    const pData = pResp.data as Array<{ id: number; sku?: string }> | { data?: Array<{ id: number; sku?: string }> };
    const pList = Array.isArray(pData) ? pData : ((pData as { data?: Array<{ id: number; sku?: string }> }).data ?? []);
    for (const p of pList) {
      if ((p.sku ?? '').startsWith('AUDIT-') || (p.sku ?? '') === 'BULKAUDIT001' || (p.sku ?? '').startsWith('VIEWER-')) {
        await api('DELETE', `/api/products/${p.id}`, adminCookie);
      }
    }

    // Step 4: Now delete ALL leftover audit brands from previous runs (brand names are UNIQUE)
    const freshBrandsResp = await api('GET', '/api/brands', adminCookie);
    const freshBrands = freshBrandsResp.data as Array<{ id: number; name: string }>;
    if (Array.isArray(freshBrands)) {
      for (const b of freshBrands) {
        if (b.name?.startsWith('AuditBrand_')) {
          await api('DELETE', `/api/brands/${b.id}`, adminCookie);
        }
      }
    }
  });

  test('POST /api/brands create primary brand → 201', async () => {
    const { status, data } = await api('POST', '/api/brands', adminCookie, {
      name: 'AuditBrand_Primary',
      description: 'Brand for API audit tests',
    });
    expect(status).toBe(201);
    IDs.brand = (data as { id: number }).id;
    expect(IDs.brand).toBeGreaterThan(0);
  });

  test('POST /api/brands create secondary brand → 201', async () => {
    const { status, data } = await api('POST', '/api/brands', adminCookie, {
      name: 'AuditBrand_Secondary',
    });
    expect(status).toBe(201);
    IDs.brand2 = (data as { id: number }).id;
  });

  test('POST /api/brands with missing required name → not 200', async () => {
    const { status } = await api('POST', '/api/brands', adminCookie, {
      description: 'No name field',
    });
    if (status === 500) {
      bug('POST /api/brands: missing "name" returns 500 — Zod validation error not caught as 400');
      test.info().annotations.push({ type: 'BUG', description: 'POST /api/brands with missing required field returns 500 instead of 400. Zod parse error is uncaught.' });
    }
    expect([400, 422, 500]).toContain(status);
  });

  test('GET /api/brands list → 200 array, < 500ms', async () => {
    const { status, data, ms } = await api('GET', '/api/brands', adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(ms).toBeLessThan(500);
  });

  test('PUT /api/brands/:id update name → 200, name changed', async () => {
    if (!IDs.brand) return;
    const { status, data } = await api('PUT', `/api/brands/${IDs.brand}`, adminCookie, {
      name: 'AuditBrand_Primary_Updated',
    });
    expect(status).toBe(200);
    expect((data as { name: string }).name).toBe('AuditBrand_Primary_Updated');
  });

  test('GET /api/brands/:id (non-existent) — documents route behaviour', async () => {
    const resp = await fetch(`${BASE_URL}/api/brands/999999`, {
      headers: { Cookie: adminCookie },
    });
    const ct = resp.headers.get('content-type') ?? '';
    if (resp.status === 200 && ct.includes('text/html')) {
      bug('GET /api/brands/:id does not exist as a route — falls through to SPA (200 HTML). There is no individual brand retrieval endpoint; only GET /api/brands (list all)');
      test.info().annotations.push({ type: 'BUG', description: 'GET /api/brands/:id route does not exist — unknown /api/* paths fall through to the SPA returning HTML with 200 status.' });
    } else {
      expect(resp.status).toBe(404);
    }
  });

  test('DELETE /api/brands/:id (unused brand) → 200', async () => {
    if (!IDs.brand2) return;
    const { status } = await api('DELETE', `/api/brands/${IDs.brand2}`, adminCookie);
    expect(status).toBe(200);
    IDs.brand2 = 0;
  });
});

// ── Products ──────────────────────────────────────────────────────────────────

test.describe('Products', () => {
  let adminCookie = '';
  let viewerCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
    viewerCookie = await loginAs('viewer_audit_test', 'Viewer123!').catch(() => '');
    // Clean up any leftover audit test products from previous runs
    const productsResp = await api('GET', '/api/products?search=Audit', adminCookie);
    const pData = productsResp.data as Array<{ id: number; sku?: string; name?: string }> | { data?: Array<{ id: number; sku?: string; name?: string }> };
    const pList = Array.isArray(pData) ? pData : ((pData as { data?: Array<{ id: number; sku?: string; name?: string }> }).data ?? []);
    for (const p of pList) {
      if ((p.sku ?? '').startsWith('AUDIT-') || (p.sku ?? '') === 'BULKAUDIT001' || (p.name ?? '').includes('Bulk Audit')) {
        await api('DELETE', `/api/products/${p.id}`, adminCookie);
      }
    }
  });

  test('POST /api/products create with all fields → 201', async () => {
    if (!IDs.brand) return;
    const { status, data } = await api('POST', '/api/products', adminCookie, {
      sku: 'AUDIT-SKU-001',
      name: 'Audit Test Product',
      brandId: IDs.brand,
      unitPrice: '99.00',
      costPrice: '50.00',
      costPriceCurrency: 'AED',
      stockQuantity: 0,
    });
    expect(status).toBe(201);
    IDs.product = (data as { id: number }).id;
    expect(IDs.product).toBeGreaterThan(0);
  });

  test('POST /api/products with missing unitPrice → not 200', async () => {
    if (!IDs.brand) return;
    const { status } = await api('POST', '/api/products', adminCookie, {
      sku: 'AUDIT-SKU-BAD',
      name: 'Bad Product',
      brandId: IDs.brand,
    });
    if (status === 500) {
      bug('POST /api/products: missing required fields returns 500 — Zod parse error not caught as 400');
      test.info().annotations.push({ type: 'BUG', description: 'POST /api/products with missing required fields returns 500 instead of 400.' });
    }
    expect([400, 422, 500]).toContain(status);
  });

  test('POST /api/products by Viewer (Staff) — documents role restriction', async () => {
    if (!viewerCookie || !IDs.brand) return;
    const { status, data } = await api('POST', '/api/products', viewerCookie, {
      sku: 'AUDIT-VIEWER-SKU',
      name: 'Viewer Product',
      brandId: IDs.brand,
      unitPrice: '10.00',
    });
    if (status === 201 || status === 200) {
      note('POST /api/products has NO role restriction — Staff/Viewer users can create products');
      test.info().annotations.push({ type: 'NOTE', description: 'POST /api/products allows any authenticated user (no Admin/Manager restriction).' });
      const vpId = (data as { id?: number }).id;
      if (vpId) await api('DELETE', `/api/products/${vpId}`, adminCookie);
    }
  });

  test('GET /api/products list → 200, < 500ms', async () => {
    const { status, ms } = await api('GET', '/api/products', adminCookie);
    expect(status).toBe(200);
    expect(ms).toBeLessThan(500);
  });

  test('GET /api/products with search param returns results', async () => {
    const { status } = await api('GET', '/api/products?search=Audit+Test+Product', adminCookie);
    expect(status).toBe(200);
  });

  test('GET /api/products/:id → 200 with product data', async () => {
    if (!IDs.product) return;
    const { status, data } = await api('GET', `/api/products/${IDs.product}`, adminCookie);
    expect(status).toBe(200);
    const product = data as { id: number; name: string };
    expect(product.id).toBe(IDs.product);
  });

  test('GET /api/products/:id non-existent → 404', async () => {
    const { status } = await api('GET', '/api/products/999999', adminCookie);
    expect(status).toBe(404);
  });

  test('PUT /api/products/:id update costPriceCurrency → 200', async () => {
    if (!IDs.product) return;
    const { status, data } = await api('PUT', `/api/products/${IDs.product}`, adminCookie, {
      costPrice: '60.00',
      costPriceCurrency: 'GBP',
    });
    expect(status).toBe(200);
    const updated = data as { costPriceCurrency?: string };
    expect(updated.costPriceCurrency).toBe('GBP');
  });

  test('POST /api/products/bulk import with valid row → created: 1', async () => {
    if (!IDs.brand) return;
    const brandResp = await api('GET', '/api/brands', adminCookie);
    const brands = brandResp.data as Array<{ id: number; name: string }>;
    const auditBrand = brands.find(b => b.name === 'AuditBrand_Primary_Updated');
    if (!auditBrand) return;

    const { status, data } = await api('POST', '/api/products/bulk', adminCookie, {
      rows: [
        {
          brandName: auditBrand.name,
          productCode: 'BULKAUDIT001',
          productName: 'Bulk Audit Product 1',
          salePrice: '25.00',
          purchasePrice: '10.00',
          purchasePriceCurrency: 'AED',
        },
      ],
    });
    expect([200, 201]).toContain(status);
    const result = data as { created?: number };
    expect(result.created).toBe(1);
    note('Bulk import endpoint is POST /api/products/bulk (not /api/products/bulk-import)');
    note('[BUG] Bulk import SKU validation rejects hyphens — /^[A-Za-z0-9]{1,50}$/ disallows common SKU formats like "BULK-001"');
  });

  test('POST /api/products/bulk import with empty rows → 400', async () => {
    const { status } = await api('POST', '/api/products/bulk', adminCookie, { rows: [] });
    expect(status).toBe(400);
  });

  test('GET /api/products/bulk-template returns xlsx file', async () => {
    const resp = await fetch(`${BASE_URL}/api/products/bulk-template`, {
      headers: { Cookie: adminCookie },
    });
    expect(resp.status).toBe(200);
    const ct = resp.headers.get('content-type') ?? '';
    expect(ct).toContain('spreadsheet');
  });

  test('GET /api/products without auth → 401', async () => {
    const { status } = await api('GET', '/api/products', '');
    expect(status).toBe(401);
  });
});

// ── Customers ──────────────────────────────────────────────────────────────────

test.describe('Customers', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
  });

  test('POST /api/customers create with all fields → 201', async () => {
    const { status, data } = await api('POST', '/api/customers', adminCookie, {
      name: 'Audit Customer LLC',
      contactPerson: 'Test Contact',
      email: 'audit@customer.ae',
      phone: '+971501234567',
      billingAddress: '123 Test St, Dubai, UAE',
      vatNumber: 'TRN999888777666555',
      vatTreatment: 'Local',
    });
    expect(status).toBe(201);
    IDs.customer = (data as { id: number }).id;
    expect(IDs.customer).toBeGreaterThan(0);
  });

  test('POST /api/customers missing required name → not 200', async () => {
    const { status } = await api('POST', '/api/customers', adminCookie, {
      email: 'noname@test.ae',
    });
    if (status === 500) {
      bug('POST /api/customers: missing "name" returns 500 — Zod parse error not caught as 400');
      test.info().annotations.push({ type: 'BUG', description: 'POST /api/customers with missing required "name" field returns 500 instead of 400.' });
    }
    expect([400, 422, 500]).toContain(status);
  });

  test('GET /api/customers → 200', async () => {
    const { status } = await api('GET', '/api/customers', adminCookie);
    expect(status).toBe(200);
  });

  test('GET /api/customers?search=Audit → filtered results', async () => {
    const { status, data } = await api('GET', '/api/customers?search=Audit', adminCookie);
    expect(status).toBe(200);
  });

  test('PUT /api/customers/:id update → 200', async () => {
    if (!IDs.customer) return;
    const { status } = await api('PUT', `/api/customers/${IDs.customer}`, adminCookie, {
      name: 'Audit Customer LLC Updated',
      phone: '+971509999999',
    });
    expect(status).toBe(200);
  });

  test('GET /api/customers/:id non-existent — documents route behaviour', async () => {
    const resp = await fetch(`${BASE_URL}/api/customers/999999`, {
      headers: { Cookie: adminCookie },
    });
    const ct = resp.headers.get('content-type') ?? '';
    if (resp.status === 200 && ct.includes('text/html')) {
      note('GET /api/customers/:id: undefined numeric ID falls through to SPA (no individual customer GET route). Only GET /api/customers?search= exists.');
    } else {
      expect(resp.status).toBe(404);
    }
  });
});

// ── Suppliers ──────────────────────────────────────────────────────────────────

test.describe('Suppliers', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
  });

  test('POST /api/suppliers create with all fields → 201', async () => {
    const { status, data } = await api('POST', '/api/suppliers', adminCookie, {
      name: 'Audit Supplier Ltd',
      contactPerson: 'Supplier Contact',
      email: 'supplier@audit.test',
      phone: '+441234567890',
      address: '1 London St, UK',
    });
    expect(status).toBe(201);
    IDs.supplier = (data as { id: number }).id;
    expect(IDs.supplier).toBeGreaterThan(0);
  });

  test('POST /api/suppliers missing name → not 200', async () => {
    const { status } = await api('POST', '/api/suppliers', adminCookie, {
      email: 'noname@supplier.test',
    });
    if (status === 500) {
      bug('POST /api/suppliers: missing "name" returns 500 — Zod parse error not caught as 400');
      test.info().annotations.push({ type: 'BUG', description: 'POST /api/suppliers with missing required "name" returns 500 instead of 400.' });
    }
    expect([400, 422, 500]).toContain(status);
  });

  test('GET /api/suppliers → 200 array', async () => {
    const { status, data } = await api('GET', '/api/suppliers', adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET /api/suppliers without auth → 401', async () => {
    const { status } = await api('GET', '/api/suppliers', '');
    expect(status).toBe(401);
  });

  test('PUT /api/suppliers/:id update → 200', async () => {
    if (!IDs.supplier) return;
    const { status } = await api('PUT', `/api/suppliers/${IDs.supplier}`, adminCookie, {
      name: 'Audit Supplier Ltd Updated',
    });
    expect(status).toBe(200);
  });
});

// ── Purchase Orders ────────────────────────────────────────────────────────────

test.describe('Purchase Orders', () => {
  let adminCookie = '';
  let viewerCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
    viewerCookie = await loginAs('viewer_audit_test', 'Viewer123!').catch(() => '');
  });

  test('POST /api/purchase-orders create with items → 201', async () => {
    if (!IDs.supplier || !IDs.product || !IDs.brand) return;
    const { status, data } = await api('POST', '/api/purchase-orders', adminCookie, {
      supplierId: IDs.supplier,
      brandId: IDs.brand,
      currency: 'AED',
      fxRateToAed: '1.0000',
      notes: 'API audit test PO',
      orderDate: '2026-04-12',
      items: [
        {
          productId: IDs.product,
          productName: 'Audit Test Product',
          quantity: 10,
          unitPrice: '50.00',
          lineTotal: '500.00',
        },
      ],
    });
    expect(status).toBe(201);
    IDs.po = (data as { id: number }).id;
    expect(IDs.po).toBeGreaterThan(0);
  });

  test('POST /api/purchase-orders by Viewer (Staff) → 403', async () => {
    if (!viewerCookie || !IDs.supplier || !IDs.brand) return;
    const { status } = await api('POST', '/api/purchase-orders', viewerCookie, {
      supplierId: IDs.supplier,
      brandId: IDs.brand,
      currency: 'AED',
      items: [],
    });
    expect(status).toBe(403);
  });

  test('GET /api/purchase-orders → 200, < 500ms', async () => {
    const { status, ms } = await api('GET', '/api/purchase-orders', adminCookie);
    expect(status).toBe(200);
    expect(ms).toBeLessThan(500);
  });

  test('GET /api/purchase-orders by Viewer (Staff) → 403', async () => {
    if (!viewerCookie) return;
    const { status } = await api('GET', '/api/purchase-orders', viewerCookie);
    expect(status).toBe(403);
  });

  test('GET /api/purchase-orders without auth → 401', async () => {
    const { status } = await api('GET', '/api/purchase-orders', '');
    expect(status).toBe(401);
  });

  test('GET /api/purchase-orders/:id/items → 200 array; capture first item ID', async () => {
    if (!IDs.po) return;
    const { status, data } = await api('GET', `/api/purchase-orders/${IDs.po}/items`, adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const items = data as Array<{ id: number }>;
    if (items.length > 0) IDs.poItem = items[0].id;
  });

  test('GET /api/purchase-orders/:id/detail → 200 with status field', async () => {
    if (!IDs.po) return;
    const { status, data } = await api('GET', `/api/purchase-orders/${IDs.po}/detail`, adminCookie);
    expect(status).toBe(200);
    const detail = data as { status?: string };
    note(`PO created with status: "${detail.status}" (no draft→submitted transition for POs)`);
    test.info().annotations.push({ type: 'NOTE', description: `PO default status is "${detail.status}" — POs have no draft state; they are submitted immediately on creation. Only submitted↔closed transitions exist.` });
  });

  test('POST /api/purchase-orders with fxRateToAed as number → 500 (BUG: should coerce)', async () => {
    if (!IDs.supplier || !IDs.brand) return;
    const { status, data } = await api('POST', '/api/purchase-orders', adminCookie, {
      supplierId: IDs.supplier,
      brandId: IDs.brand,
      currency: 'AED',
      fxRateToAed: 1,
      items: [],
    });
    if (status === 500) {
      bug('POST /api/purchase-orders: fxRateToAed sent as JS number returns 500 — Zod decimal schema expects string; server should coerce number → string before validation');
      test.info().annotations.push({ type: 'BUG', description: 'POST /api/purchase-orders with fxRateToAed: 1 (number) returns 500. Drizzle decimal Zod schema expects a string; clients naturally send numbers. Server should coerce.' });
    } else {
      note(`POST /api/purchase-orders fxRateToAed:1 (number) → ${status} (server coerces correctly)`);
      const tempPoId = (data as { id?: number }).id;
      if (tempPoId) await api('DELETE', `/api/purchase-orders/${tempPoId}`, adminCookie);
    }
    expect([201, 400, 500]).toContain(status);
  });

  test('POST /api/purchase-orders with negative unit price — documents behaviour', async () => {
    if (!IDs.supplier || !IDs.brand || !IDs.product) return;
    const { status, data } = await api('POST', '/api/purchase-orders', adminCookie, {
      supplierId: IDs.supplier,
      brandId: IDs.brand,
      currency: 'AED',
      items: [
        {
          productId: IDs.product,
          productName: 'Audit Test Product',
          quantity: 1,
          unitPrice: '-10.00',
          lineTotal: '-10.00',
        },
      ],
    });
    if (status === 201) {
      bug('POST /api/purchase-orders: negative unitPrice silently accepted (should be rejected with 400)');
      test.info().annotations.push({ type: 'BUG', description: 'POST /api/purchase-orders accepts negative unitPrice (no validation). Negative prices should return 400.' });
      const badPoId = (data as { id?: number }).id;
      if (badPoId) await api('DELETE', `/api/purchase-orders/${badPoId}`, adminCookie);
    } else {
      note(`POST /api/purchase-orders negative unitPrice → ${status} (validated)`);
    }
  });

  test('DELETE /api/purchase-orders/:id with no GRNs — documents status restriction', async () => {
    if (!IDs.supplier || !IDs.brand) return;
    const createResp = await api('POST', '/api/purchase-orders', adminCookie, {
      supplierId: IDs.supplier,
      brandId: IDs.brand,
      currency: 'AED',
      items: [],
    });
    const tempPoId = (createResp.data as { id: number }).id;
    const { status } = await api('DELETE', `/api/purchase-orders/${tempPoId}`, adminCookie);
    if (status === 200) {
      note('DELETE /api/purchase-orders/:id: submitted PO with no GRNs CAN be deleted — no status restriction, only GRN-linked POs are blocked');
    }
  });
});

// ── Goods Receipts ─────────────────────────────────────────────────────────────

test.describe('GRNs (Goods Receipts)', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
  });

  test('POST /api/goods-receipts create for submitted PO → 201', async () => {
    if (!IDs.po || !IDs.poItem || !IDs.product) return;
    const { status, data } = await api('POST', '/api/goods-receipts', adminCookie, {
      poId: IDs.po,
      receivedDate: '2026-04-12',
      referenceNumber: 'INV-AUDIT-001',
      referenceDate: '2026-04-11',
      notes: 'API audit GRN',
      items: [
        {
          poItemId: IDs.poItem,
          productId: IDs.product,
          orderedQuantity: 10,
          receivedQuantity: 10,
          unitPrice: '50.00',
        },
      ],
    });
    expect([200, 201]).toContain(status);
    if (status === 201 || status === 200) {
      IDs.grn = (data as { id: number }).id;
    }
  });

  test('POST /api/goods-receipts over-receive → 400 with error message', async () => {
    if (!IDs.po || !IDs.poItem || !IDs.product) return;
    const { status, data } = await api('POST', '/api/goods-receipts', adminCookie, {
      poId: IDs.po,
      receivedDate: '2026-04-12',
      items: [
        {
          poItemId: IDs.poItem,
          productId: IDs.product,
          orderedQuantity: 10,
          receivedQuantity: 999,
          unitPrice: '50.00',
        },
      ],
    });
    if (status !== 400) {
      bug(`GRN over-receive returned ${status} instead of 400 — should reject receivedQuantity > orderedQuantity`);
      test.info().annotations.push({ type: 'BUG', description: `POST /api/goods-receipts over-receive returned ${status} instead of expected 400.` });
    }
    expect(status).toBe(400);
  });

  test('PATCH /api/goods-receipts/:id/payment paid + paymentMadeDate → 200, status confirmed', async () => {
    if (!IDs.grn) return;
    const { status, data } = await api('PATCH', `/api/goods-receipts/${IDs.grn}/payment`, adminCookie, {
      paymentStatus: 'paid',
      paymentMadeDate: '2026-04-12',
      paymentRemarks: 'Bank transfer — audit test',
    });
    expect(status).toBe(200);
    const updated = data as { paymentStatus?: string };
    expect(updated.paymentStatus).toBe('paid');
  });

  test('PATCH /api/goods-receipts/:id/payment invalid paymentStatus value → 400', async () => {
    if (!IDs.grn) return;
    const { status } = await api('PATCH', `/api/goods-receipts/${IDs.grn}/payment`, adminCookie, {
      paymentStatus: 'partially_paid',
    });
    expect(status).toBe(400);
  });

  test('PATCH /api/goods-receipts/:id/reference update referenceNumber → 200', async () => {
    if (!IDs.grn) return;
    const { status } = await api('PATCH', `/api/goods-receipts/${IDs.grn}/reference`, adminCookie, {
      referenceNumber: 'INV-AUDIT-001-UPDATED',
      referenceDate: '2026-04-12',
    });
    expect(status).toBe(200);
  });

  test('GET /api/goods-receipts → 200 array', async () => {
    const { status, data } = await api('GET', '/api/goods-receipts', adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET /api/goods-receipts without auth → 401', async () => {
    const { status } = await api('GET', '/api/goods-receipts', '');
    expect(status).toBe(401);
  });

  test('POST /api/goods-receipts for a fully-received+closed PO → 400 rejection', async () => {
    if (!IDs.po) return;
    const detailResp = await api('GET', `/api/purchase-orders/${IDs.po}/detail`, adminCookie);
    const detail = detailResp.data as { status?: string };
    if (detail.status !== 'closed') {
      note(`PO status is "${detail.status}" after full GRN — may auto-close or stay submitted`);
      return;
    }
    const { status } = await api('POST', '/api/goods-receipts', adminCookie, {
      poId: IDs.po,
      receivedDate: '2026-04-13',
      items: [
        {
          poItemId: IDs.poItem,
          productId: IDs.product,
          orderedQuantity: 10,
          receivedQuantity: 1,
          unitPrice: '50.00',
        },
      ],
    });
    if (status !== 400) {
      bug(`GRN creation on closed PO returned ${status} instead of 400 — closed POs should reject new GRNs`);
      test.info().annotations.push({ type: 'BUG', description: `GRN on closed PO returned ${status} (expected 400).` });
    }
    expect(status).toBe(400);
  });
});

// ── Quotations ─────────────────────────────────────────────────────────────────

test.describe('Quotations', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
  });

  test('POST /api/quotations create with items → 201', async () => {
    if (!IDs.customer || !IDs.product) return;
    const { status, data } = await api('POST', '/api/quotations', adminCookie, {
      customerId: IDs.customer,
      customerName: 'Audit Customer LLC Updated',
      quoteDate: '2026-04-12',
      validUntil: '2026-05-12',
      status: 'draft',
      items: [
        {
          product_id: IDs.product,
          quantity: 5,
          unit_price: 99.0,
          discount: 0,
          vat_rate: 0.05,
          line_total: 495.0,
        },
      ],
    });
    expect(status).toBe(201);
    IDs.quotation = (data as { id: number }).id;
    expect(IDs.quotation).toBeGreaterThan(0);
  });

  test('POST /api/quotations without customerId — documents whether validation exists', async () => {
    const { status } = await api('POST', '/api/quotations', adminCookie, {
      quoteDate: '2026-04-12',
      status: 'draft',
      items: [],
    });
    if (status === 201 || status === 200) {
      bug('POST /api/quotations: missing customerId is not validated — quotation created without a customer');
      test.info().annotations.push({ type: 'BUG', description: 'POST /api/quotations without customerId returns 201 — no validation enforces that a customer is required.' });
    } else {
      note(`POST /api/quotations without customerId returns ${status} (validated)`);
    }
  });

  test('GET /api/quotations → 200', async () => {
    const { status } = await api('GET', '/api/quotations', adminCookie);
    expect(status).toBe(200);
  });

  test('GET /api/quotations/:id → 200 with quotation data', async () => {
    if (!IDs.quotation) return;
    const { status, data } = await api('GET', `/api/quotations/${IDs.quotation}`, adminCookie);
    expect(status).toBe(200);
    const qt = data as { quoteNumber?: string };
    expect(qt.quoteNumber).toBeTruthy();
  });

  test('PUT /api/quotations/:id draft→submitted → 200', async () => {
    if (!IDs.quotation) return;
    const { status } = await api('PUT', `/api/quotations/${IDs.quotation}`, adminCookie, {
      status: 'submitted',
    });
    expect(status).toBe(200);
  });

  test('PUT /api/quotations/:id submitted→cancelled → 200', async () => {
    if (!IDs.quotation) return;
    const { status } = await api('PUT', `/api/quotations/${IDs.quotation}`, adminCookie, {
      status: 'cancelled',
    });
    expect(status).toBe(200);
  });

  test('PUT /api/quotations/:id cancelled→submitted (backwards) — documents transition enforcement', async () => {
    if (!IDs.quotation) return;
    const { status } = await api('PUT', `/api/quotations/${IDs.quotation}`, adminCookie, {
      status: 'submitted',
    });
    if (status === 200) {
      note('PUT /api/quotations/:id: no status transition enforcement — cancelled→submitted is allowed');
      test.info().annotations.push({ type: 'NOTE', description: 'Quotation backwards status transitions (cancelled→submitted) are not restricted.' });
    }
  });

  test('DELETE /api/quotations/:id → 200 (moves to recycle bin regardless of status)', async () => {
    if (!IDs.quotation) return;
    const { status } = await api('DELETE', `/api/quotations/${IDs.quotation}`, adminCookie);
    expect(status).toBe(200);
    note('DELETE /api/quotations/:id: no status restriction — any status quotation can be deleted (moves to recycle bin)');
    IDs.quotation = 0;
  });
});

// ── Invoices ────────────────────────────────────────────────────────────────────

test.describe('Invoices', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
  });

  test('POST /api/invoices create with items → 201', async () => {
    if (!IDs.customer || !IDs.product) return;
    const { status, data } = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      total_amount: 519.75,
      tax_amount: 24.75,
      currency: 'AED',
      items: [
        {
          product_id: IDs.product,
          product_name: 'Audit Test Product',
          product_code: 'AUDIT-SKU-001',
          description: 'Audit invoice item',
          quantity: 5,
          unit_price: 99.0,
          line_total: 495.0,
        },
      ],
    });
    expect(status).toBe(201);
    IDs.invoice = (data as { id: number }).id;
    expect(IDs.invoice).toBeGreaterThan(0);
  });

  test('POST /api/invoices missing customer_id → 400 (validation enforced)', async () => {
    const { status } = await api('POST', '/api/invoices', adminCookie, {
      invoice_date: '2026-04-12',
      status: 'draft',
      total_amount: 100,
      items: [],
    });
    expect(status).toBe(400);
    note('POST /api/invoices correctly rejects missing customer_id with 400');
  });

  test('GET /api/invoices → 200', async () => {
    const { status } = await api('GET', '/api/invoices', adminCookie);
    expect(status).toBe(200);
  });

  test('GET /api/invoices/:id → 200 with invoice_number and items', async () => {
    if (!IDs.invoice) return;
    const { status, data } = await api('GET', `/api/invoices/${IDs.invoice}`, adminCookie);
    expect(status).toBe(200);
    const inv = data as { invoice_number?: string; items?: unknown[] };
    expect(inv.invoice_number).toBeTruthy();
    expect(Array.isArray(inv.items)).toBe(true);
  });

  test('GET /api/invoices without auth → 401', async () => {
    const { status } = await api('GET', '/api/invoices', '');
    expect(status).toBe(401);
  });

  test('PATCH /api/invoices/:id/payment paid + paymentReceivedDate → 200', async () => {
    if (!IDs.invoice) return;
    await api('PUT', `/api/invoices/${IDs.invoice}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'submitted',
      total_amount: 519.75,
      tax_amount: 24.75,
      items: [],
    });
    const { status, data } = await api('PATCH', `/api/invoices/${IDs.invoice}/payment`, adminCookie, {
      paymentStatus: 'paid',
      paymentReceivedDate: '2026-04-12',
      paymentRemarks: 'Bank transfer — API audit',
    });
    expect(status).toBe(200);
    const updated = data as { paymentStatus?: string };
    expect(updated.paymentStatus).toBe('paid');
  });

  test('PATCH /api/invoices/:id/payment invalid paymentStatus → 400', async () => {
    if (!IDs.invoice) return;
    const { status } = await api('PATCH', `/api/invoices/${IDs.invoice}/payment`, adminCookie, {
      paymentStatus: 'partially_paid',
    });
    expect(status).toBe(400);
  });

  test('PATCH /api/invoices/:id/payment paid without date → 400', async () => {
    if (!IDs.invoice) return;
    const { status } = await api('PATCH', `/api/invoices/${IDs.invoice}/payment`, adminCookie, {
      paymentStatus: 'paid',
    });
    expect(status).toBe(400);
  });

  test('PATCH /api/invoices/:id/scan-key attach key → 200', async () => {
    if (!IDs.invoice) return;
    const { status } = await api('PATCH', `/api/invoices/${IDs.invoice}/scan-key`, adminCookie, {
      scanKey: 'invoices/2026/test-audit-scan.pdf',
    });
    expect(status).toBe(200);
  });

  test('DELETE /api/invoices/:id — documents whether route exists', async () => {
    if (!IDs.invoice) return;
    const { status } = await api('DELETE', `/api/invoices/${IDs.invoice}`, adminCookie);
    if (status === 404 || status === 405) {
      note('DELETE /api/invoices/:id does not exist — invoices cannot be directly deleted; use status transitions');
    }
  });
});

// ── Delivery Orders ────────────────────────────────────────────────────────────

test.describe('Delivery Orders', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
  });

  test('POST /api/delivery-orders create with items → 201', async () => {
    if (!IDs.customer || !IDs.product) return;
    const { status, data } = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      order_date: '2026-04-12',
      status: 'draft',
      subtotal: 495.0,
      tax_amount: 0,
      total_amount: 495.0,
      currency: 'AED',
      items: [
        {
          product_id: IDs.product,
          product_name: 'Audit Test Product',
          product_code: 'AUDIT-SKU-001',
          description: 'Audit DO item',
          quantity: 5,
          unit_price: 99.0,
          line_total: 495.0,
        },
      ],
    });
    expect(status).toBe(201);
    const doId = (data as { id: number }).id;
    expect(doId).toBeGreaterThan(0);

    // Advance through lifecycle then delete
    await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, { customer_id: IDs.customer, status: 'submitted', total_amount: 495.0, items: [] });
    await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, { customer_id: IDs.customer, status: 'delivered', total_amount: 495.0, items: [] });
    const { status: delStatus } = await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
    note('DELETE /api/delivery-orders/:id: no status restriction — delivered DOs can be moved to recycle bin');
    expect(delStatus).toBe(200);
  });

  test('GET /api/delivery-orders → 200', async () => {
    const { status } = await api('GET', '/api/delivery-orders', adminCookie);
    expect(status).toBe(200);
  });

  test('GET /api/delivery-orders without auth → 401', async () => {
    const { status } = await api('GET', '/api/delivery-orders', '');
    expect(status).toBe(401);
  });

  test('PATCH /api/delivery-orders/:id/scan-key → 200', async () => {
    if (!IDs.customer) return;
    const createResp = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      total_amount: 0,
      items: [],
    });
    const tempDoId = (createResp.data as { id: number }).id;
    const { status } = await api('PATCH', `/api/delivery-orders/${tempDoId}/scan-key`, adminCookie, {
      scanKey: 'delivery/2026/test-scan.pdf',
    });
    expect(status).toBe(200);
    await api('DELETE', `/api/delivery-orders/${tempDoId}`, adminCookie);
  });
});

// ── Inventory & Stock ──────────────────────────────────────────────────────────

test.describe('Inventory', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
  });

  test('GET /api/dashboard → 200 with data, < 500ms', async () => {
    const { status, ms } = await api('GET', '/api/dashboard', adminCookie);
    expect(status).toBe(200);
    expect(ms).toBeLessThan(500);
    note('Inventory dashboard: GET /api/dashboard (not /api/inventory/dashboard)');
  });

  test('GET /api/stock-movements → 200 array, < 500ms', async () => {
    const { status, data, ms } = await api('GET', '/api/stock-movements', adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(ms).toBeLessThan(500);
    note('Stock movements: GET /api/stock-movements (not /api/inventory/movements)');
  });

  test('GET /api/stock-counts → 200', async () => {
    const { status } = await api('GET', '/api/stock-counts', adminCookie);
    expect(status).toBe(200);
    note('Stock counts: GET/POST /api/stock-counts (not /api/inventory/stock-count)');
  });

  test('POST /api/products/:id/adjust-stock increase by 5 → 200, stock level verified', async () => {
    if (!IDs.product) return;
    const before = await api('GET', `/api/products/${IDs.product}`, adminCookie);
    const prevStock = (before.data as { stockQuantity?: number }).stockQuantity ?? 0;

    const { status } = await api('POST', `/api/products/${IDs.product}/adjust-stock`, adminCookie, {
      adjustmentType: 'increase',
      quantity: 5,
      reason: 'API audit test stock adjustment',
    });
    expect(status).toBe(200);

    const after = await api('GET', `/api/products/${IDs.product}`, adminCookie);
    const newStock = (after.data as { stockQuantity?: number }).stockQuantity ?? 0;
    expect(newStock).toBe(prevStock + 5);
  });

  test('POST /api/products/:id/adjust-stock with invalid type → 400', async () => {
    if (!IDs.product) return;
    const { status } = await api('POST', `/api/products/${IDs.product}/adjust-stock`, adminCookie, {
      adjustmentType: 'teleport',
      quantity: 5,
      reason: 'invalid type test',
    });
    expect(status).toBe(400);
  });

  test('POST /api/products/:id/adjust-stock missing reason → 400', async () => {
    if (!IDs.product) return;
    const { status } = await api('POST', `/api/products/${IDs.product}/adjust-stock`, adminCookie, {
      adjustmentType: 'increase',
      quantity: 5,
    });
    expect(status).toBe(400);
  });

  test('GET /api/inventory/export → documents non-existent route', async () => {
    const { status } = await api('GET', '/api/inventory/export', adminCookie);
    if (status === 404) {
      note('GET /api/inventory/export does not exist — use /api/export/invoice, /api/export/po, /api/export/do, /api/export/quotation, /api/products/bulk-template instead');
    }
  });
});

// ── Reports ──────────────────────────────────────────────────────────────────

test.describe('Reports & Exports', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
  });

  test('GET /api/reports/po-grn → documents route existence', async () => {
    const { status } = await api('GET', '/api/reports/po-grn', adminCookie);
    if (status === 404) {
      note('GET /api/reports/po-grn: route does not exist — PO+GRN reconciliation is via GET /api/purchase-orders/:id/detail');
    }
  });

  test('GET /api/reports/payments-ledger → documents route existence', async () => {
    const { status } = await api('GET', '/api/reports/payments-ledger', adminCookie);
    if (status === 404) {
      note('GET /api/reports/payments-ledger: route does not exist — payment tracking is via GRN paymentStatus fields');
    }
  });

  test('GET /api/export/invoice?invoiceId=:id → 200 with invoice data JSON', async () => {
    if (!IDs.customer || !IDs.product) return;
    const createResp = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      total_amount: 100,
      tax_amount: 5,
      currency: 'AED',
      items: [{ product_id: IDs.product, product_name: 'Audit Test Product', product_code: 'AUDIT-SKU-001', description: 'Export test', quantity: 1, unit_price: 100, line_total: 100 }],
    });
    if (createResp.status !== 201) return;
    const freshInvoiceId = (createResp.data as { id: number }).id;
    const { status, data } = await api('GET', `/api/export/invoice?invoiceId=${freshInvoiceId}`, adminCookie);
    expect(status).toBe(200);
    const result = data as { success?: boolean; data?: { invoice_number?: string } };
    expect(result.success).toBe(true);
    expect(result.data?.invoice_number).toBeTruthy();
    await api('DELETE', `/api/invoices/${freshInvoiceId}`, adminCookie);
  });

  test('GET /api/export/invoice with no invoiceId → 400', async () => {
    const { status } = await api('GET', '/api/export/invoice', adminCookie);
    expect(status).toBe(400);
  });

  test('GET /api/export/po?poId=:id → 200 with PO data JSON', async () => {
    if (!IDs.po) return;
    const { status, data } = await api('GET', `/api/export/po?poId=${IDs.po}`, adminCookie);
    expect(status).toBe(200);
    const result = data as { success?: boolean };
    expect(result.success).toBe(true);
  });

  test('GET /api/export/quotation with fresh quotation → 200', async () => {
    if (!IDs.customer || !IDs.product) return;
    const createResp = await api('POST', '/api/quotations', adminCookie, {
      customerId: IDs.customer,
      quoteDate: '2026-04-12',
      status: 'draft',
      items: [
        { productId: IDs.product, quantity: 1, unitPrice: '99.00', discount: 0, vatRate: '0.05', lineTotal: '99.00' },
      ],
    });
    if (createResp.status !== 201) return;
    const tempQtId = (createResp.data as { id: number }).id;
    if (!tempQtId) return;
    const { status } = await api('GET', `/api/export/quotation?quotationId=${tempQtId}`, adminCookie);
    expect(status).toBe(200);
    await api('DELETE', `/api/quotations/${tempQtId}`, adminCookie);
  });
});

// ── System ───────────────────────────────────────────────────────────────────

test.describe('System', () => {
  let adminCookie = '';
  let viewerCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
    viewerCookie = await loginAs('viewer_audit_test', 'Viewer123!').catch(() => '');
  });

  test('GET /api/health → 200 (no auth required)', async () => {
    const resp = await fetch(`${BASE_URL}/api/health`);
    expect(resp.status).toBe(200);
    const data = await resp.json() as { status: string };
    expect(data.status).toBe('ok');
  });

  test('GET /api/audit-logs Admin → 200', async () => {
    const { status } = await api('GET', '/api/audit-logs', adminCookie);
    expect(status).toBe(200);
  });

  test('GET /api/audit-logs Staff (Viewer) → 403', async () => {
    if (!viewerCookie) return;
    const { status } = await api('GET', '/api/audit-logs', viewerCookie);
    expect(status).toBe(403);
  });

  test('GET /api/recycle-bin → 200 array', async () => {
    const { status, data } = await api('GET', '/api/recycle-bin', adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  test('DELETE /api/recycle-bin/:id non-existent → documents behaviour (200 or 404)', async () => {
    const { status } = await api('DELETE', '/api/recycle-bin/999999', adminCookie);
    if (status === 200) {
      note('DELETE /api/recycle-bin/:id with non-existent ID returns 200 (no 404 guard) — idempotent delete');
    }
    expect([200, 404, 400]).toContain(status);
  });

  test('GET /api/ops/backup-runs Admin → 200', async () => {
    const { status } = await api('GET', '/api/ops/backup-runs', adminCookie);
    expect(status).toBe(200);
  });

  test('GET /api/ops/backup-runs Staff (Viewer) → 403', async () => {
    if (!viewerCookie) return;
    const { status } = await api('GET', '/api/ops/backup-runs', viewerCookie);
    expect(status).toBe(403);
  });

  test('GET /api/books → 200', async () => {
    const { status } = await api('GET', '/api/books', adminCookie);
    expect(status).toBe(200);
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

test.describe('Edge Cases', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
  });

  test('Unauthenticated requests to all major routes → 401 (not 500)', async () => {
    const routes = [
      '/api/products',
      '/api/customers',
      '/api/purchase-orders',
      '/api/invoices',
      '/api/quotations',
      '/api/delivery-orders',
      '/api/goods-receipts',
      '/api/audit-logs',
      '/api/stock-movements',
    ];
    for (const route of routes) {
      const resp = await fetch(`${BASE_URL}${route}`);
      expect(resp.status, `${route} → expected 401, got ${resp.status}`).toBe(401);
    }
  });

  test('POST /api/invoices with 0 items → documents minimum item count enforcement', async () => {
    if (!IDs.customer) return;
    const { status } = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      total_amount: 0,
      items: [],
    });
    if (status === 201 || status === 200) {
      note('POST /api/invoices: empty items array is accepted (no minimum item count validation)');
      test.info().annotations.push({ type: 'NOTE', description: 'POST /api/invoices with 0 items succeeds — no minimum item count enforced.' });
    } else if (status === 400) {
      note('POST /api/invoices with 0 items correctly returns 400 (minimum item count enforced)');
    }
  });

  test('Malformed JSON body → 400 (not 500 crash)', async () => {
    const resp = await fetch(`${BASE_URL}/api/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: 'this is not json{{{',
    });
    if (resp.status === 500) {
      bug('Malformed JSON body to POST endpoint returns 500 — server should return 400 for invalid JSON');
      test.info().annotations.push({ type: 'BUG', description: 'Malformed JSON POST body returns 500 (Express global error handler should catch this and return 400).' });
    }
    expect([400, 500]).toContain(resp.status);
  });

  test('GET /api/export/invoice without auth → 401', async () => {
    const { status } = await api('GET', '/api/export/invoice?invoiceId=1', '');
    expect(status).toBe(401);
  });

  test('GET /api/db/size Admin → 200', async () => {
    const { status } = await api('GET', '/api/db/size', adminCookie);
    expect(status).toBe(200);
  });

  test('GET /api/system/app-size Admin → 200', async () => {
    const { status } = await api('GET', '/api/system/app-size', adminCookie);
    expect(status).toBe(200);
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

test.describe('Cleanup', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
  });

  test('delete test viewer user', async () => {
    if (!IDs.viewerUserId) {
      // Find it by username in case ID was lost
      const { data } = await api('GET', '/api/users', adminCookie);
      const users = ((data as { users?: Array<{ id: string; username: string }> })?.users) ?? [];
      const viewer = users.find(u => u.username === 'viewer_audit_test');
      if (viewer) IDs.viewerUserId = viewer.id;
    }
    if (!IDs.viewerUserId) return;
    const { status } = await api('DELETE', `/api/users/${IDs.viewerUserId}`, adminCookie);
    expect([200, 404]).toContain(status);
  });

  test('delete test quotation', async () => {
    if (!IDs.quotation) return;
    await api('DELETE', `/api/quotations/${IDs.quotation}`, adminCookie);
  });

  test('delete test invoice', async () => {
    if (!IDs.invoice) return;
    await api('DELETE', `/api/invoices/${IDs.invoice}`, adminCookie);
  });

  test('delete test GRN', async () => {
    if (!IDs.grn) return;
    await api('DELETE', `/api/goods-receipts/${IDs.grn}`, adminCookie);
  });

  test('delete test purchase order', async () => {
    if (!IDs.po) return;
    await api('DELETE', `/api/purchase-orders/${IDs.po}`, adminCookie);
  });

  test('delete test product', async () => {
    if (!IDs.product) return;
    await api('DELETE', `/api/products/${IDs.product}`, adminCookie);
  });

  test('delete bulk-imported audit products', async () => {
    const resp = await api('GET', '/api/products?search=Bulk+Audit', adminCookie);
    const result = resp.data as { data?: Array<{ id: number; name: string }> } | Array<{ id: number; name: string }>;
    const items = Array.isArray(result) ? result : ((result as { data?: Array<{ id: number; name: string }> }).data ?? []);
    for (const p of items) {
      if (p.name?.includes('Bulk Audit')) {
        await api('DELETE', `/api/products/${p.id}`, adminCookie);
      }
    }
  });

  test('delete test brand', async () => {
    if (!IDs.brand) return;
    await api('DELETE', `/api/brands/${IDs.brand}`, adminCookie);
  });

  test('delete test customer', async () => {
    if (!IDs.customer) return;
    await api('DELETE', `/api/customers/${IDs.customer}`, adminCookie);
  });

  test('delete test supplier', async () => {
    if (!IDs.supplier) return;
    await api('DELETE', `/api/suppliers/${IDs.supplier}`, adminCookie);
  });

  test('print audit summary', async () => {
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('   FLOW API AUDIT — COMPLETE SUMMARY');
    console.log('══════════════════════════════════════════════════════════════════');

    if (bugs.length === 0) {
      console.log('\n✅ No bugs found!');
    } else {
      console.log(`\n🐛 BUGS FOUND (${bugs.length}):`);
      bugs.forEach((b, i) => console.log(`  ${i + 1}. [BUG] ${b}`));
    }

    if (notes.length > 0) {
      console.log(`\n📝 BEHAVIOURS DOCUMENTED (${notes.length}):`);
      notes.forEach((n, i) => console.log(`  ${i + 1}. [NOTE] ${n}`));
    }

    console.log('\n══════════════════════════════════════════════════════════════════\n');

    test.info().annotations.push({
      type: 'AUDIT_SUMMARY',
      description: [
        `BUGS (${bugs.length}): ${bugs.join(' | ')}`,
        `NOTES (${notes.length}): ${notes.join(' | ')}`,
      ].join('\n'),
    });
  });
});
