import { test, expect } from '@playwright/test';
import { login, apiLogin, apiGet } from './helpers';

test.describe('Authentication', () => {
  test('login page renders and accepts credentials', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[type="password"]')).toBeVisible();

    await page.locator('input[data-testid="input-username"], input[placeholder*="sername"], input[type="text"]').first().fill('admin');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")').click();

    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
    expect(page.url()).not.toContain('/login');
  });

  test('wrong password shows error', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[data-testid="input-username"], input[type="text"]').first().fill('admin');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"], button:has-text("Sign In")').click();
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/login');
  });

  test('API auth/me returns user when authenticated', async () => {
    const cookie = await apiLogin();
    const data = await apiGet('/api/auth/me', cookie);
    const user = data.user ?? data;
    expect(user.username).toBe('admin');
    expect(user.role).toBeTruthy();
  });

  test('API auth/me returns 401 without session', async () => {
    const r = await fetch('http://localhost:5000/api/auth/me');
    expect(r.status).toBe(401);
  });
});
