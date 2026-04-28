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

/**
 * Playwright resets module-level state for describe blocks after a certain
 * internal boundary. Call this in any beforeAll that might start with IDs = 0
 * to recover IDs by querying the API for known test-data records.
 */
async function recoverIDs(cookie: string): Promise<void> {
  if (!IDs.brand) {
    const res = (await api('GET', '/api/brands', cookie)).data as Array<{ id: number; name: string }>;
    if (Array.isArray(res)) {
      const found = res.find(b => b.name?.startsWith('AuditBrand_'));
      if (found) IDs.brand = found.id;
    }
  }
  if (!IDs.product) {
    const res = (await api('GET', '/api/products?search=AUDIT-SKU', cookie)).data;
    const arr = (Array.isArray(res) ? res : ((res as { data?: unknown[] }).data ?? [])) as Array<{ id: number; sku?: string }>;
    const found = arr.find(p => p.sku === 'AUDIT-SKU-001');
    if (found) IDs.product = found.id;
  }
  if (!IDs.customer) {
    const res = (await api('GET', '/api/customers?search=Audit+Customer', cookie)).data as Array<{ id: number; name?: string }>;
    if (Array.isArray(res)) {
      const found = res.find(c => (c.name ?? '').includes('Audit Customer'));
      if (found) IDs.customer = found.id;
    }
  }
  if (!IDs.supplier) {
    const res = (await api('GET', '/api/suppliers', cookie)).data as Array<{ id: number; name?: string }>;
    if (Array.isArray(res)) {
      const found = res.find(s => (s.name ?? '').includes('Audit Supplier'));
      if (found) IDs.supplier = found.id;
    }
  }
  if (!IDs.po) {
    const res = (await api('GET', '/api/purchase-orders?pageSize=200', cookie)).data;
    const list = (Array.isArray(res) ? res : ((res as { data?: unknown[] }).data ?? [])) as Array<{ id: number; notes?: string }>;
    const found = list.find(p => (p.notes ?? '').toLowerCase().includes('audit'));
    if (found) IDs.po = found.id;
  }
  if (!IDs.viewerUserId) {
    const res = (await api('GET', '/api/users', cookie)).data as { users?: Array<{ id: string; username?: string }> };
    const users = res.users ?? [];
    const found = users.find(u => u.username === 'viewer_audit_test');
    if (found) IDs.viewerUserId = found.id;
  }
}

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
    expect(viewerCookie).toBeTruthy();
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
    expect(viewerCookie).toBeTruthy();
    const { status } = await api('PUT', '/api/company-settings', viewerCookie, {
      companyName: 'Should Not Change',
    });
    expect(status).toBe(403);
  });

  test('GET /api/company-settings by Viewer (Staff) → 200 (read-only access)', async () => {
    expect(viewerCookie).toBeTruthy();
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
            // GRNs are append-only for audit. Cancel any non-cancelled GRN so
            // stock and PO-state are reversed, but leave the receipt rows in
            // place. The PO that owns linked GRNs will likewise be retained
            // (the DELETE will return 400 — best-effort cleanup).
            const grnsResp = await api('GET', `/api/goods-receipts?poId=${po.id}`, adminCookie);
            const grns = grnsResp.data as Array<{ id: number; status?: string }>;
            if (Array.isArray(grns)) {
              for (const grn of grns) {
                if (grn.status !== 'cancelled') {
                  await api('PATCH', `/api/goods-receipts/${grn.id}/cancel`, adminCookie, {
                    confirmNegativeStock: true,
                    acknowledgePaidGrn: true,
                  });
                }
              }
            }
            // POs with linked GRNs cannot be deleted (audit retention); the
            // attempt is harmless and returns 400 — POs without GRNs delete cleanly.
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
      dataSource: 'e2e_test',
    });
    expect(status).toBe(201);
    IDs.brand = (data as { id: number }).id;
    expect(IDs.brand).toBeGreaterThan(0);
  });

  test('POST /api/brands create secondary brand → 201', async () => {
    const { status, data } = await api('POST', '/api/brands', adminCookie, {
      name: 'AuditBrand_Secondary',
      dataSource: 'e2e_test',
    });
    expect(status).toBe(201);
    IDs.brand2 = (data as { id: number }).id;
  });

  test('POST /api/brands with missing required name → 400', async () => {
    const { status } = await api('POST', '/api/brands', adminCookie, {
      description: 'No name field',
    });
    expect(status).toBe(400);
  });

  test('POST /api/brands with duplicate name → 409 or 400 (unique constraint)', async () => {
    const { status } = await api('POST', '/api/brands', adminCookie, {
      name: 'AuditBrand_Primary',
      dataSource: 'e2e_test',
    });
    note(`Duplicate brand name → ${status}`);
    expect([400, 409]).toContain(status);
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
      dataSource: 'e2e_test',
    });
    expect(status).toBe(201);
    IDs.product = (data as { id: number }).id;
    expect(IDs.product).toBeGreaterThan(0);
  });

  test('POST /api/products with missing unitPrice → 400', async () => {
    if (!IDs.brand) return;
    const { status } = await api('POST', '/api/products', adminCookie, {
      sku: 'AUDIT-SKU-BAD',
      name: 'Bad Product',
      brandId: IDs.brand,
    });
    expect(status).toBe(400);
  });

  test('POST /api/products by Viewer (Staff) → 403 (Admin/Manager only)', async () => {
    expect(IDs.brand).toBeGreaterThan(0);
    const localViewerCookie = viewerCookie || await loginAs('viewer_audit_test', 'Viewer123!').catch(() => '');
    expect(localViewerCookie, 'viewer_audit_test login must succeed (created in Users tests)').toBeTruthy();
    const { status } = await api('POST', '/api/products', localViewerCookie, {
      sku: 'AUDIT-VIEWER-SKU',
      name: 'Viewer Product',
      brandId: IDs.brand,
      unitPrice: '10.00',
      dataSource: 'e2e_test',
    });
    expect(status).toBe(403);
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
  });

  test('POST /api/products/bulk import with hyphenated SKU → documents validation behaviour', async () => {
    if (!IDs.brand) return;
    const brandResp = await api('GET', '/api/brands', adminCookie);
    const brands = brandResp.data as Array<{ id: number; name: string }>;
    const auditBrand = brands.find(b => b.name === 'AuditBrand_Primary_Updated') ?? brands.find(b => b.name?.startsWith('AuditBrand_'));
    if (!auditBrand) return;
    const { status, data } = await api('POST', '/api/products/bulk', adminCookie, {
      rows: [
        {
          brandName: auditBrand.name,
          productCode: 'BULK-HYP-001',
          productName: 'Bulk Hyphen SKU Test',
          salePrice: '5.00',
          purchasePrice: '2.00',
          purchasePriceCurrency: 'AED',
        },
      ],
    });
    const result = data as { created?: number; errors?: unknown[]; failed?: number };
    if (status === 200 || status === 201) {
      if ((result.created ?? 0) === 0 || (result.failed ?? 0) > 0) {
        bug('POST /api/products/bulk: hyphenated productCode "BULK-HYP-001" was rejected — /^[A-Za-z0-9]{1,50}$/ disallows hyphens in SKUs');
        test.info().annotations.push({ type: 'BUG', description: 'Bulk import SKU regex /^[A-Za-z0-9]{1,50}$/ rejects hyphenated SKUs (e.g. BULK-HYP-001), limiting import compatibility for real-world SKU formats.' });
      } else {
        note('POST /api/products/bulk: hyphenated SKU "BULK-HYP-001" was accepted ✓');
        const bulkHypId = (data as { ids?: number[] }).ids?.[0];
        if (bulkHypId) await api('DELETE', `/api/products/${bulkHypId}`, adminCookie);
      }
    } else {
      bug(`POST /api/products/bulk: hyphenated productCode "BULK-HYP-001" returned ${status} — SKUs with hyphens are rejected`);
      test.info().annotations.push({ type: 'BUG', description: `Bulk import with hyphenated SKU returns ${status}. Common real-world SKUs use hyphens; the strict regex /^[A-Za-z0-9]{1,50}$/ is too restrictive.` });
    }
    expect([200, 201, 400]).toContain(status);
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
      vatTreatment: 'standard',
      dataSource: 'e2e_test',
    });
    expect(status, `Customer create got ${status}: ${JSON.stringify(data)}`).toBe(201);
    IDs.customer = (data as { id: number }).id;
    expect(IDs.customer).toBeGreaterThan(0);
  });

  test('POST /api/customers missing required name → 400', async () => {
    const { status } = await api('POST', '/api/customers', adminCookie, {
      email: 'noname@test.ae',
    });
    expect(status).toBe(400);
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
      dataSource: 'e2e_test',
    });
    expect(status).toBe(201);
    IDs.supplier = (data as { id: number }).id;
    expect(IDs.supplier).toBeGreaterThan(0);
  });

  test('POST /api/suppliers missing name → 400', async () => {
    const { status } = await api('POST', '/api/suppliers', adminCookie, {
      email: 'noname@supplier.test',
    });
    expect(status).toBe(400);
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
    expect(IDs.supplier).toBeGreaterThan(0);
    expect(IDs.product).toBeGreaterThan(0);
    expect(IDs.brand).toBeGreaterThan(0);
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

  test('POST /api/purchase-orders missing brandId → 400 (brandId is required)', async () => {
    expect(IDs.supplier).toBeGreaterThan(0);
    const { status } = await api('POST', '/api/purchase-orders', adminCookie, {
      supplierId: IDs.supplier,
      currency: 'AED',
      items: [],
    });
    note(`POST /api/purchase-orders missing brandId → ${status} (brandId is required — validation enforced)`);
    expect(status).toBe(400);
  });

  test('POST /api/purchase-orders by Viewer (Staff) → 403', async () => {
    expect(viewerCookie).toBeTruthy();
    const { status } = await api('POST', '/api/purchase-orders', viewerCookie, {
      supplierId: 1,
      brandId: 1,
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
    expect(viewerCookie).toBeTruthy();
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

  test('POST /api/purchase-orders with fxRateToAed as number → 201 (coerced to string)', async () => {
    if (!IDs.supplier || !IDs.brand) return;
    const { status, data } = await api('POST', '/api/purchase-orders', adminCookie, {
      supplierId: IDs.supplier,
      brandId: IDs.brand,
      currency: 'AED',
      fxRateToAed: 1,
      items: [],
    });
    const tempPoId = (data as { id?: number }).id;
    if (tempPoId) await api('DELETE', `/api/purchase-orders/${tempPoId}`, adminCookie);
    expect(status).toBe(201);
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

  test('POST /api/goods-receipts with zero receivedQuantity — documents zero-quantity behaviour', async () => {
    if (!IDs.po || !IDs.poItem || !IDs.product) return;
    const { status } = await api('POST', '/api/goods-receipts', adminCookie, {
      poId: IDs.po,
      receivedDate: '2026-04-12',
      items: [
        {
          poItemId: IDs.poItem,
          productId: IDs.product,
          orderedQuantity: 10,
          receivedQuantity: 0,
          unitPrice: '50.00',
        },
      ],
    });
    if (status === 201 || status === 200) {
      note('POST /api/goods-receipts: zero receivedQuantity is accepted — no minimum quantity validation enforced');
      test.info().annotations.push({ type: 'NOTE', description: 'GRN creation accepts receivedQuantity: 0 (no minimum quantity validation).' });
      const grnId = (await api('GET', `/api/goods-receipts?poId=${IDs.po}`, adminCookie).then(r => {
        const list = r.data as Array<{ id: number }>;
        return Array.isArray(list) ? list.find(g => g.id !== IDs.grn) : null;
      }))?.id;
      // GRNs are audit-retained — cancel rather than delete to undo stock side effects.
      if (grnId) {
        await api('PATCH', `/api/goods-receipts/${grnId}/cancel`, adminCookie, {
          confirmNegativeStock: true,
          acknowledgePaidGrn: true,
        });
      }
    } else {
      note(`POST /api/goods-receipts zero receivedQuantity → ${status} (zero-quantity validation enforced)`);
    }
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
    await recoverIDs(adminCookie);
  });

  test('POST /api/quotations create with items → 201', async () => {
    expect(IDs.customer).toBeGreaterThan(0);
    expect(IDs.product).toBeGreaterThan(0);
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

  test('PUT /api/quotations/:id submitted→draft → 400 (disallowed transition)', async () => {
    // Create quotation directly in submitted status, then try to downgrade
    if (!IDs.customer || !IDs.product) return;
    const { data: created } = await api('POST', '/api/quotations', adminCookie, {
      customerId: IDs.customer,
      customerName: 'Audit Customer LLC Updated',
      quoteDate: '2026-04-13',
      validUntil: '2026-05-13',
      status: 'submitted',
      subtotal: '100.00',
      taxAmount: '5.00',
      totalAmount: '105.00',
      items: [{ product_id: IDs.product, quantity: 1, unit_price: 100, discount: 0, vat_rate: 0.05, line_total: 100 }],
    });
    const qId = (created as { id: number }).id;
    expect(qId).toBeGreaterThan(0);
    const { status: downgradeStatus } = await api('PUT', `/api/quotations/${qId}`, adminCookie, { status: 'draft' });
    note('PUT /api/quotations/:id: submitted→draft returns 400 — not in allowed transition map');
    expect(downgradeStatus).toBe(400);
    await api('DELETE', `/api/quotations/${qId}`, adminCookie);
  });

  test('PUT /api/quotations/:id cancelled→submitted → 400 (terminal state)', async () => {
    if (!IDs.quotation) return;
    const { status, data } = await api('PUT', `/api/quotations/${IDs.quotation}`, adminCookie, {
      status: 'submitted',
    });
    note('PUT /api/quotations/:id: cancelled→submitted returns 400 — cancelled is a terminal state');
    expect(status).toBe(400);
    expect((data as { error: string }).error).toBe('Cancelled quotations cannot be reactivated');
  });

  test('PUT /api/quotations/:id converted→draft → 400 (converted is terminal)', async () => {
    if (!IDs.customer || !IDs.product) return;
    // Create a fresh quotation in submitted state, convert it, then attempt a backward transition
    const { data: created } = await api('POST', '/api/quotations', adminCookie, {
      customerId: IDs.customer,
      customerName: 'Audit Customer LLC Updated',
      quoteDate: '2026-04-13',
      validUntil: '2026-05-13',
      status: 'submitted',
      subtotal: '100.00',
      taxAmount: '5.00',
      totalAmount: '105.00',
      items: [{ product_id: IDs.product, quantity: 1, unit_price: 100, discount: 0, vat_rate: 0.05, line_total: 100 }],
    });
    const qId = (created as { id: number }).id;
    const { status: convertStatus } = await api('PATCH', `/api/quotations/${qId}/convert`, adminCookie);
    expect(convertStatus).toBe(200); // confirm convert succeeded
    const { status: downgradeStatus, data: downgradeData } = await api('PUT', `/api/quotations/${qId}`, adminCookie, { status: 'draft' });
    note('PUT /api/quotations/:id: converted→draft returns 400 — converted is a terminal state');
    expect(downgradeStatus).toBe(400);
    expect((downgradeData as { error: string }).error).toBe('Converted quotations cannot be modified');
    // Clean up (delete the converted quotation — moves to recycle bin)
    await api('DELETE', `/api/quotations/${qId}`, adminCookie);
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
  let viewerCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
    viewerCookie = await loginAs('viewer_audit_test', 'Viewer123!').catch(() => '');
    await recoverIDs(adminCookie);
  });

  test('POST /api/invoices create with items → 201', async () => {
    expect(IDs.customer).toBeGreaterThan(0);
    expect(IDs.product).toBeGreaterThan(0);
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
    expect(IDs.invoice).toBeGreaterThan(0);
    const { status, data } = await api('GET', `/api/invoices/${IDs.invoice}`, adminCookie);
    expect(status).toBe(200);
    const inv = data as { invoice_number?: string; status?: string; items?: unknown[] };
    expect(inv.invoice_number).toBeTruthy();
    expect(inv.status).toBe('draft');
    expect(Array.isArray(inv.items)).toBe(true);
  });

  test('PUT /api/invoices/:id draft→submitted status transition → 200', async () => {
    expect(IDs.invoice).toBeGreaterThan(0);
    expect(IDs.customer).toBeGreaterThan(0);
    // Header-only edit: omit `items` entirely (sending items: [] would
    // now be rejected by the no_line_items guard).
    const { status, data } = await api('PUT', `/api/invoices/${IDs.invoice}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'submitted',
      total_amount: 519.75,
      tax_amount: 24.75,
    });
    expect(status).toBe(200);
    const updated = data as { status?: string };
    expect(updated.status).toBe('submitted');
  });

  test('GET /api/invoices without auth → 401', async () => {
    const { status } = await api('GET', '/api/invoices', '');
    expect(status).toBe(401);
  });

  test('PATCH /api/invoices/:id/payment submitted→paid + paymentReceivedDate → 200', async () => {
    expect(IDs.invoice).toBeGreaterThan(0);
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
    expect(IDs.invoice).toBeGreaterThan(0);
    const { status } = await api('PATCH', `/api/invoices/${IDs.invoice}/payment`, adminCookie, {
      paymentStatus: 'partially_paid',
    });
    expect(status).toBe(400);
  });

  test('PATCH /api/invoices/:id/payment paid without date → 400', async () => {
    expect(IDs.invoice).toBeGreaterThan(0);
    const { status } = await api('PATCH', `/api/invoices/${IDs.invoice}/payment`, adminCookie, {
      paymentStatus: 'paid',
    });
    expect(status).toBe(400);
  });

  test('PATCH /api/invoices/:id/scan-key attach key → 200', async () => {
    expect(IDs.invoice).toBeGreaterThan(0);
    const { status } = await api('PATCH', `/api/invoices/${IDs.invoice}/scan-key`, adminCookie, {
      scanKey: 'invoices/2026/test-audit-scan.pdf',
    });
    expect(status).toBe(200);
  });

  test('PATCH /api/invoices/:id/cancel paid→cancelled status transition → 200', async () => {
    expect(IDs.invoice).toBeGreaterThan(0);
    const { status, data } = await api('PATCH', `/api/invoices/${IDs.invoice}/cancel`, adminCookie);
    expect(status).toBe(200);
    const inv = data as { status?: string };
    expect(inv.status).toBe('cancelled');
  });

  test('PATCH /api/invoices/:id/cancel already cancelled → 409', async () => {
    expect(IDs.invoice).toBeGreaterThan(0);
    const { status } = await api('PATCH', `/api/invoices/${IDs.invoice}/cancel`, adminCookie);
    expect(status).toBe(409);
  });

  test('DELETE /api/invoices/:id by Viewer → 403', async () => {
    expect(IDs.invoice).toBeGreaterThan(0);
    expect(viewerCookie).toBeTruthy();
    const { status } = await api('DELETE', `/api/invoices/${IDs.invoice}`, viewerCookie);
    expect(status).toBe(403);
  });

  test('DELETE /api/invoices/:id without auth → 401', async () => {
    expect(IDs.invoice).toBeGreaterThan(0);
    const { status } = await api('DELETE', `/api/invoices/${IDs.invoice}`, '');
    expect(status).toBe(401);
  });

  test('DELETE /api/invoices/:id by Admin → 200 (happy path)', async () => {
    expect(IDs.invoice).toBeGreaterThan(0);
    const { status } = await api('DELETE', `/api/invoices/${IDs.invoice}`, adminCookie);
    expect(status).toBe(200);
    IDs.invoice = 0;
  });
});

// ── Delivery Orders ────────────────────────────────────────────────────────────

test.describe('Delivery Orders', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
    await recoverIDs(adminCookie);
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

    // Advance through lifecycle. Header-only edits omit `items`
    // entirely (sending items: [] would now be rejected by the
    // no_line_items guard).
    await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, { customer_id: IDs.customer, status: 'submitted', total_amount: 495.0 });
    await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, { customer_id: IDs.customer, status: 'delivered', total_amount: 495.0 });
    // Delivered DOs cannot be deleted directly — must cancel first
    const { status: delDeliveredStatus } = await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
    note('DELETE /api/delivery-orders/:id on a delivered DO → 400 (must cancel first)');
    expect(delDeliveredStatus).toBe(400);
    // Cancel the DO, then delete
    const { status: cancelStatus } = await api('PATCH', `/api/delivery-orders/${doId}/cancel`, adminCookie);
    expect(cancelStatus).toBe(200);
    const { status: delStatus } = await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
    note('DELETE /api/delivery-orders/:id on a cancelled DO → 200 (allowed)');
    expect(delStatus).toBe(200);
  });

  test('PUT /api/delivery-orders/:id status downgrade from delivered → 400', async () => {
    if (!IDs.customer || !IDs.product) return;

    // Create a real DO and walk draft → submitted → delivered using
    // header-only PUTs (omitting items avoids the no_line_items guard).
    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'downgrade-test', quantity: 1, unit_price: 100, line_total: 100 }],
    });
    expect(create.status).toBe(201);
    const doId = (create.data as { id: number }).id;
    expect(doId).toBeGreaterThan(0);

    const submit = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, { customer_id: IDs.customer, status: 'submitted' });
    expect(submit.status).toBe(200);

    const deliver = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, { customer_id: IDs.customer, status: 'delivered' });
    expect(deliver.status).toBe(200);

    // Attempt the downgrade and assert the rejection.
    const downgrade = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, { customer_id: IDs.customer, status: 'submitted' });
    note('PUT /api/delivery-orders/:id: status downgrade from delivered → 400 (must cancel first)');
    expect(downgrade.status).toBe(400);
    expect((downgrade.data as { error?: string }).error).toBe('Cannot change status of a delivered order. Use the Cancel action to cancel it.');

    // Confirm status was not mutated by the failed downgrade.
    const after = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    expect((after.data as { status?: string }).status).toBe('delivered');

    // Cleanup: cancel reverses stock; cancelled DOs are retained for audit.
    const cancel = await api('PATCH', `/api/delivery-orders/${doId}/cancel`, adminCookie);
    expect(cancel.status).toBe(200);
  });

  // ── Task #306: PUT /api/delivery-orders/:id atomicity ────────────────────────

  test('PUT /api/delivery-orders/:id full edit (happy path) → 200, header + items both persisted', async () => {
    if (!IDs.customer || !IDs.product) return;

    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      reference: 'ATOMIC-HAPPY-V1',
      items: [{ product_id: IDs.product, description: 'happy-orig', quantity: 2, unit_price: 100, line_total: 200 }],
    });
    expect(create.status).toBe(201);
    const doId = (create.data as { id: number }).id;

    const put = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      reference: 'ATOMIC-HAPPY-V2',
      items: [
        { product_id: IDs.product, description: 'happy-edited', quantity: 4, unit_price: 50, line_total: 200 },
      ],
    });
    expect(put.status).toBe(200);

    // Re-fetch and confirm both header and items committed together.
    const after = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    expect(after.status).toBe(200);
    const fetched = after.data as { reference?: string; items?: Array<{ description?: string; quantity?: number }> };
    expect(fetched.reference).toBe('ATOMIC-HAPPY-V2');
    expect(Array.isArray(fetched.items)).toBe(true);
    expect(fetched.items!.length).toBe(1);
    expect(fetched.items![0].description).toBe('happy-edited');
    expect(Number(fetched.items![0].quantity)).toBe(4);

    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
  });

  test('PUT /api/delivery-orders/:id with non-existent product_id rolls back atomically (Task #306)', async () => {
    if (!IDs.customer || !IDs.product) return;

    // Create a draft DO with one valid line so we have a known starting state.
    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      reference: 'ATOMIC-FK-V1',
      items: [{ product_id: IDs.product, description: 'fk-orig', quantity: 3, unit_price: 75, line_total: 225 }],
    });
    expect(create.status).toBe(201);
    const doId = (create.data as { id: number }).id;

    // Capture the pre-PUT snapshot we need to compare against.
    const before = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    const beforeData = before.data as {
      reference?: string;
      subtotal?: string | number;
      items?: Array<{ description?: string; quantity?: number; unitPrice?: string; productId?: number; product_id?: number }>;
    };
    const beforeStockResp = await api('GET', `/api/products/${IDs.product}`, adminCookie);
    const beforeStock = (beforeStockResp.data as { stockQuantity?: number }).stockQuantity ?? 0;

    // PUT with an items payload containing a non-existent product_id. The
    // FK on delivery_order_items.product_id → products.id will reject the
    // INSERT after the header UPDATE has already run inside the transaction;
    // with the atomic fix in place, the whole transaction rolls back.
    const FAKE_PRODUCT_ID = 999_999_999;
    const put = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      reference: 'ATOMIC-FK-V2-SHOULD-NOT-PERSIST',
      items: [{ product_id: FAKE_PRODUCT_ID, description: 'fk-violator', quantity: 7, unit_price: 11, line_total: 77 }],
    });
    expect(put.status).not.toBe(200);
    expect(put.status).not.toBe(201);

    // Header reference, line items, and product stock must all be untouched.
    const after = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    const afterData = after.data as {
      reference?: string;
      subtotal?: string | number;
      items?: Array<{ description?: string; quantity?: number }>;
    };
    expect(afterData.reference).toBe(beforeData.reference);
    expect(String(afterData.subtotal)).toBe(String(beforeData.subtotal));
    expect(Array.isArray(afterData.items)).toBe(true);
    expect(afterData.items!.length).toBe(beforeData.items!.length);
    expect(afterData.items![0].description).toBe('fk-orig');
    expect(Number(afterData.items![0].quantity)).toBe(3);

    const afterStockResp = await api('GET', `/api/products/${IDs.product}`, adminCookie);
    const afterStock = (afterStockResp.data as { stockQuantity?: number }).stockQuantity ?? 0;
    expect(afterStock).toBe(beforeStock);

    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
  });

  test('PUT /api/delivery-orders/:id delivered-edit reconciles stock correctly (Task #306 regression)', async () => {
    if (!IDs.customer || !IDs.product) return;

    // Baseline stock before any test work.
    const baseStockResp = await api('GET', `/api/products/${IDs.product}`, adminCookie);
    const baseStock = (baseStockResp.data as { stockQuantity?: number }).stockQuantity ?? 0;

    // Create + transition to delivered with qty=5 — should deduct 5.
    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'reconcile-orig', quantity: 5, unit_price: 10, line_total: 50 }],
    });
    expect(create.status).toBe(201);
    const doId = (create.data as { id: number }).id;

    const deliver = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'delivered',
    });
    expect(deliver.status).toBe(200);

    const afterDeliverResp = await api('GET', `/api/products/${IDs.product}`, adminCookie);
    const afterDeliverStock = (afterDeliverResp.data as { stockQuantity?: number }).stockQuantity ?? 0;
    expect(afterDeliverStock).toBe(baseStock - 5);

    // Edit while still delivered: qty 5 → 3, expecting +2 stock returned.
    const edit = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'delivered',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'reconcile-edited', quantity: 3, unit_price: 10, line_total: 30 }],
    });
    expect(edit.status).toBe(200);

    const afterEditResp = await api('GET', `/api/products/${IDs.product}`, adminCookie);
    const afterEditStock = (afterEditResp.data as { stockQuantity?: number }).stockQuantity ?? 0;
    expect(afterEditStock).toBe(baseStock - 3);

    // Cleanup: cancel returns the remaining 3 to stock; DO retained for audit.
    const cancel = await api('PATCH', `/api/delivery-orders/${doId}/cancel`, adminCookie);
    expect(cancel.status).toBe(200);
    const afterCancelResp = await api('GET', `/api/products/${IDs.product}`, adminCookie);
    const afterCancelStock = (afterCancelResp.data as { stockQuantity?: number }).stockQuantity ?? 0;
    expect(afterCancelStock).toBe(baseStock);
  });

  test('GET /api/delivery-orders → 200', async () => {
    const { status } = await api('GET', '/api/delivery-orders', adminCookie);
    expect(status).toBe(200);
  });

  test('GET /api/delivery-orders without auth → 401', async () => {
    const { status } = await api('GET', '/api/delivery-orders', '');
    expect(status).toBe(401);
  });

  test('PUT /api/delivery-orders/:id status → cancelled (cancellation path)', async () => {
    if (!IDs.customer) return;
    const createResp = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      total_amount: 0,
      items: [],
    });
    if (createResp.status !== 201) return;
    const tempDoId = (createResp.data as { id: number }).id;
    const { status, data } = await api('PUT', `/api/delivery-orders/${tempDoId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'cancelled',
      total_amount: 0,
      items: [],
    });
    expect(status).toBe(200);
    const updated = data as { status?: string };
    expect(updated.status).toBe('cancelled');
    await api('DELETE', `/api/delivery-orders/${tempDoId}`, adminCookie);
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

// ── Cancellation: all-or-nothing contract (Task #296) ─────────────────────────

test.describe('Cancellation all-or-nothing contract', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
    await recoverIDs(adminCookie);
  });

  async function getStock(productId: number): Promise<number> {
    const { data } = await api('GET', `/api/products/${productId}`, adminCookie);
    return (data as { stockQuantity?: number }).stockQuantity ?? 0;
  }

  // Count movements scoped to a single document (referenceType + referenceId).
  // Used to prove the cancel routes don't post duplicate reversals on
  // rejected partial-reversal calls or on double-cancel attempts.
  async function countMovementsFor(referenceType: string, referenceId: number): Promise<number> {
    const { data } = await api('GET', '/api/stock-movements', adminCookie);
    const arr = Array.isArray(data) ? data : [];
    return arr.filter((m: { referenceType?: string; referenceId?: number }) =>
      m.referenceType === referenceType && m.referenceId === referenceId,
    ).length;
  }

  test('PATCH /api/invoices/:id/cancel rejects productIdsToReverse → 400 partial_stock_reversal_not_allowed', async () => {
    if (!IDs.customer || !IDs.product) return;
    const create = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      subtotal: 50, tax_amount: 0, total_amount: 50, currency: 'AED',
      items: [{ product_id: IDs.product, description: 'partial-guard', quantity: 1, unit_price: 50, line_total: 50 }],
    });
    if (create.status !== 201) return;
    const invId = (create.data as { id: number }).id;

    // Non-empty array → reject
    const reject = await api('PATCH', `/api/invoices/${invId}/cancel`, adminCookie, {
      productIdsToReverse: [IDs.product],
    });
    expect(reject.status).toBe(400);
    expect((reject.data as { error?: string }).error).toBe('partial_stock_reversal_not_allowed');

    // Empty array also rejected — caller cannot cancel a delivered invoice with zero reversal
    const empty = await api('PATCH', `/api/invoices/${invId}/cancel`, adminCookie, { productIdsToReverse: [] });
    expect(empty.status).toBe(400);
    expect((empty.data as { error?: string }).error).toBe('partial_stock_reversal_not_allowed');

    // Invoice must remain non-cancelled after a rejected request
    const get = await api('GET', `/api/invoices/${invId}`, adminCookie);
    expect((get.data as { status?: string }).status).not.toBe('cancelled');

    await api('PATCH', `/api/invoices/${invId}/cancel`, adminCookie);
    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
  });

  test('PATCH /api/invoices/:id/cancel on delivered invoice restores full stock and double cancel → 409', async () => {
    if (!IDs.customer || !IDs.product) return;
    const startStock = await getStock(IDs.product);
    const qty = 3;

    const create = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      subtotal: 60, tax_amount: 0, total_amount: 60, currency: 'AED',
      items: [{ product_id: IDs.product, description: 'cancel-restore', quantity: qty, unit_price: 20, line_total: 60 }],
    });
    if (create.status !== 201) return;
    const invId = (create.data as { id: number }).id;

    await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      customer_id: IDs.customer, status: 'submitted', total_amount: 60,
      items: [{ product_id: IDs.product, description: 'cancel-restore', quantity: qty, unit_price: 20, line_total: 60 }],
    });
    await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      customer_id: IDs.customer, status: 'delivered', total_amount: 60,
      items: [{ product_id: IDs.product, description: 'cancel-restore', quantity: qty, unit_price: 20, line_total: 60 }],
    });

    const afterDelivered = await getStock(IDs.product);
    expect(afterDelivered).toBe(startStock - qty);

    const cancel = await api('PATCH', `/api/invoices/${invId}/cancel`, adminCookie);
    expect(cancel.status).toBe(200);
    expect((cancel.data as { status?: string }).status).toBe('cancelled');
    expect((cancel.data as { stockDeducted?: boolean }).stockDeducted).toBe(false);

    const afterCancel = await getStock(IDs.product);
    expect(afterCancel).toBe(startStock);

    // Snapshot stock-movement count for this invoice — double-cancel must
    // not append any new reversal rows.
    const movementsAfterCancel = await countMovementsFor('invoice', invId);

    // Double-cancel must 409 and must NOT post extra reversal movements
    const dup = await api('PATCH', `/api/invoices/${invId}/cancel`, adminCookie);
    expect(dup.status).toBe(409);
    const afterDup = await getStock(IDs.product);
    expect(afterDup).toBe(startStock);
    const movementsAfterDup = await countMovementsFor('invoice', invId);
    expect(movementsAfterDup).toBe(movementsAfterCancel);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
  });

  test('PATCH /api/delivery-orders/:id/cancel rejects productIdsToReverse → 400 partial_stock_reversal_not_allowed', async () => {
    if (!IDs.customer || !IDs.product) return;
    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      total_amount: 0,
      items: [{ product_id: IDs.product, description: 'do-guard', quantity: 1, unit_price: 0, line_total: 0 }],
    });
    if (create.status !== 201) return;
    const doId = (create.data as { id: number }).id;
    // Header-only status advance: omit `items` (no_line_items guard).
    await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      customer_id: IDs.customer, status: 'submitted', total_amount: 0,
    });

    const reject = await api('PATCH', `/api/delivery-orders/${doId}/cancel`, adminCookie, {
      productIdsToReverse: [IDs.product],
    });
    expect(reject.status).toBe(400);
    expect((reject.data as { error?: string }).error).toBe('partial_stock_reversal_not_allowed');

    const empty = await api('PATCH', `/api/delivery-orders/${doId}/cancel`, adminCookie, { productIdsToReverse: [] });
    expect(empty.status).toBe(400);
    expect((empty.data as { error?: string }).error).toBe('partial_stock_reversal_not_allowed');

    const get = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    expect((get.data as { status?: string }).status).not.toBe('cancelled');

    await api('PATCH', `/api/delivery-orders/${doId}/cancel`, adminCookie);
    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
  });

  test('PATCH /api/delivery-orders/:id/cancel on delivered DO restores full stock and double cancel → 409', async () => {
    if (!IDs.customer || !IDs.product) return;
    const startStock = await getStock(IDs.product);
    const qty = 4;

    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer, status: 'draft', total_amount: 0,
      items: [{ product_id: IDs.product, description: 'do-cancel-restore', quantity: qty, unit_price: 0, line_total: 0 }],
    });
    if (create.status !== 201) return;
    const doId = (create.data as { id: number }).id;
    await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      customer_id: IDs.customer, status: 'submitted', total_amount: 0,
      items: [{ product_id: IDs.product, description: 'do-cancel-restore', quantity: qty, unit_price: 0, line_total: 0 }],
    });
    await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      customer_id: IDs.customer, status: 'delivered', total_amount: 0,
      items: [{ product_id: IDs.product, description: 'do-cancel-restore', quantity: qty, unit_price: 0, line_total: 0 }],
    });

    const afterDelivered = await getStock(IDs.product);
    expect(afterDelivered).toBe(startStock - qty);

    const cancel = await api('PATCH', `/api/delivery-orders/${doId}/cancel`, adminCookie);
    expect(cancel.status).toBe(200);

    const afterCancel = await getStock(IDs.product);
    expect(afterCancel).toBe(startStock);

    // Movement count for this DO — must stay frozen across double-cancel.
    const movementsAfterCancel = await countMovementsFor('delivery_order', doId);

    const dup = await api('PATCH', `/api/delivery-orders/${doId}/cancel`, adminCookie);
    expect(dup.status).toBe(409);
    const afterDup = await getStock(IDs.product);
    expect(afterDup).toBe(startStock);
    const movementsAfterDup = await countMovementsFor('delivery_order', doId);
    expect(movementsAfterDup).toBe(movementsAfterCancel);

    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
  });

  test('PATCH /api/invoices/:id/cancel collapses duplicate product lines into one reversal per product', async () => {
    if (!IDs.customer || !IDs.product) return;
    const startStock = await getStock(IDs.product);
    const qtyA = 2;
    const qtyB = 3; // same product, two separate line items → reversal must collapse to one entry of qty 5

    const create = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      subtotal: 100, tax_amount: 0, total_amount: 100, currency: 'AED',
      items: [
        { product_id: IDs.product, description: 'dup-line-A', quantity: qtyA, unit_price: 20, line_total: 40 },
        { product_id: IDs.product, description: 'dup-line-B', quantity: qtyB, unit_price: 20, line_total: 60 },
      ],
    });
    if (create.status !== 201) return;
    const invId = (create.data as { id: number }).id;

    const itemsPayload = [
      { product_id: IDs.product, description: 'dup-line-A', quantity: qtyA, unit_price: 20, line_total: 40 },
      { product_id: IDs.product, description: 'dup-line-B', quantity: qtyB, unit_price: 20, line_total: 60 },
    ];
    await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      customer_id: IDs.customer, status: 'submitted', total_amount: 100, items: itemsPayload,
    });
    await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      customer_id: IDs.customer, status: 'delivered', total_amount: 100, items: itemsPayload,
    });

    const afterDelivered = await getStock(IDs.product);
    expect(afterDelivered).toBe(startStock - (qtyA + qtyB));

    const cancel = await api('PATCH', `/api/invoices/${invId}/cancel`, adminCookie);
    expect(cancel.status).toBe(200);

    const afterCancel = await getStock(IDs.product);
    expect(afterCancel).toBe(startStock);

    // Critical assertion: although there were TWO line items for the same
    // product, the cancel route must collapse them into ONE reversal
    // movement of quantity (qtyA + qtyB) — not two separate rows.
    const { data } = await api('GET', '/api/stock-movements', adminCookie);
    const arr = Array.isArray(data) ? data : [];
    const reversals = arr.filter((m: { referenceType?: string; referenceId?: number; movementType?: string; productId?: number; quantity?: number }) =>
      m.referenceType === 'invoice' && m.referenceId === invId && m.movementType === 'invoice_cancellation' && m.productId === IDs.product,
    );
    expect(reversals.length).toBe(1);
    expect((reversals[0] as { quantity?: number }).quantity).toBe(qtyA + qtyB);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
  });
});

// ── Server-side totals authority ─────────────────────────────────────────────

test.describe('Server-side totals authority', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
    await recoverIDs(adminCookie);
  });

  test('POST /api/invoices ignores client-supplied subtotal/tax/total/line_total and recomputes from quantity x unit_price', async () => {
    if (!IDs.customer || !IDs.product) return;

    // Client sends wildly wrong totals on every level. Server must override
    // them: line_total = 4*15 = 60, subtotal = 60, vat = 5% -> 3, total = 63.
    const create = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      tax_rate: 0.05,
      subtotal: 999999,
      tax_amount: 999999,
      total_amount: 999999,
      items: [{
        product_id: IDs.product,
        description: 'totals-server-auth',
        quantity: 4,
        unit_price: 15,
        line_total: 999999,
      }],
    });
    expect(create.status).toBe(201);
    const invId = (create.data as { id: number }).id;

    const get = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const inv = get.data as {
      amount?: string | number;
      vatAmount?: string | number;
      items?: Array<{ line_total?: number; quantity?: number; unit_price?: number }>;
    };
    expect(parseFloat(String(inv.amount))).toBeCloseTo(63, 2);
    expect(parseFloat(String(inv.vatAmount))).toBeCloseTo(3, 2);
    expect(inv.items?.length).toBe(1);
    expect(inv.items?.[0].line_total).toBeCloseTo(60, 2);
    expect(inv.items?.[0].quantity).toBe(4);
    expect(inv.items?.[0].unit_price).toBeCloseTo(15, 2);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
  });

  test('PUT /api/invoices/:id recomputes totals on edit and ignores client values', async () => {
    if (!IDs.customer || !IDs.product) return;

    const create = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'edit-recompute', quantity: 2, unit_price: 10, line_total: 20 }],
    });
    expect(create.status).toBe(201);
    const invId = (create.data as { id: number }).id;

    // Edit with new quantities + lying client totals.
    const update = await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      subtotal: 0,
      tax_amount: 0,
      total_amount: 0,
      items: [{ product_id: IDs.product, description: 'edit-recompute', quantity: 5, unit_price: 8, line_total: 1 }],
    });
    expect(update.status).toBe(200);

    // Server should now hold: line_total=40, subtotal=40, vat=2, total=42.
    const get = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const inv = get.data as { amount?: string; vatAmount?: string; items?: Array<{ line_total?: number }> };
    expect(parseFloat(String(inv.amount))).toBeCloseTo(42, 2);
    expect(parseFloat(String(inv.vatAmount))).toBeCloseTo(2, 2);
    expect(inv.items?.[0].line_total).toBeCloseTo(40, 2);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
  });

  test('POST /api/delivery-orders ignores client totals and recomputes server-side', async () => {
    if (!IDs.customer || !IDs.product) return;

    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      tax_rate: 0.05,
      subtotal: 0,
      tax_amount: 0,
      total_amount: 0,
      items: [{
        product_id: IDs.product,
        description: 'do-totals-server-auth',
        quantity: 3,
        unit_price: 25,
        line_total: 0,
      }],
    });
    expect(create.status).toBe(201);
    const doId = (create.data as { id: number }).id;

    // Server must compute: subtotal 75, vat 3.75, total 78.75.
    const get = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    const doData = get.data as {
      subtotal?: number;
      tax_amount?: number;
      total_amount?: number;
      items?: Array<{ line_total?: number }>;
    };
    expect(doData.subtotal).toBeCloseTo(75, 2);
    expect(doData.tax_amount).toBeCloseTo(3.75, 2);
    expect(doData.total_amount).toBeCloseTo(78.75, 2);
    expect(doData.items?.[0].line_total).toBeCloseTo(75, 2);

    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
  });

  test('ZeroRated documents force VAT to zero regardless of client tax_amount', async () => {
    if (!IDs.customer || !IDs.product) return;

    const create = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'ZeroRated',
      tax_amount: 99,        // lying — must be ignored
      total_amount: 199,     // lying — must be ignored
      items: [{ product_id: IDs.product, description: 'zr', quantity: 2, unit_price: 50, line_total: 100 }],
    });
    expect(create.status).toBe(201);
    const invId = (create.data as { id: number }).id;

    const get = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const inv = get.data as { amount?: string; vatAmount?: string };
    expect(parseFloat(String(inv.vatAmount))).toBeCloseTo(0, 2);
    expect(parseFloat(String(inv.amount))).toBeCloseTo(100, 2);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
  });

  test('POST /api/invoices with missing/unknown tax_treatment defaults to ZeroRated (no silent 5% VAT)', async () => {
    if (!IDs.customer || !IDs.product) return;

    // No tax_treatment field at all on the body. With the customer's
    // recognised value missing/unknown, the server's conservative default
    // must be ZeroRated — never silently add 5% VAT.
    const create = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-13',
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'totally-unknown-value-xyz',
      items: [{ product_id: IDs.product, description: 'unknown-tt', quantity: 1, unit_price: 200 }],
    });
    expect(create.status).toBe(201);
    const invId = (create.data as { id: number }).id;

    const get = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const inv = get.data as { amount?: string; vatAmount?: string; taxTreatment?: string };
    expect(inv.taxTreatment).toBe('ZeroRated');
    expect(parseFloat(String(inv.vatAmount))).toBeCloseTo(0, 2);
    expect(parseFloat(String(inv.amount))).toBeCloseTo(200, 2);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
  });

  test('PUT header-only edit on a ZeroRated invoice keeps VAT zero (does not silently flip to StandardRated)', async () => {
    if (!IDs.customer || !IDs.product) return;

    const create = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'ZeroRated',
      items: [{ product_id: IDs.product, description: 'zr-header-edit', quantity: 2, unit_price: 50, line_total: 100 }],
    });
    expect(create.status).toBe(201);
    const invId = (create.data as { id: number }).id;

    // Header-only edit (no items, no tax_treatment in payload). Server must
    // fall back to the existing invoice's ZeroRated treatment, NOT default
    // to StandardRated and add 5% VAT.
    const update = await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'submitted',
      reference: 'header-edit-only',
    });
    expect(update.status).toBe(200);

    const get = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const inv = get.data as { amount?: string; vatAmount?: string };
    expect(parseFloat(String(inv.vatAmount))).toBeCloseTo(0, 2);
    expect(parseFloat(String(inv.amount))).toBeCloseTo(100, 2);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
  });

  test('PUT header-only edit on a ZeroRated delivery order keeps VAT zero', async () => {
    if (!IDs.customer || !IDs.product) return;

    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'ZeroRated',
      items: [{ product_id: IDs.product, description: 'do-zr-header', quantity: 3, unit_price: 30, line_total: 90 }],
    });
    expect(create.status).toBe(201);
    const doId = (create.data as { id: number }).id;

    const update = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'submitted',
      reference: 'do-header-edit',
    });
    expect(update.status).toBe(200);

    const get = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    const doData = get.data as { subtotal?: number; tax_amount?: number; total_amount?: number; tax_treatment?: string };
    expect(doData.tax_treatment).toBe('ZeroRated');
    expect(doData.tax_amount).toBeCloseTo(0, 2);
    expect(doData.subtotal).toBeCloseTo(90, 2);
    expect(doData.total_amount).toBeCloseTo(90, 2);

    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
  });

  test('Customer with vatTreatment="exempt" overrides body.tax_treatment="StandardRated" → invoice stored as ZeroRated', async () => {
    // Create a dedicated exempt customer just for this test so we don't
    // affect the shared IDs.customer used elsewhere.
    const cust = await api('POST', '/api/customers', adminCookie, {
      name: 'Exempt Customer Audit LLC',
      email: 'exempt-audit@customer.ae',
      vatTreatment: 'exempt',
      dataSource: 'e2e_test',
    });
    expect(cust.status).toBe(201);
    const exemptCustomerId = (cust.data as { id: number }).id;
    if (!IDs.product) {
      await api('DELETE', `/api/customers/${exemptCustomerId}`, adminCookie);
      return;
    }

    // Client tries to force StandardRated on an exempt customer. The
    // server must override and store ZeroRated with VAT 0.
    const create = await api('POST', '/api/invoices', adminCookie, {
      customer_id: exemptCustomerId,
      invoice_date: '2026-04-14',
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'exempt-test', quantity: 1, unit_price: 500 }],
    });
    expect(create.status).toBe(201);
    const invId = (create.data as { id: number }).id;

    const get = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const inv = get.data as { amount?: string; vatAmount?: string; taxTreatment?: string };
    expect(inv.taxTreatment).toBe('ZeroRated');
    expect(parseFloat(String(inv.vatAmount))).toBeCloseTo(0, 2);
    expect(parseFloat(String(inv.amount))).toBeCloseTo(500, 2);

    // PUT also cannot reintroduce VAT for an exempt customer.
    const update = await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      customer_id: exemptCustomerId,
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'exempt-test-2', quantity: 2, unit_price: 500 }],
    });
    expect(update.status).toBe(200);
    const get2 = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const inv2 = get2.data as { amount?: string; vatAmount?: string; taxTreatment?: string };
    expect(inv2.taxTreatment).toBe('ZeroRated');
    expect(parseFloat(String(inv2.vatAmount))).toBeCloseTo(0, 2);
    expect(parseFloat(String(inv2.amount))).toBeCloseTo(1000, 2);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
    await api('DELETE', `/api/customers/${exemptCustomerId}`, adminCookie);
  });

  test('Customer with vatTreatment="exempt" overrides body.tax_treatment="StandardRated" → delivery order stored as ZeroRated', async () => {
    const cust = await api('POST', '/api/customers', adminCookie, {
      name: 'Exempt Customer DO Audit LLC',
      email: 'exempt-do-audit@customer.ae',
      vatTreatment: 'exempt',
      dataSource: 'e2e_test',
    });
    expect(cust.status).toBe(201);
    const exemptCustomerId = (cust.data as { id: number }).id;
    if (!IDs.product) {
      await api('DELETE', `/api/customers/${exemptCustomerId}`, adminCookie);
      return;
    }

    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: exemptCustomerId,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'exempt-do', quantity: 4, unit_price: 25 }],
    });
    expect(create.status).toBe(201);
    const doId = (create.data as { id: number }).id;

    const get = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    const doData = get.data as { tax_treatment?: string; tax_amount?: number; total_amount?: number };
    expect(doData.tax_treatment).toBe('ZeroRated');
    expect(Number(doData.tax_amount)).toBeCloseTo(0, 2);
    expect(Number(doData.total_amount)).toBeCloseTo(100, 2);

    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
    await api('DELETE', `/api/customers/${exemptCustomerId}`, adminCookie);
  });

  test('PUT /api/invoices and /api/delivery-orders preserve existing customer_id when body omits it', async () => {
    // Reproduces the bug where a header-only PUT silently nulled
    // customer_id, which in turn broke VAT authority on subsequent edits.
    const cust = await api('POST', '/api/customers', adminCookie, {
      name: 'Persist Customer Audit LLC',
      email: 'persist-audit@customer.ae',
      vatTreatment: 'standard',
      dataSource: 'e2e_test',
    });
    expect(cust.status).toBe(201);
    const persistId = (cust.data as { id: number }).id;
    if (!IDs.product) {
      await api('DELETE', `/api/customers/${persistId}`, adminCookie);
      return;
    }

    // INVOICE
    const inv = await api('POST', '/api/invoices', adminCookie, {
      customer_id: persistId,
      invoice_date: '2026-04-17',
      status: 'draft',
      currency: 'AED',
      items: [{ product_id: IDs.product, description: 'preserve-inv', quantity: 1, unit_price: 100 }],
    });
    expect(inv.status).toBe(201);
    const invId = (inv.data as { id: number }).id;
    // Header-only PUT (no customer_id, no items) — must not null out customer_id.
    const putInv = await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      reference: 'header-only-edit',
    });
    expect(putInv.status).toBe(200);
    const getInv = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const invData = getInv.data as { customer_id?: number | null; customer?: { id?: number } | null };
    const persistedInvCustomer = invData.customer_id ?? invData.customer?.id ?? null;
    expect(persistedInvCustomer).toBe(persistId);

    // DELIVERY ORDER
    const doRes = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: persistId,
      status: 'draft',
      currency: 'AED',
      items: [{ product_id: IDs.product, description: 'preserve-do', quantity: 1, unit_price: 100 }],
    });
    expect(doRes.status).toBe(201);
    const doId = (doRes.data as { id: number }).id;
    const putDo = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      reference: 'header-only-edit',
    });
    expect(putDo.status).toBe(200);
    const getDo = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    const doData = getDo.data as { customer_id?: number | null };
    expect(doData.customer_id).toBe(persistId);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
    await api('DELETE', `/api/customers/${persistId}`, adminCookie);
  });

  test('PUT /api/invoices for an exempt-customer invoice WITHOUT customer_id in body still forces ZeroRated', async () => {
    // Reproduces the bug where the body omits customer_id, so the PUT handler
    // skipped the customer lookup and lost the authoritative VAT rule.
    const cust = await api('POST', '/api/customers', adminCookie, {
      name: 'Exempt PUT-Without-CustomerId LLC',
      email: 'exempt-put-noid@customer.ae',
      vatTreatment: 'exempt',
      dataSource: 'e2e_test',
    });
    expect(cust.status).toBe(201);
    const exemptCustomerId = (cust.data as { id: number }).id;
    if (!IDs.product) {
      await api('DELETE', `/api/customers/${exemptCustomerId}`, adminCookie);
      return;
    }
    const create = await api('POST', '/api/invoices', adminCookie, {
      customer_id: exemptCustomerId,
      invoice_date: '2026-04-15',
      status: 'draft',
      currency: 'AED',
      items: [{ product_id: IDs.product, description: 'baseline', quantity: 1, unit_price: 200 }],
    });
    expect(create.status).toBe(201);
    const invId = (create.data as { id: number }).id;

    // PUT without customer_id, but with StandardRated. Customer is exempt
    // → must still resolve to ZeroRated and VAT 0.
    const update = await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'put-noid', quantity: 3, unit_price: 200 }],
    });
    expect(update.status).toBe(200);
    const get = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const inv = get.data as { amount?: string; vatAmount?: string; taxTreatment?: string };
    expect(inv.taxTreatment).toBe('ZeroRated');
    expect(parseFloat(String(inv.vatAmount))).toBeCloseTo(0, 2);
    expect(parseFloat(String(inv.amount))).toBeCloseTo(600, 2);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
    await api('DELETE', `/api/customers/${exemptCustomerId}`, adminCookie);
  });

  test('PUT /api/delivery-orders for an exempt-customer DO WITHOUT customer_id in body still forces ZeroRated', async () => {
    const cust = await api('POST', '/api/customers', adminCookie, {
      name: 'Exempt DO PUT-Without-CustomerId LLC',
      email: 'exempt-do-put-noid@customer.ae',
      vatTreatment: 'exempt',
      dataSource: 'e2e_test',
    });
    expect(cust.status).toBe(201);
    const exemptCustomerId = (cust.data as { id: number }).id;
    if (!IDs.product) {
      await api('DELETE', `/api/customers/${exemptCustomerId}`, adminCookie);
      return;
    }
    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: exemptCustomerId,
      status: 'draft',
      currency: 'AED',
      items: [{ product_id: IDs.product, description: 'do-baseline', quantity: 1, unit_price: 80 }],
    });
    expect(create.status).toBe(201);
    const doId = (create.data as { id: number }).id;

    const update = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'do-put-noid', quantity: 5, unit_price: 80 }],
    });
    expect(update.status).toBe(200);
    const get = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    const doData = get.data as { tax_treatment?: string; tax_amount?: number; total_amount?: number };
    expect(doData.tax_treatment).toBe('ZeroRated');
    expect(Number(doData.tax_amount)).toBeCloseTo(0, 2);
    expect(Number(doData.total_amount)).toBeCloseTo(400, 2);

    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
    await api('DELETE', `/api/customers/${exemptCustomerId}`, adminCookie);
  });

  test('POST /api/invoices/from-quotation for an exempt customer produces ZeroRated invoice with VAT 0', async () => {
    const cust = await api('POST', '/api/customers', adminCookie, {
      name: 'Exempt FromQuote LLC',
      email: 'exempt-fromquote@customer.ae',
      vatTreatment: 'exempt',
      dataSource: 'e2e_test',
    });
    expect(cust.status).toBe(201);
    const exemptCustomerId = (cust.data as { id: number }).id;
    if (!IDs.product) {
      await api('DELETE', `/api/customers/${exemptCustomerId}`, adminCookie);
      return;
    }
    // Create a quote for the exempt customer
    const quote = await api('POST', '/api/quotations', adminCookie, {
      customerId: exemptCustomerId,
      customerName: 'Exempt FromQuote LLC',
      quoteDate: '2026-04-16',
      validUntil: '2026-05-16',
      status: 'draft',
      items: [{ product_id: IDs.product, quantity: 4, unit_price: 250, discount: 0, vat_rate: 0.05, line_total: 1000 }],
    });
    expect(quote.status).toBe(201);
    const quoteId = (quote.data as { id: number }).id;

    // Convert to invoice. Even if the quote was somehow standard-rated,
    // an exempt customer must produce a ZeroRated invoice with VAT 0.
    const conv = await api('POST', '/api/invoices/from-quotation', adminCookie, { quotationId: quoteId });
    expect(conv.status).toBe(201);
    const invId = (conv.data as { id: number }).id;

    const get = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const inv = get.data as { amount?: string; vatAmount?: string; taxTreatment?: string };
    expect(inv.taxTreatment).toBe('ZeroRated');
    expect(parseFloat(String(inv.vatAmount))).toBeCloseTo(0, 2);
    // 4 * 250 = 1000 subtotal, 0 VAT, 1000 grand total
    expect(parseFloat(String(inv.amount))).toBeCloseTo(1000, 2);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
    await api('DELETE', `/api/quotations/${quoteId}`, adminCookie);
    await api('DELETE', `/api/customers/${exemptCustomerId}`, adminCookie);
  });

  test('PUT /api/delivery-orders header-only with unknown tax_treatment normalises to ZeroRated (no items branch)', async () => {
    if (!IDs.customer || !IDs.product) return;

    // Create a draft DO with at least one item, then PUT with no items in
    // the body and an unrecognised tax_treatment string. The DO PUT
    // no-items branch must run the value through the normaliser and
    // resolve to ZeroRated rather than silently storing StandardRated.
    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'do-norm', quantity: 1, unit_price: 100, line_total: 100 }],
    });
    expect(create.status).toBe(201);
    const doId = (create.data as { id: number }).id;

    const update = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      tax_treatment: 'totally-unknown-do-value',
      reference: 'do-norm-edit',
    });
    expect(update.status).toBe(200);

    const get = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    const doData = get.data as { tax_treatment?: string; tax_amount?: number };
    expect(doData.tax_treatment).toBe('ZeroRated');
    expect(Number(doData.tax_amount)).toBeCloseTo(0, 2);

    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
  });

  test('POST /api/invoices and /api/delivery-orders return 400 before any DB write on invalid line items', async () => {
    if (!IDs.customer || !IDs.product) return;

    // Negative quantity → invalid_line_item, no row created.
    const badQty = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'bad', quantity: -1, unit_price: 10, line_total: 0 }],
    });
    expect(badQty.status).toBe(400);
    expect((badQty.data as { error?: string }).error).toBe('invalid_line_item');

    // Negative unit_price → invalid_line_item.
    const badPrice = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'bad', quantity: 1, unit_price: -5, line_total: 0 }],
    });
    expect(badPrice.status).toBe(400);
    expect((badPrice.data as { error?: string }).error).toBe('invalid_line_item');

    // Empty items → no_line_items.
    const noItems = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      tax_treatment: 'StandardRated',
      items: [],
    });
    expect(noItems.status).toBe(400);
    expect((noItems.data as { error?: string }).error).toBe('no_line_items');

    // Same checks on the DO route.
    const badDoQty = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'bad', quantity: 0, unit_price: 10, line_total: 0 }],
    });
    expect(badDoQty.status).toBe(400);
    expect((badDoQty.data as { error?: string }).error).toBe('invalid_line_item');

    // PUT invoice with bad item must NOT delete the existing line items.
    const seed = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'preserve-on-bad-edit', quantity: 1, unit_price: 7, line_total: 7 }],
    });
    expect(seed.status).toBe(201);
    const invId = (seed.data as { id: number }).id;

    const badEdit = await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'bad-edit', quantity: -3, unit_price: 7, line_total: 0 }],
    });
    expect(badEdit.status).toBe(400);

    // Document must still have its original line item — the failed edit
    // cannot have run delete-then-insert.
    const after = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const inv = after.data as { items?: Array<{ description?: string; quantity?: number }> };
    expect(inv.items?.length).toBe(1);
    expect(inv.items?.[0].quantity).toBe(1);
    expect(inv.items?.[0].description).toBe('preserve-on-bad-edit');

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
  });

  test('PUT /api/invoices/:id with explicit items: [] → 400 no_line_items, existing line items unchanged', async () => {
    if (!IDs.customer || !IDs.product) return;

    // Seed an invoice with one valid line item.
    const create = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-18',
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'preserve-on-empty-edit', quantity: 2, unit_price: 50, line_total: 100 }],
    });
    expect(create.status).toBe(201);
    const invId = (create.data as { id: number }).id;

    // Explicit empty items array → 400 before any DB write.
    const empty = await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      items: [],
    });
    expect(empty.status).toBe(400);
    expect((empty.data as { error?: string }).error).toBe('no_line_items');

    // Same rule for null, plain object, string, and array of non-objects.
    for (const bad of [null, {}, 'oops', [1, 2, 3]]) {
      const r = await api('PUT', `/api/invoices/${invId}`, adminCookie, {
        customer_id: IDs.customer,
        status: 'draft',
        items: bad,
      });
      expect(r.status).toBe(400);
      expect((r.data as { error?: string }).error).toBe('no_line_items');
    }

    // Existing line items must still be present and unchanged.
    const after = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const inv = after.data as { items?: Array<{ description?: string; quantity?: number; unit_price?: number }> };
    expect(inv.items?.length).toBe(1);
    expect(inv.items?.[0].description).toBe('preserve-on-empty-edit');
    expect(inv.items?.[0].quantity).toBe(2);
    expect(Number(inv.items?.[0].unit_price)).toBeCloseTo(50, 2);

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
  });

  test('PUT /api/delivery-orders/:id with explicit items: [] → 400 no_line_items, existing line items unchanged', async () => {
    if (!IDs.customer || !IDs.product) return;

    const create = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'do-preserve-on-empty', quantity: 3, unit_price: 40, line_total: 120 }],
    });
    expect(create.status).toBe(201);
    const doId = (create.data as { id: number }).id;

    const empty = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      items: [],
    });
    expect(empty.status).toBe(400);
    expect((empty.data as { error?: string }).error).toBe('no_line_items');

    for (const bad of [null, {}, 'oops', [1, 2, 3]]) {
      const r = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
        customer_id: IDs.customer,
        status: 'draft',
        items: bad,
      });
      expect(r.status).toBe(400);
      expect((r.data as { error?: string }).error).toBe('no_line_items');
    }

    const after = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    const doData = after.data as { items?: Array<{ description?: string; quantity?: number; unit_price?: number }> };
    expect(doData.items?.length).toBe(1);
    expect(doData.items?.[0].description).toBe('do-preserve-on-empty');
    expect(doData.items?.[0].quantity).toBe(3);
    expect(Number(doData.items?.[0].unit_price)).toBeCloseTo(40, 2);

    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
  });

  test('PUT without an items field is a header-only edit and continues to work (no 400)', async () => {
    if (!IDs.customer || !IDs.product) return;

    // One invoice and one DO. PUT each with the items field omitted
    // entirely — that path must still succeed (200) and recompute totals
    // from existing stored items, leaving line items untouched.
    const inv = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-18',
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'header-only-omit', quantity: 1, unit_price: 80, line_total: 80 }],
    });
    expect(inv.status).toBe(201);
    const invId = (inv.data as { id: number }).id;

    const putInv = await api('PUT', `/api/invoices/${invId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'submitted',
      reference: 'header-only-no-items-key',
    });
    expect(putInv.status).toBe(200);
    const getInv = await api('GET', `/api/invoices/${invId}`, adminCookie);
    const invData = getInv.data as { status?: string; amount?: string; items?: Array<{ description?: string }> };
    expect(invData.status).toBe('submitted');
    expect(parseFloat(String(invData.amount))).toBeCloseTo(84, 2); // 80 + 5% VAT
    expect(invData.items?.length).toBe(1);
    expect(invData.items?.[0].description).toBe('header-only-omit');

    const doRes = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      currency: 'AED',
      tax_treatment: 'StandardRated',
      items: [{ product_id: IDs.product, description: 'do-header-only-omit', quantity: 2, unit_price: 30, line_total: 60 }],
    });
    expect(doRes.status).toBe(201);
    const doId = (doRes.data as { id: number }).id;

    const putDo = await api('PUT', `/api/delivery-orders/${doId}`, adminCookie, {
      customer_id: IDs.customer,
      status: 'submitted',
      reference: 'do-header-only-no-items-key',
    });
    expect(putDo.status).toBe(200);
    const getDo = await api('GET', `/api/delivery-orders/${doId}`, adminCookie);
    const doData = getDo.data as { status?: string; total_amount?: number; items?: Array<{ description?: string }> };
    expect(doData.status).toBe('submitted');
    expect(Number(doData.total_amount)).toBeCloseTo(63, 2); // 60 + 5% VAT
    expect(doData.items?.length).toBe(1);
    expect(doData.items?.[0].description).toBe('do-header-only-omit');

    await api('DELETE', `/api/invoices/${invId}`, adminCookie);
    await api('DELETE', `/api/delivery-orders/${doId}`, adminCookie);
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
    await recoverIDs(adminCookie);
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

  test('GET /api/export/invoice?invoiceId=:id → 200 JSON with invoice_number', async () => {
    expect(IDs.customer).toBeGreaterThan(0);
    expect(IDs.product).toBeGreaterThan(0);
    const createResp = await api('POST', '/api/invoices', adminCookie, {
      customer_id: IDs.customer,
      invoice_date: '2026-04-12',
      status: 'draft',
      total_amount: 100,
      tax_amount: 5,
      currency: 'AED',
      items: [{ product_id: IDs.product, product_name: 'Audit Test Product', product_code: 'AUDIT-SKU-001', description: 'Export test', quantity: 1, unit_price: 100, line_total: 100 }],
    });
    expect(createResp.status).toBe(201);
    const freshInvoiceId = (createResp.data as { id: number }).id;
    expect(freshInvoiceId).toBeGreaterThan(0);
    const resp = await fetch(`${BASE_URL}/api/export/invoice?invoiceId=${freshInvoiceId}`, { headers: { Cookie: adminCookie } });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('application/json');
    const result = await resp.json() as { success?: boolean; data?: { invoice_number?: string } };
    expect(result.success).toBe(true);
    expect(result.data?.invoice_number).toBeTruthy();
    await api('DELETE', `/api/invoices/${freshInvoiceId}`, adminCookie);
  });

  test('GET /api/export/invoice with no invoiceId → 400', async () => {
    const { status } = await api('GET', '/api/export/invoice', adminCookie);
    expect(status).toBe(400);
  });

  test('GET /api/export/po?poId=:id → 200 JSON with success:true', async () => {
    expect(IDs.po).toBeGreaterThan(0);
    const resp = await fetch(`${BASE_URL}/api/export/po?poId=${IDs.po}`, { headers: { Cookie: adminCookie } });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('application/json');
    const result = await resp.json() as { success?: boolean };
    expect(result.success).toBe(true);
  });

  test('GET /api/export/quotation with fresh quotation → 200 JSON', async () => {
    expect(IDs.customer).toBeGreaterThan(0);
    expect(IDs.product).toBeGreaterThan(0);
    const createResp = await api('POST', '/api/quotations', adminCookie, {
      customerId: IDs.customer,
      customerName: 'Audit Customer LLC',
      quoteDate: '2026-04-12',
      validUntil: '2026-05-12',
      status: 'draft',
      items: [
        { product_id: IDs.product, quantity: 1, unit_price: 99.0, discount: 0, vat_rate: 0.05, line_total: 99.0 },
      ],
    });
    expect(createResp.status).toBe(201);
    const tempQtId = (createResp.data as { id: number }).id;
    expect(tempQtId).toBeGreaterThan(0);
    const resp = await fetch(`${BASE_URL}/api/export/quotation?quotationId=${tempQtId}`, { headers: { Cookie: adminCookie } });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('application/json');
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
    expect(viewerCookie).toBeTruthy();
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
    expect(viewerCookie).toBeTruthy();
    const { status } = await api('GET', '/api/ops/backup-runs', viewerCookie);
    expect(status).toBe(403);
  });

  test('GET /api/books → 200', async () => {
    const { status } = await api('GET', '/api/books', adminCookie);
    expect(status).toBe(200);
  });

  test('POST /api/ops/factory-reset Staff (Viewer) → 403 (Admin-only)', async () => {
    expect(viewerCookie).toBeTruthy();
    const { status } = await api('POST', '/api/ops/factory-reset', viewerCookie);
    expect(status).toBe(403);
    note('POST /api/ops/factory-reset is Admin-only (requireRole("Admin")) — Staff/Viewer get 403');
  });

  test('POST /api/ops/factory-reset without auth → 401', async () => {
    const { status } = await api('POST', '/api/ops/factory-reset', '');
    expect(status).toBe(401);
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

test.describe('Edge Cases', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
    await recoverIDs(adminCookie);
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

  test('Malformed JSON body → 400 (Express json middleware rejects)', async () => {
    const resp = await fetch(`${BASE_URL}/api/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: 'this is not json{{{',
    });
    expect(resp.status).toBe(400);
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

  test('DELETE /api/suppliers/:id with associated PO → 400 (FK constraint enforced)', async () => {
    if (!IDs.supplier || !IDs.po) return;
    const { status } = await api('DELETE', `/api/suppliers/${IDs.supplier}`, adminCookie);
    note(`DELETE /api/suppliers with associated PO → ${status}`);
    expect(status).toBe(400);
  });

  test('GET /api/export/do documents PDF content-type behaviour', async () => {
    if (!IDs.customer) return;
    const createResp = await api('POST', '/api/delivery-orders', adminCookie, {
      customer_id: IDs.customer,
      status: 'draft',
      total_amount: 0,
      items: [],
    });
    if (createResp.status !== 201) return;
    const tempDoId = (createResp.data as { id: number }).id;
    if (!tempDoId) return;
    const resp = await fetch(`${BASE_URL}/api/export/do?doId=${tempDoId}`, {
      headers: { Cookie: adminCookie },
    });
    const ct = resp.headers.get('content-type') ?? '';
    if (resp.status === 200 && ct.includes('application/pdf')) {
      note('GET /api/export/do → 200 application/pdf ✓ (Puppeteer PDF generation works)');
    } else if (resp.status === 500) {
      note(`GET /api/export/do → 500 (Puppeteer PDF generation failed in this environment; content-type: ${ct})`);
    } else {
      note(`GET /api/export/do → ${resp.status} content-type: ${ct}`);
    }
    await api('DELETE', `/api/delivery-orders/${tempDoId}`, adminCookie);
    expect([200, 500]).toContain(resp.status);
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

test.describe('Cleanup', () => {
  let adminCookie = '';

  test.beforeAll(async () => {
    adminCookie = await loginAs('admin', 'admin123');
    await recoverIDs(adminCookie);
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

  test('delete test GRN — refused for audit retention; cancel instead', async () => {
    if (!IDs.grn) return;
    // Confirmed GRNs cannot be deleted directly.
    const confirmedDelete = await api('DELETE', `/api/goods-receipts/${IDs.grn}`, adminCookie);
    expect(confirmedDelete.status).toBe(400);
    expect((confirmedDelete.data as { error?: string }).error).toBe('grn_not_cancelled');
    // Cancelling reverses stock but retains the receipt for audit.
    await api('PATCH', `/api/goods-receipts/${IDs.grn}/cancel`, adminCookie, {
      confirmNegativeStock: true,
      acknowledgePaidGrn: true,
    });
    // Cancelled GRNs are also retained — DELETE must continue to refuse them.
    const cancelledDelete = await api('DELETE', `/api/goods-receipts/${IDs.grn}`, adminCookie);
    expect(cancelledDelete.status).toBe(400);
    expect((cancelledDelete.data as { error?: string }).error).toBe('grn_retained_for_audit');
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

  test('POST /api/ops/factory-reset by Admin → 200 (run last, after all test data is cleaned up)', async () => {
    const { status, data } = await api('POST', '/api/ops/factory-reset', adminCookie);
    if (status === 200) {
      const result = data as { ok?: boolean; message?: string };
      expect(result.ok).toBe(true);
      note('POST /api/ops/factory-reset Admin → 200: factory reset succeeded after test data cleanup');
    } else {
      bug(`POST /api/ops/factory-reset Admin → ${status} (expected 200; check server logs for factory reset failure)`);
      test.info().annotations.push({ type: 'BUG', description: `Factory reset returned ${status} instead of 200 for Admin user.` });
    }
    expect(status).toBe(200);
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
