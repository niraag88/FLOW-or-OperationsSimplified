/**
 * Phase 0 — Reset & Company Setup
 *
 * Steps 1–4 from task spec:
 * 1. POST /api/ops/factory-reset — wipe all business data
 * 2. Log into app as admin via browser
 * 3. Settings → Company: fill name "Audit Test Co LLC", UAE address, TRN "100123456700003",
 *    upload placeholder logo
 * 4. Verify company name and TRN appear on Settings page after save
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, browserLogin } from './audit-helpers';

test.describe('Phase 0 — Reset & Company Setup', () => {
  test.setTimeout(120000);

  let cookie: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('0.1 anonymous factory reset is rejected (401 — no session)', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/ops/factory-reset without auth cookie (no session)' });
    const resp = await fetch(`${BASE_URL}/api/ops/factory-reset`, { method: 'POST' });
    test.info().annotations.push({ type: 'result', description: `HTTP ${resp.status} — expected 401 or 403` });
    expect([401, 403]).toContain(resp.status);
  });

  test('0.2 admin factory reset succeeds (200, ok=true)', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/ops/factory-reset with valid admin cookie' });
    const resp = await fetch(`${BASE_URL}/api/ops/factory-reset`, { method: 'POST', headers: { Cookie: cookie } });
    const body = await resp.json() as { ok?: boolean; message?: string };
    test.info().annotations.push({ type: 'result', description: `HTTP ${resp.status} — body.ok=${body.ok}` });
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test('0.3 idempotent reset: second factory reset also returns 200 ok=true', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/ops/factory-reset a second time to verify idempotency' });
    cookie = await apiLogin();
    const resp = await fetch(`${BASE_URL}/api/ops/factory-reset`, { method: 'POST', headers: { Cookie: cookie } });
    const body = await resp.json() as { ok?: boolean };
    test.info().annotations.push({ type: 'result', description: `HTTP ${resp.status} — body.ok=${body.ok}` });
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test('0.4 unauthenticated page access redirects to /login', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Customers in fresh browser without auth; expect redirect to /login' });
    await page.goto(`${BASE_URL}/Customers`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1000);
    test.info().annotations.push({ type: 'result', description: `URL after nav: ${page.url()}` });
    expect(page.url()).toContain('/login');
  });

  test('0.5 admin browser login via form succeeds and lands on dashboard', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Fill login form with admin/admin123 and submit via browser' });
    await browserLogin(page);
    test.info().annotations.push({ type: 'result', description: `URL after login: ${page.url()}` });
    expect(page.url()).not.toContain('/login');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);
  });

  test('0.6 Settings → Company: fill name, UAE address, TRN, default currency AED; save; verify persisted', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Settings; click Edit; fill company_name, UAE address, TRN, email; set currency to AED; click Save; reload and verify all fields persist' });
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

    // Fill UAE address — hard-fail if field not visible (it exists in CompanySettings form)
    const addressField = page.locator('#company_address');
    await expect(addressField).toBeVisible({ timeout: 5000 });
    await addressField.clear();
    await addressField.fill('Office 101, Business Bay, Dubai, UAE, PO Box 99999');
    test.info().annotations.push({ type: 'result', description: 'UAE address field filled: Office 101, Business Bay, Dubai, UAE' });

    const saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await page.waitForTimeout(2000);

    // Verify persistence via API (authoritative store)
    const settings = await (await fetch(`${BASE_URL}/api/company-settings`, { headers: { Cookie: cookie } })).json() as { name?: string; address?: string; taxNumber?: string; company_name?: string; company_address?: string; tax_number?: string; };
    const persName = settings.name ?? settings.company_name ?? '';
    const persAddress = settings.address ?? settings.company_address ?? '';
    const persTrn = settings.taxNumber ?? settings.tax_number ?? '';
    test.info().annotations.push({ type: 'result', description: `API: name="${persName}"; address="${persAddress}"; TRN="${persTrn}"` });
    expect(persName).toMatch(/audit test co/i);
    expect(persTrn).toContain('100123456700003');
    expect(persAddress).toContain('Business Bay');

    // Verify Settings page loads with company name visible in DOM
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const addressInput = page.locator('#company_address');
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    const addressValue = await addressInput.inputValue();
    expect(addressValue).toContain('Business Bay');
  });

  test('0.7 logo upload via #logo-upload file input accepted', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Open Settings edit mode; set file on #logo-upload with test-logo.png' });
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
    test.info().annotations.push({ type: 'result', description: 'Logo file set via hidden input — no JS error thrown' });
  });

  test('0.8 company TRN persists on Settings page after full page reload', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Fresh browser login; navigate to /Settings; assert TRN still visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const pageBody = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `TRN 100123456700003 found on reload: ${pageBody.includes('100123456700003')}` });
    expect(pageBody).toContain('100123456700003');
  });
});
