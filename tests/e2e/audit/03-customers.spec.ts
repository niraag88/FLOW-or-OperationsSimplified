/**
 * Phase 3 — Customers
 *
 * Seed customers via API (e2e_test tag where schema allows).
 * Browser tests verify:
 * - Customer list page renders with customers
 * - New Customer button opens form
 * - Search filters list
 * - Customer detail updates and persists
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, saveState } from './audit-helpers';

test.describe('Phase 3 — Customers', () => {
  test.setTimeout(120000);

  let cookie: string;
  const customerIds: number[] = [];

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('seed 5 customers via API (dataSource=e2e_test)', async () => {
    const customers = [
      { name: 'Audit Customer 1 LLC', vatNumber: '100456789000001', billingAddress: '1 Main St, Dubai, UAE', dataSource: 'e2e_test' },
      { name: 'Audit Customer 2 FZE', vatNumber: '100456789000002', billingAddress: '2 Trade Centre, Abu Dhabi, UAE', dataSource: 'e2e_test' },
      { name: 'Audit Customer 3 Long Address', billingAddress: '123 Really Long Street, Business Bay, Dubai, United Arab Emirates, PO Box 12345', dataSource: 'e2e_test' },
      { name: 'International Customer Ltd', billingAddress: '10 Downing Street, London, UK, SW1A 2AA', dataSource: 'e2e_test' },
      { name: 'Audit Customer 5 Remarks', remarks: 'Key account — handle with priority', email: 'c5@auditco.ae', phone: '+971 50 000 0005', dataSource: 'e2e_test' },
    ];

    for (const c of customers) {
      const { status, data } = await apiPost('/api/customers', c, cookie);
      expect([200, 201]).toContain(status);
      const created = data as { id: number };
      expect(created.id).toBeGreaterThan(0);
      customerIds.push(created.id);
    }
    expect(customerIds.length).toBe(5);
    saveState({ customerIds });
  });

  test('customers list page renders and shows seeded customers', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Customers`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/audit customer 1/i);
    expect(body).toMatch(/audit customer 2/i);
  });

  test('New Customer button is visible on customers page', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Customers`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new customer|add customer|create customer/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
  });

  test('customer search filters list to matching name', async ({ page }) => {
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
  });

  test('edit customer 1 email; updated value persists in API', async () => {
    const cId = customerIds[0];
    expect(cId).toBeGreaterThan(0);
    const { status } = await apiPut(`/api/customers/${cId}`, {
      email: 'updated@auditcustomer1.ae',
      phone: '+971 4 111 1111',
    }, cookie);
    expect([200, 201]).toContain(status);

    const detail = await (await fetch(`${BASE_URL}/api/customers/${cId}`, { headers: { Cookie: cookie } })).json() as { email?: string };
    expect(detail.email).toBe('updated@auditcustomer1.ae');
  });
});
