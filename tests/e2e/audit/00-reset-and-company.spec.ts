/**
 * Phase 0 — Factory Reset & Company Setup
 *
 * Tests:
 * 1. Anonymous user cannot call factory reset (401/403)
 * 2. Admin factory reset wipes all business data (API — explicit permission)
 * 3. Admin can log in via browser login form after reset
 * 4. Company settings page renders in browser with edit controls
 * 5. Company name, TRN, email can be edited and saved via browser form
 * 6. Updated values persist and appear on Settings page after reload
 * 7. Logo upload via hidden file input works in browser
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import { BASE_URL, apiLogin, apiPost, browserLogin, saveState } from './audit-helpers';

const FIXTURE_LOGO = path.join(__dirname, 'fixtures', 'test-logo.png');

test.describe('Phase 0 — Factory Reset & Company Setup', () => {
  test.setTimeout(120000);

  test('anonymous request to factory reset is rejected (401 or 403)', async () => {
    const resp = await fetch(`${BASE_URL}/api/ops/factory-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect([401, 403]).toContain(resp.status);
  });

  test('admin factory reset wipes all business data', async () => {
    const cookie = await apiLogin();
    expect(cookie.length).toBeGreaterThan(0);

    const { status, data } = await apiPost('/api/ops/factory-reset', {}, cookie);
    expect(status).toBe(200);
    expect((data as { ok: boolean }).ok).toBe(true);

    const products = await (await fetch(`${BASE_URL}/api/products`, { headers: { Cookie: cookie } })).json() as unknown;
    const brands = await (await fetch(`${BASE_URL}/api/brands`, { headers: { Cookie: cookie } })).json() as unknown;
    const productList = Array.isArray(products) ? products : ((products as any).products ?? []);
    const brandList = Array.isArray(brands) ? brands : ((brands as any).brands ?? []);
    expect(productList.length).toBe(0);
    expect(brandList.length).toBe(0);

    const cookie2 = await apiLogin();
    saveState({ cookie: cookie2 });
  });

  test('factory reset is idempotent — second call returns ok=true', async () => {
    const cookie = await apiLogin();
    const { status, data } = await apiPost('/api/ops/factory-reset', {}, cookie);
    expect(status).toBe(200);
    expect((data as { ok: boolean }).ok).toBe(true);
  });

  test('admin can log in via browser form and reaches the main app', async ({ page }) => {
    await browserLogin(page);
    expect(page.url()).not.toContain('/login');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);
  });

  test('company settings page has editable fields (Edit mode toggle present)', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const editBtn = page.locator('button').filter({ hasText: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
  });

  test('company name and TRN can be updated via browser form and persist after reload', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const editBtn = page.locator('button').filter({ hasText: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();
    await page.waitForTimeout(500);

    const companyNameField = page.locator('#company_name');
    await expect(companyNameField).toBeVisible({ timeout: 5000 });
    await companyNameField.clear();
    await companyNameField.fill('Audit Test Co LLC');

    const trnField = page.locator('#company_trn');
    await expect(trnField).toBeVisible({ timeout: 5000 });
    await trnField.clear();
    await trnField.fill('100123456700003');

    const emailField = page.locator('#company_email');
    await expect(emailField).toBeVisible({ timeout: 5000 });
    await emailField.clear();
    await emailField.fill('audit@audittestco.ae');

    const saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await page.waitForTimeout(2000);

    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/audit test co/i);
    expect(body).toContain('100123456700003');
  });

  test('logo upload via file input works in browser form', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const editBtn = page.locator('button').filter({ hasText: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();
    await page.waitForTimeout(500);

    const logoInput = page.locator('#logo-upload');
    await expect(logoInput).toBeAttached({ timeout: 5000 });
    await logoInput.setInputFiles(FIXTURE_LOGO);
    await page.waitForTimeout(1000);

    const saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await page.waitForTimeout(2000);

    const settings = await (await fetch(`${BASE_URL}/api/settings/company`, { headers: { Cookie: await apiLogin() } })).json() as { logo?: string };
    expect(typeof settings.logo).toBe('string');
    expect((settings.logo ?? '').length).toBeGreaterThan(0);
  });
});
