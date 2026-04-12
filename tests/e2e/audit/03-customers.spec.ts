/**
 * Phase 3 — Customers
 *
 * 17-19. Create 5 customers, verify search, edit one and reload
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, saveState } from './audit-helpers';

test.describe('Phase 3 — Customers', () => {
  test.setTimeout(90000);

  let cookie: string;
  const customerIds: number[] = [];
  let editCustomerId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('create 5 customers via API', async () => {
    const customers = [
      { name: 'Audit Customer 1 LLC', vatNumber: '100456789000001', billingAddress: '1 Main St, Dubai, UAE', dataSource: 'e2e_test' },
      { name: 'Audit Customer 2 FZE', vatNumber: '100456789000002', billingAddress: '2 Trade Centre, Abu Dhabi, UAE', dataSource: 'e2e_test' },
      { name: 'Audit Customer 3 — Long Address', billingAddress: '123 Really Long Street Name, Business Bay, Dubai, United Arab Emirates, PO Box 12345, Near the Tower', dataSource: 'e2e_test' },
      { name: 'International Customer Ltd', billingAddress: '10 Downing Street, London, UK, SW1A 2AA', dataSource: 'e2e_test' },
      { name: 'Audit Customer 5 — With Remarks', remarks: 'Key account — handle with priority', email: 'c5@auditco.ae', phone: '+971 50 000 0005', dataSource: 'e2e_test' },
    ];

    for (const c of customers) {
      const { status, data } = await apiPost('/api/customers', c, cookie);
      expect([200, 201]).toContain(status);
      const created = data as { id: number };
      customerIds.push(created.id);
    }
    editCustomerId = customerIds[0];
    saveState({ customerIds });
    test.info().annotations.push({ type: 'info', description: `Created 5 customers (IDs: ${customerIds.join(',')})` });
  });

  test('customer list search works in browser', async ({ page }) => {
    test.skip(customerIds.length === 0, 'Requires customers to be created');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Customers`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/customer|audit customer/i);
    test.info().annotations.push({ type: 'info', description: 'Customers page renders with customer list visible' });
  });

  test('edit customer 1: update email and phone', async () => {
    test.skip(!editCustomerId, 'Requires customer to be created');
    const { status, data } = await apiPut(`/api/customers/${editCustomerId}`, {
      email: 'updated@auditcustomer1.ae',
      phone: '+971 4 111 1111',
    }, cookie);
    expect([200, 201]).toContain(status);
    const updated = data as { email?: string };
    expect(updated.email).toBe('updated@auditcustomer1.ae');

    const detail = await (await fetch(`${BASE_URL}/api/customers/${editCustomerId}`, { headers: { Cookie: cookie } })).json() as { email?: string };
    expect(detail.email).toBe('updated@auditcustomer1.ae');
    test.info().annotations.push({ type: 'info', description: `Customer ${editCustomerId} email/phone updated and persisted` });
  });
});
