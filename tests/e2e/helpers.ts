import { Page } from '@playwright/test';

export const BASE_URL = 'http://localhost:5000';
export const ADMIN = { username: 'admin', password: 'admin123' };

export async function login(page: Page) {
  await page.goto('/');
  const isLogin = await page.locator('input[data-testid="input-username"], input[placeholder*="sername"], input[type="text"]').first().isVisible().catch(() => false);
  if (isLogin) {
    await page.locator('input[data-testid="input-username"], input[placeholder*="sername"], input[type="text"]').first().fill(ADMIN.username);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")').click();
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 8000 });
  }
}

export async function apiLogin(): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  const cookie = resp.headers.get('set-cookie')?.split(';')[0] ?? '';
  return cookie;
}

export async function apiGet(path: string, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
  return r.json();
}

export async function apiPost(path: string, body: object, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

export async function apiPut(path: string, body: object, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

export async function apiDelete(path: string, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  return r.status;
}
