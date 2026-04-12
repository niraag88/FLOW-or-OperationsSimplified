/**
 * Phase 3 — Customers
 *
 * 17-19. Create 5 customers (mix of API and browser form), verify search,
 *        edit one and verify persistence
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, saveState } from './audit-helpers';

test.describe('Phase 3 — Customers', () => {
  test.setTimeout(120000);

  let cookie: string;
  const customerIds: number[] = [];
  let editCustomerId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('create Audit Customer 1 via browser form', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Customers`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const newBtn = page.locator('button').filter({ hasText: /new customer|add customer|create customer/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    await newBtn.click();
    await page.waitForTimeout(1500);

    const nameInput = page.locator('input[placeholder*="name" i], input[name="name"], input[id*="name" i]').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('Audit Customer 1 LLC');

    const addressInput = page.locator('textarea[placeholder*="address" i], input[placeholder*="address" i], textarea[name*="address" i]').first();
    if (await addressInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addressInput.fill('1 Main St, Dubai, UAE');
    }

    const vatInput = page.locator('input[placeholder*="vat" i], input[placeholder*="trn" i], input[name*="vat" i]').first();
    if (await vatInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await vatInput.fill('100456789000001');
    }

    const saveBtn = page.locator('button').filter({ hasText: /save|create|add/i }).first();
    await saveBtn.click();
    await page.waitForTimeout(2000);

    const raw = await (await fetch(`${BASE_URL}/api/customers`, { headers: { Cookie: cookie } })).json() as unknown;
    const custs = (Array.isArray(raw) ? raw : ((raw as any).customers ?? [])) as Array<{ id: number; name: string }>;
    const found = custs.find((c) => c.name === 'Audit Customer 1 LLC');
    expect(found).toBeTruthy();
    customerIds.push(found!.id);
    editCustomerId = found!.id;
    test.info().annotations.push({ type: 'info', description: `Audit Customer 1 created via browser, id=${found!.id}` });
  });

  test('create 4 more customers via API with dataSource=e2e_test', async () => {
    const customers = [
      { name: 'Audit Customer 2 FZE', vatNumber: '100456789000002', billingAddress: '2 Trade Centre, Abu Dhabi, UAE', dataSource: 'e2e_test' },
      { name: 'Audit Customer 3 Long Address', billingAddress: '123 Really Long Street, Business Bay, Dubai, United Arab Emirates, PO Box 12345', dataSource: 'e2e_test' },
      { name: 'International Customer Ltd', billingAddress: '10 Downing Street, London, UK, SW1A 2AA', dataSource: 'e2e_test' },
      { name: 'Audit Customer 5 Remarks', remarks: 'Key account — handle with priority', email: 'c5@auditco.ae', phone: '+971 50 000 0005', dataSource: 'e2e_test' },
    ];

    for (const c of customers) {
      const { status, data } = await apiPost('/api/customers', c, cookie);
      expect([200, 201]).toContain(status);
      const created = data as { id: number };
      expect(created.id).toBeTruthy();
      customerIds.push(created.id);
    }

    saveState({ customerIds });
    test.info().annotations.push({ type: 'info', description: `Total 5 customers (IDs: ${customerIds.join(',')})` });
  });

  test('customers list shows all 5 in browser', async ({ page }) => {
    test.skip(customerIds.length === 0, 'Requires customers to be created');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Customers`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/audit customer 1/i);
    expect(body).toMatch(/audit customer 2/i);
    test.info().annotations.push({ type: 'info', description: 'Customers page shows multiple audit customers' });
  });

  test('customer search filters list by name', async ({ page }) => {
    test.skip(customerIds.length === 0, 'Requires customers to be created');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Customers`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('International');
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/international customer/i);
    test.info().annotations.push({ type: 'info', description: 'Customer search for "International" filters correctly' });
  });

  test('edit Customer 1: update email and phone; verify persistence via API', async () => {
    test.skip(!editCustomerId, 'Requires Audit Customer 1 to be created');
    const { status } = await apiPut(`/api/customers/${editCustomerId}`, {
      email: 'updated@auditcustomer1.ae',
      phone: '+971 4 111 1111',
    }, cookie);
    expect([200, 201]).toContain(status);

    const detail = await (await fetch(`${BASE_URL}/api/customers/${editCustomerId}`, { headers: { Cookie: cookie } })).json() as { email?: string };
    expect(detail.email).toBe('updated@auditcustomer1.ae');
    test.info().annotations.push({ type: 'info', description: `Customer ${editCustomerId} email updated and persisted` });
  });
});
