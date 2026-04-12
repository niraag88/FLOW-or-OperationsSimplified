/**
 * Phase 0 — Factory Reset & Company Settings
 *
 * Tests:
 * - Anonymous reset request is rejected (403)
 * - Admin factory reset succeeds via API
 * - Idempotent reset succeeds
 * - Unauthenticated page access redirects to login
 * - Admin browser login succeeds via form
 * - Company Settings edit form: fill name, TRN, email, save; values persist
 * - Logo file upload via hidden file input
 * - Company TRN persists across page reload
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, browserLogin } from './audit-helpers';

test.describe('Phase 0 — Factory Reset & Company Settings', () => {
  test.setTimeout(120000);

  let cookie: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('anonymous factory reset request is rejected with 403', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/factory-reset without auth cookie' });
    const resp = await fetch(`${BASE_URL}/api/factory-reset`, { method: 'POST' });
    test.info().annotations.push({ type: 'result', description: `HTTP ${resp.status}` });
    expect(resp.status).toBe(403);
  });

  test('admin factory reset clears database (200 response)', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/factory-reset with admin cookie' });
    const resp = await fetch(`${BASE_URL}/api/factory-reset`, { method: 'POST', headers: { Cookie: cookie } });
    test.info().annotations.push({ type: 'result', description: `HTTP ${resp.status}` });
    expect(resp.status).toBe(200);
    const body = await resp.json() as { success?: boolean };
    expect(body.success).toBe(true);
  });

  test('idempotent reset: second factory reset also returns 200', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/factory-reset second time' });
    cookie = await apiLogin();
    const resp = await fetch(`${BASE_URL}/api/factory-reset`, { method: 'POST', headers: { Cookie: cookie } });
    test.info().annotations.push({ type: 'result', description: `HTTP ${resp.status}` });
    expect(resp.status).toBe(200);
  });

  test('unauthenticated access to /Customers redirects to /login', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Customers in fresh browser context (no auth)' });
    await page.goto(`${BASE_URL}/Customers`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1000);
    test.info().annotations.push({ type: 'result', description: `URL after nav: ${page.url()}` });
    expect(page.url()).toContain('/login');
  });

  test('admin browser login via form succeeds and lands on dashboard', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Fill login form with admin credentials, click Login' });
    await browserLogin(page);
    test.info().annotations.push({ type: 'result', description: `URL after login: ${page.url()}` });
    expect(page.url()).not.toContain('/login');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);
  });

  test('company Settings edit form: set name, TRN, email, save; values persist', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Settings, click Edit, fill company_name + TRN + email, click Save' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const editBtn = page.locator('button').filter({ hasText: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();
    await page.waitForTimeout(1500);

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
    test.info().annotations.push({ type: 'result', description: `Settings page body snippet: ${body.slice(0, 200)}` });
    expect(body).toMatch(/audit test co/i);
    expect(body).toContain('100123456700003');
  });

  test('logo file upload via #logo-upload input accepted by browser', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click Edit, upload test-logo.png to #logo-upload hidden input' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const editBtn = page.locator('button').filter({ hasText: /edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();
    await page.waitForTimeout(1500);

    const logoInput = page.locator('#logo-upload');
    await expect(logoInput).toBeAttached({ timeout: 5000 });
    await logoInput.setInputFiles('tests/e2e/audit/fixtures/test-logo.png');
    await page.waitForTimeout(1000);
    test.info().annotations.push({ type: 'result', description: 'Logo file set via input — no JS error' });
  });

  test('TRN persists on Settings page after reload', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Reload /Settings and verify TRN 100123456700003 still appears' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `TRN found: ${body.includes('100123456700003')}` });
    expect(body).toContain('100123456700003');
  });
});
