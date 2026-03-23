import { Page } from '@playwright/test';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5000';

const E2E_USER = process.env.E2E_ADMIN_USERNAME;
const E2E_PASS = process.env.E2E_ADMIN_PASSWORD;
if (!E2E_USER || !E2E_PASS) {
  console.warn('[e2e] E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD not set — using dev defaults');
}
export const ADMIN = {
  username: E2E_USER ?? 'admin',
  password: E2E_PASS ?? 'admin123',
};

export async function login(page: Page) {
  // Navigate to login page (unauthenticated routes redirect here)
  await page.goto(`${BASE_URL}/login`);
  const usernameField = page.locator('[data-testid="input-username"]');
  await usernameField.waitFor({ timeout: 10000 });
  await usernameField.fill(ADMIN.username);
  await page.locator('[data-testid="input-password"]').fill(ADMIN.password);
  await page.locator('[data-testid="button-login"]').click();
  // After login the app navigates away from /login — wait for URL change
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
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
