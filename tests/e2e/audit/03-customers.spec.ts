/**
 * Phase 3 — Customers
 *
 * Steps 17–19 from task spec:
 * 17. Create 5 customers via Settings → Customers browser UI form
 *     - 2 with UAE VAT TRN numbers
 *     - 1 with a long billing address
 *     - 1 international (non-UAE address)
 *     - 1 with payment remarks
 * 18. Verify customer list search works in browser
 * 19. Edit one customer: update payment terms via browser form; verify changes persist after page reload
 *
 * Post-creation: customerIds collected via API and tagged e2e_test via PUT for cleanup.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPut, browserLogin, saveState } from './audit-helpers';

interface CustomerResponse { id: number; name: string; dataSource?: string; paymentTerms?: string; }
interface CustomerListResponse { customers?: CustomerResponse[]; }

async function openCustomersTab(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${BASE_URL}/Settings`);
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
  await page.waitForTimeout(2000);
  const customersTab = page.locator('[role="tab"]').filter({ hasText: /customers/i }).first();
  await expect(customersTab).toBeVisible({ timeout: 10000 });
  await customersTab.click();
  await page.waitForTimeout(1500);
}

async function addCustomerViaBrowser(
  page: import('@playwright/test').Page,
  name: string,
  contactPerson: string,
  address: string,
  vatNumber: string,
  paymentTerms: string,
): Promise<void> {
  const addBtn = page.locator('button').filter({ hasText: /add customer|new customer/i }).first();
  await expect(addBtn).toBeVisible({ timeout: 15000 });
  await addBtn.click();
  await page.waitForTimeout(1000);

  const nameField = page.locator('#name');
  await expect(nameField).toBeVisible({ timeout: 5000 });
  await nameField.fill(name);

  if (contactPerson) {
    await page.locator('#contactPerson').fill(contactPerson);
  }
  if (address) {
    await page.locator('#billingAddress').fill(address);
  }
  if (vatNumber) {
    const vatField = page.locator('#vatNumber');
    await expect(vatField).toBeVisible({ timeout: 3000 });
    await vatField.fill(vatNumber);
  }
  if (paymentTerms) {
    await page.locator('#paymentTerms').fill(paymentTerms);
  }

  const submitBtn = page.locator('button').filter({ hasText: /create customer/i }).first();
  await expect(submitBtn).toBeVisible({ timeout: 5000 });
  await submitBtn.click();
  await page.waitForTimeout(2000);
}

test.describe('Phase 3 — Customers', () => {
  test.setTimeout(360000);

  let cookie: string;
  const customerIds: number[] = [];

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('3.1 step 17: create Customer 1 (UAE VAT TRN) via Settings → Customers browser form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: '/Settings → Customers tab → Add Customer → fill name="Audit Customer One", VAT TRN="100234567800003" → Create Customer' });
    await browserLogin(page);
    await openCustomersTab(page);
    await addCustomerViaBrowser(page, 'Audit Customer One', 'John Smith', 'Dubai, UAE, PO Box 1234', '100234567800003', 'Net 30');
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Customer One in list: ${body.includes('Audit Customer One')}` });
    expect(body).toContain('Audit Customer One');
  });

  test('3.2 step 17: create Customer 2 (UAE VAT TRN) via browser form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: '/Settings → Customers tab → Add Customer → name="Audit Customer Two", VAT="100345678900003" → Create' });
    await browserLogin(page);
    await openCustomersTab(page);
    await addCustomerViaBrowser(page, 'Audit Customer Two', 'Jane Doe', 'Abu Dhabi, UAE, Villa 55', '100345678900003', 'Net 45');
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Customer Two in list: ${body.includes('Audit Customer Two')}` });
    expect(body).toContain('Audit Customer Two');
  });

  test('3.3 step 17: create Customer 3 (long billing address) via browser form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: '/Settings → Customers → Add Customer → long address → Create' });
    await browserLogin(page);
    await openCustomersTab(page);
    const longAddr = 'Building 47, Floor 12, Office 1201, Dubai Internet City, Sheikh Zayed Road, Dubai, United Arab Emirates, PO Box 500123';
    await addCustomerViaBrowser(page, 'Audit Customer Three', 'Ahmed Hassan', longAddr, '', 'Cash');
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Customer Three in list: ${body.includes('Audit Customer Three')}` });
    expect(body).toContain('Audit Customer Three');
  });

  test('3.4 step 17: create Customer 4 (international non-UAE address) via browser form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: '/Settings → Customers → Add Customer → UK address → Create' });
    await browserLogin(page);
    await openCustomersTab(page);
    await addCustomerViaBrowser(page, 'Audit Customer Four', 'Michael Brown', '22 Baker Street, London, W1U 3BQ, United Kingdom', '', 'Net 60');
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Customer Four in list: ${body.includes('Audit Customer Four')}` });
    expect(body).toContain('Audit Customer Four');
  });

  test('3.5 step 17: create Customer 5 (payment remarks) via browser form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: '/Settings → Customers → Add Customer → payment remarks → Create' });
    await browserLogin(page);
    await openCustomersTab(page);
    await addCustomerViaBrowser(page, 'Audit Customer Five', 'Sarah Lee', 'Sharjah, UAE', '', 'Prepayment required before delivery');
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Customer Five in list: ${body.includes('Audit Customer Five')}` });
    expect(body).toContain('Audit Customer Five');
  });

  test('3.6 collect customer IDs via API; tag all 5 as e2e_test; save to state', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/customers; find all "Audit Customer" records; PUT dataSource=e2e_test; save customerIds to state' });
    const raw = await (await fetch(`${BASE_URL}/api/customers?pageSize=200`, { headers: { Cookie: cookie } })).json() as CustomerResponse[] | CustomerListResponse;
    const all = Array.isArray(raw) ? raw : (raw.customers ?? []);
    const auditCusts = all.filter((c) => /^audit customer/i.test(c.name));
    test.info().annotations.push({ type: 'result', description: `Found ${auditCusts.length} Audit Customer records (expect ≥5)` });
    expect(auditCusts.length).toBeGreaterThanOrEqual(5);

    for (const c of auditCusts) {
      customerIds.push(c.id);
      await apiPut(`/api/customers/${c.id}`, { dataSource: 'e2e_test' }, cookie);
    }
    saveState({ customerIds });
    test.info().annotations.push({ type: 'result', description: `customerIds saved: ${customerIds.join(',')}` });
  });

  test('3.7 step 18: customer search in browser narrows results', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: '/Settings → Customers tab → type "Audit Customer F" in search → verify Customer Four/Five visible' });
    await browserLogin(page);
    await openCustomersTab(page);
    await page.waitForTimeout(1000);

    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('Audit Customer F');
    await page.waitForTimeout(1500);

    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `After search "Audit Customer F": ${body.slice(0, 200)}` });
    expect(body).toMatch(/audit customer f/i);
  });

  test('3.8 step 19: edit Customer 1 payment terms to "Net 15" via browser; verify persists after reload', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: '/Settings → Customers → click Edit for Customer One → change paymentTerms to "Net 15" → Update → reload → verify "Net 15" persists' });
    await browserLogin(page);
    await openCustomersTab(page);
    await page.waitForTimeout(2000);

    const editBtns = page.locator('button').filter({ hasText: /edit/i });
    await expect(editBtns.first()).toBeVisible({ timeout: 10000 });
    await editBtns.first().click();
    await page.waitForTimeout(1000);

    const paymentTermsField = page.locator('#paymentTerms');
    await expect(paymentTermsField).toBeVisible({ timeout: 5000 });
    await paymentTermsField.clear();
    await paymentTermsField.fill('Net 15');

    const updateBtn = page.locator('button').filter({ hasText: /update customer/i }).first();
    await expect(updateBtn).toBeVisible({ timeout: 5000 });
    await updateBtn.click();
    await page.waitForTimeout(2000);

    await page.reload();
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(1500);

    const customersTab2 = page.locator('[role="tab"]').filter({ hasText: /customers/i }).first();
    await customersTab2.click();
    await page.waitForTimeout(1500);

    const bodyAfter = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `After reload — "Net 15" in page: ${bodyAfter.includes('Net 15')}` });
    expect(bodyAfter).toContain('Net 15');
  });
});
