import { test, expect } from '@playwright/test';
import { login, apiLogin, apiGet, ADMIN, BASE_URL } from './helpers';

test.describe('Authentication', () => {
  test('login page renders and accepts credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('[data-testid="input-username"]')).toBeVisible();
    await page.locator('[data-testid="input-username"]').fill(ADMIN.username);
    await page.locator('[data-testid="input-password"]').fill(ADMIN.password);
    await page.locator('[data-testid="button-login"]').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
    expect(page.url()).not.toContain('/login');
  });

  test('wrong password shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('[data-testid="input-username"]').fill(ADMIN.username);
    await page.locator('[data-testid="input-password"]').fill('definitively-wrong-password-xyz');
    await page.locator('[data-testid="button-login"]').click();
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/login');
  });

  test('API auth/me returns user when authenticated', async () => {
    const cookie = await apiLogin();
    const data = await apiGet('/api/auth/me', cookie);
    const user = data.user ?? data;
    expect(user.username).toBe(ADMIN.username);
    expect(user.role).toBeTruthy();
  });

  test('API auth/me returns 401 without session', async () => {
    const r = await fetch(`${BASE_URL}/api/auth/me`);
    expect(r.status).toBe(401);
  });
});
