/**
 * Phase 3 — Customers
 *
 * Seed 4 customers via API (e2e_test), create 1 via browser form.
 * Browser tests verify:
 * - Customer list page renders with customers
 * - New Customer button opens form
 * - Search filters list
 * - Customer edit persists via API
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, saveState } from './audit-helpers';

interface CustomerResponse { id: number; email?: string; }

test.describe('Phase 3 — Customers', () => {
  test.setTimeout(180000);

  let cookie: string;
  const customerIds: number[] = [];

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('seed 4 customers via API (dataSource=e2e_test)', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/customers ×4 with dataSource=e2e_test' });
    const customers = [
      { name: 'Audit Customer 1 LLC', vatNumber: '100456789000001', billingAddress: '1 Main St, Dubai, UAE', dataSource: 'e2e_test' },
      { name: 'Audit Customer 2 FZE', vatNumber: '100456789000002', billingAddress: '2 Trade Centre, Abu Dhabi, UAE', dataSource: 'e2e_test' },
      { name: 'Audit Customer 3 Long Address', billingAddress: '123 Really Long Street, Business Bay, Dubai, United Arab Emirates, PO Box 12345', dataSource: 'e2e_test' },
      { name: 'International Customer Ltd', billingAddress: '10 Downing Street, London, UK, SW1A 2AA', dataSource: 'e2e_test' },
    ];

    for (const c of customers) {
      const { status, data } = await apiPost<CustomerResponse>('/api/customers', c, cookie);
      expect([200, 201]).toContain(status);
      expect(data.id).toBeGreaterThan(0);
      customerIds.push(data.id);
    }
    test.info().annotations.push({ type: 'result', description: `${customerIds.length} customers seeded via API` });
    expect(customerIds.length).toBe(4);
  });

  test('create 5th customer via browser New Customer form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click New Customer, fill name/email/phone, save' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Customers`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const newBtn = page.locator('button').filter({ hasText: /new customer|add customer|create customer/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    await newBtn.click();
    await page.waitForTimeout(2000);

    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], [data-testid="input-customer-name"]').first();
    await expect(nameInput).toBeVisible({ timeout: 8000 });
    await nameInput.fill('Audit Customer 5 Remarks');

    const emailInput = page.locator('input[name="email"], input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await emailInput.fill('c5@auditco.ae');

    const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /save|create|add|submit/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Body contains "Audit Customer 5": ${/audit customer 5/i.test(body)}` });
    expect(body).toMatch(/audit customer 5/i);

    const list = await (await fetch(`${BASE_URL}/api/customers`, { headers: { Cookie: cookie } })).json() as CustomerResponse[];
    const c5 = list.find((c: { name?: string }) => /audit customer 5/i.test(c.name ?? ''));
    if (c5) customerIds.push(c5.id);
    saveState({ customerIds });
  });

  test('customers list page shows seeded customers', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Customers; assert Audit Customer 1 and 2 visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Customers`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Contains "Audit Customer 1": ${/audit customer 1/i.test(body)}` });
    expect(body).toMatch(/audit customer 1/i);
    expect(body).toMatch(/audit customer 2/i);
  });

  test('customer search filters list to matching name', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Type "International" in search input; assert match' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Customers`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('International');
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Filtered body contains "International Customer": ${/international customer/i.test(body)}` });
    expect(body).toMatch(/international customer/i);
  });

  test('edit customer 1 email via API; updated value confirmed by API', async () => {
    const cId = customerIds[0];
    test.info().annotations.push({ type: 'action', description: `PUT /api/customers/${cId} email=updated@auditcustomer1.ae` });
    expect(cId).toBeGreaterThan(0);
    const { status } = await apiPut(`/api/customers/${cId}`, {
      email: 'updated@auditcustomer1.ae', phone: '+971 4 111 1111',
    }, cookie);
    expect([200, 201]).toContain(status);

    const detail = await (await fetch(`${BASE_URL}/api/customers/${cId}`, { headers: { Cookie: cookie } })).json() as CustomerResponse;
    test.info().annotations.push({ type: 'result', description: `Customer 1 email: ${detail.email}` });
    expect(detail.email).toBe('updated@auditcustomer1.ae');
  });
});
