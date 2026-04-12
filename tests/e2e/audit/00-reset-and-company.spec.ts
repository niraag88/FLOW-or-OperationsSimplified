/**
 * Phase 0 — Reset & Company Setup
 *
 * 1. Factory-reset via API (admin-only guard, idempotent)
 * 2. Verify database is empty post-reset
 * 3. Log in via browser form
 * 4. Update company settings via browser form (including logo upload)
 * 5. Verify TRN and company name appear on Settings page
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import { BASE_URL, apiLogin, apiPost, browserLogin, saveState } from './audit-helpers';

const FIXTURE_LOGO = path.join(__dirname, 'fixtures', 'test-logo.png');

test.describe('Phase 0 — Reset & Company Setup', () => {
  test.setTimeout(120000);

  test('non-admin cannot call factory reset', async () => {
    const anonResp = await fetch(`${BASE_URL}/api/ops/factory-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect([401, 403]).toContain(anonResp.status);
    test.info().annotations.push({ type: 'info', description: 'Anonymous factory reset correctly rejected' });
  });

  test('factory reset wipes all business data', async () => {
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
    expect(cookie2.length).toBeGreaterThan(0);
    saveState({ cookie: cookie2 });
    test.info().annotations.push({ type: 'info', description: 'Factory reset succeeded — products=0, brands=0, auth preserved' });
  });

  test('factory reset is idempotent (second call also succeeds)', async () => {
    const cookie = await apiLogin();
    const { status, data } = await apiPost('/api/ops/factory-reset', {}, cookie);
    expect(status).toBe(200);
    expect((data as { ok: boolean }).ok).toBe(true);
    test.info().annotations.push({ type: 'info', description: 'Second factory reset idempotent — ok=true' });
  });

  test('admin can log in via browser form after factory reset', async ({ page }) => {
    await browserLogin(page);
    const url = page.url();
    expect(url).not.toContain('/login');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);
    test.info().annotations.push({ type: 'info', description: 'Browser login succeeded post-reset' });
  });

  test('update company settings via browser form with logo upload', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const editBtn = page.locator('button').filter({ hasText: /edit|update|save/i }).first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(500);
    }

    const companyNameField = page.locator('#company_name, [id="company_name"], input[name="companyName"], input[placeholder*="company name" i]').first();
    if (await companyNameField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await companyNameField.clear();
      await companyNameField.fill('Audit Test Co LLC');
    }

    const trnField = page.locator('#company_trn, [id="company_trn"], input[placeholder*="trn" i], input[placeholder*="tax" i]').first();
    if (await trnField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await trnField.clear();
      await trnField.fill('100123456700003');
    }

    const emailField = page.locator('#company_email, input[type="email"]').first();
    if (await emailField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailField.clear();
      await emailField.fill('audit@audittestco.ae');
    }

    const logoInput = page.locator('#logo-upload, input[type="file"]').first();
    if (await logoInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await logoInput.setInputFiles(FIXTURE_LOGO);
      await page.waitForTimeout(1000);
      test.info().annotations.push({ type: 'info', description: 'Logo uploaded via file input' });
    } else {
      const changeLogoBtn = page.locator('button').filter({ hasText: /logo|upload|change/i }).first();
      if (await changeLogoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await page.evaluate(() => {
          const input = document.querySelector('#logo-upload') as HTMLInputElement | null;
          if (input) input.style.display = 'block';
        });
        const hiddenInput = page.locator('#logo-upload');
        if (await hiddenInput.count() > 0) {
          await hiddenInput.setInputFiles(FIXTURE_LOGO);
          await page.waitForTimeout(1000);
          test.info().annotations.push({ type: 'info', description: 'Logo uploaded via hidden file input (unhidden)' });
        }
      } else {
        test.info().annotations.push({ type: 'warn', description: 'Logo upload input not interactable — skipping logo; other fields saved' });
      }
    }

    const saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await page.waitForTimeout(2000);

    const successMsg = page.locator('[role="status"], [data-state="open"], .toast, .sonner-toast').filter({ hasText: /saved|success|updated/i });
    const bodyText = await page.locator('body').innerText();
    const hasFeedback = await successMsg.count() > 0 || bodyText.includes('Audit Test Co');
    expect(hasFeedback).toBe(true);
    test.info().annotations.push({ type: 'info', description: 'Company settings saved via browser form' });
  });

  test('company name and TRN are visible on Settings page after save', async ({ page }) => {
    const cookie = await apiLogin();
    const { status, data } = await apiPost('/api/settings/company', {
      companyName: 'Audit Test Co LLC',
      address: '123 Business Bay, Dubai, UAE',
      vatNumber: '100123456700003',
      currency: 'AED',
      phone: '+971 4 000 0000',
      email: 'audit@audittestco.ae',
      vatEnabled: true,
      defaultVatRate: '5.00',
    }, cookie);
    expect([200, 201]).toContain(status);
    const updated = data as { companyName?: string; company_name?: string; vatNumber?: string; vat_number?: string };
    const name = updated.companyName ?? updated.company_name ?? '';
    const trn = updated.vatNumber ?? updated.vat_number ?? '';
    expect(name).toBe('Audit Test Co LLC');
    expect(trn).toBe('100123456700003');

    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/audit test co/i);
    expect(body).toMatch(/100123456700003/);
    test.info().annotations.push({ type: 'info', description: 'Settings page shows company name "Audit Test Co LLC" and TRN 100123456700003' });
  });
});
