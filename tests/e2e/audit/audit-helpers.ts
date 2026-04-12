/**
 * audit-helpers.ts — shared utilities for the browser E2E audit suite
 *
 * The audit suite runs in sequence: 00 → 11. Context (IDs, cookies) is shared
 * via a JSON state file written to /tmp/audit-state.json between specs.
 */
import { Page } from '@playwright/test';
import * as fs from 'fs';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5000';
export const ADMIN = {
  username: process.env.E2E_ADMIN_USERNAME ?? 'admin',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
};

export const STATE_FILE = '/tmp/audit-state.json';

export interface AuditState {
  cookie: string;
  brandIds: { alpha: number; beta: number; gamma: number };
  productIds: number[];
  customerIds: number[];
  poIds: { po01: number; po02: number; po03: number };
  grnIds: { grn01: number; grn01b?: number; grn02?: number };
  quotationIds: { qt01: number; qt02: number; qt03: number };
  invoiceIds: { inv01: number; inv02: number; inv03: number; inv04: number };
  doIds: { do01: number; do02: number; do03?: number };
  recycleBinPoId?: number;
}

export function loadState(): Partial<AuditState> {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as AuditState;
    }
  } catch { /* state file not yet written */ }
  return {};
}

export function saveState(state: Partial<AuditState>): void {
  const existing = loadState();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...existing, ...state }, null, 2));
}

export async function apiLogin(username = ADMIN.username, password = ADMIN.password): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const cookie = resp.headers.get('set-cookie')?.split(';')[0] ?? '';
  return cookie;
}

export interface ApiResult<T = unknown> {
  status: number;
  data: T;
}

export async function apiGet<T = unknown>(path: string, cookie: string): Promise<T> {
  const r = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
  return r.json() as Promise<T>;
}

export async function apiPost<T = unknown>(path: string, body: object, cookie: string): Promise<ApiResult<T>> {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as T };
}

export async function apiPut<T = unknown>(path: string, body: object, cookie: string): Promise<ApiResult<T>> {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as T };
}

export async function apiPatch<T = unknown>(path: string, body: object, cookie: string): Promise<ApiResult<T>> {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as T };
}

export async function apiDelete(path: string, cookie: string): Promise<number> {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  return r.status;
}

export async function browserLogin(page: Page, username = ADMIN.username, password = ADMIN.password): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  const usernameField = page.locator('[data-testid="input-username"]');
  await usernameField.waitFor({ timeout: 15000 });
  await usernameField.fill(username);
  await page.locator('[data-testid="input-password"]').fill(password);
  await page.locator('[data-testid="button-login"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 }).catch(() => { /* may already be navigated */ });
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => { /* best effort */ });
  await page.waitForTimeout(1000);
}

export async function browserLoginFetch(page: Page, username: string, password: string): Promise<boolean> {
  await page.goto(`${BASE_URL}/login`);
  const userField = page.locator('[data-testid="input-username"]');
  await userField.waitFor({ timeout: 10000 });
  await userField.fill(username);
  await page.locator('[data-testid="input-password"]').fill(password);
  await page.locator('[data-testid="button-login"]').click();
  await page.waitForTimeout(2500);
  return !page.url().includes('/login');
}
