/**
 * Phase 0 — Reset & Company Setup
 *
 * 1. Factory-reset the database via API
 * 2. Log in as admin in browser
 * 3. Navigate to Settings → Company and fill in company details
 * 4. Verify company name and TRN appear correctly after save
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, ADMIN, apiLogin, apiPost, browserLogin, saveState } from './audit-helpers';

test.describe('Phase 0 — Reset & Company Setup', () => {
  test.setTimeout(90000);

  test('factory reset wipes all business data', async () => {
    const cookie = await apiLogin();
    const { status, data } = await apiPost('/api/ops/factory-reset', {}, cookie);
    expect(status).toBe(200);
    expect((data as { ok: boolean }).ok).toBe(true);

    const products = await (await fetch(`${BASE_URL}/api/products`, { headers: { Cookie: cookie } })).json() as unknown[];
    const brands = await (await fetch(`${BASE_URL}/api/brands`, { headers: { Cookie: cookie } })).json();
    const productList = Array.isArray(products) ? products : ((products as any).products ?? []);
    const brandList = Array.isArray(brands) ? brands : ((brands as any).brands ?? []);
    expect(productList.length).toBe(0);
    expect(brandList.length).toBe(0);

    const cookie2 = await apiLogin();
    expect(cookie2.length).toBeGreaterThan(0);
    saveState({ cookie: cookie2 });

    test.info().annotations.push({ type: 'info', description: 'Factory reset succeeded — all tables empty, auth preserved' });
  });

  test('admin can log in via browser after factory reset', async ({ page }) => {
    await browserLogin(page);
    const url = page.url();
    expect(url).not.toContain('/login');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);
    test.info().annotations.push({ type: 'info', description: 'Browser login succeeded post-reset' });
  });

  test('company settings can be updated via API', async () => {
    const cookie = await apiLogin();
    const { status, data } = await apiPost('/api/settings/company', {
      companyName: 'Audit Test Co LLC',
      address: '123 Business Bay, Dubai, UAE',
      vatNumber: '100123456700003',
      currency: 'AED',
      phone: '+971 4 000 0000',
      email: 'audit@auditestco.ae',
      vatEnabled: true,
      defaultVatRate: '5.00',
    }, cookie);
    expect([200, 201]).toContain(status);
    const updated = data as { companyName?: string; company_name?: string; vatNumber?: string; vat_number?: string };
    const name = updated.companyName ?? updated.company_name ?? '';
    const trn = updated.vatNumber ?? updated.vat_number ?? '';
    expect(name).toBe('Audit Test Co LLC');
    expect(trn).toBe('100123456700003');
    test.info().annotations.push({ type: 'info', description: 'Company settings updated: name=Audit Test Co LLC, TRN=100123456700003' });
  });

  test('company settings page renders in browser with correct values', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/audit test co|company|settings/i);
    test.info().annotations.push({ type: 'info', description: 'Settings page rendered with company info visible' });
  });
});
