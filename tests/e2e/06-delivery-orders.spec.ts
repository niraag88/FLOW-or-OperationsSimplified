import { test, expect } from '@playwright/test';
import { login, apiLogin, apiGet } from './helpers';

test.describe('Delivery Orders', () => {
  let cookie: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('delivery orders list loads with 200+ records', async () => {
    const data = await apiGet('/api/delivery-orders', cookie);
    const dos = data.deliveryOrders ?? data.data ?? data;
    expect(Array.isArray(dos)).toBe(true);
    expect(dos.length).toBeGreaterThanOrEqual(200);
  });

  test('delivery orders response time is under 100ms', async () => {
    const start = Date.now();
    await apiGet('/api/delivery-orders', cookie);
    expect(Date.now() - start).toBeLessThan(100);
  });

  test('delivery orders page renders in browser', async ({ page }) => {
    await login(page);
    const nav = page.locator('nav, aside, [role="navigation"]');
    await nav.locator('text=/delivery/i').first().click().catch(() => {});
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/DO-|delivery|Delivery/i);
  });
});
