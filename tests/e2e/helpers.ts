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

// ── Minimal typed interfaces for API response shapes ──────────────────────────

export interface ApiProduct {
  id: number;
  sku: string;
  name: string;
  category: string;
  unitPrice?: string | number;
  unit_price?: number;
  stockQuantity?: number;
  stock_qty?: number;
}

export interface ApiCustomer {
  id: number;
  name: string;
  email?: string;
}

export interface ApiSupplier {
  id: number;
  name: string;
}

export interface ApiQuotation {
  id: number;
  quotation_number?: string;
  status?: string;
  total_amount?: number;
}

export interface ApiInvoice {
  id: number;
  invoice_number?: string;
  status?: string;
  total_amount?: number;
  due_date?: string;
}

export interface ApiPurchaseOrder {
  id: number;
  po_number?: string;
  status?: string;
  supplier_id?: number;
  total_amount?: number;
}

export interface ApiDeliveryOrder {
  id: number;
  do_number?: string;
  status?: string;
}

// ── Auth / HTTP helpers ───────────────────────────────────────────────────────

export async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  const usernameField = page.locator('[data-testid="input-username"]');
  await usernameField.waitFor({ timeout: 10000 });
  await usernameField.fill(ADMIN.username);
  await page.locator('[data-testid="input-password"]').fill(ADMIN.password);
  await page.locator('[data-testid="button-login"]').click();
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

// ── CSRF helpers (Task #374) ──────────────────────────────────────────────────
//
// Two layers protect existing specs from the new CSRF middleware:
//
//   1. `apiPost`/`apiPut`/`apiDelete` explicitly call `withCsrf()` and attach
//      the token + paired cookie themselves.
//   2. A global `fetch` interceptor (installed at module load) auto-attaches
//      a CSRF token to ANY raw `fetch(..., { method: 'POST' | ... })` call
//      that targets `${BASE_URL}/api/*` and carries a session cookie. This
//      keeps the ~99 raw mutating fetches scattered across spec files
//      working without per-callsite changes.
//
// Tests that need the un-intercepted fetch (e.g. the CSRF regression spec
// itself) should import `rawFetch` from this module.

const CSRF_COOKIE_NAME = 'flow.x-csrf-token';
const SESSION_COOKIE_REGEX = /connect\.sid=[^;]+/;
const SIGNED_UPLOAD_PATH_REGEX = /^\/api\/storage\/upload\/[A-Za-z0-9]+$/;
const SKIP_PATHS = new Set<string>([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/csrf-token',
]);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const rawFetch: typeof fetch = globalThis.fetch.bind(globalThis);

const csrfCache = new Map<string, { token: string; combinedCookie: string; csrfCookie: string }>();

function pickCsrfCookieFromHeaders(setCookieHeaders: string[]): string {
  for (const sc of setCookieHeaders) {
    const semi = sc.indexOf(';');
    const pair = (semi === -1 ? sc : sc.slice(0, semi)).trim();
    if (pair.startsWith(`${CSRF_COOKIE_NAME}=`)) return pair;
  }
  return '';
}

async function withCsrf(sessionCookie: string): Promise<{ token: string; combinedCookie: string; csrfCookie: string }> {
  const cached = csrfCache.get(sessionCookie);
  if (cached) return cached;

  const r = await rawFetch(`${BASE_URL}/api/auth/csrf-token`, {
    headers: { Cookie: sessionCookie },
  });
  if (!r.ok) {
    throw new Error(`Failed to fetch CSRF token: ${r.status} ${await r.text()}`);
  }
  const data = (await r.json()) as { csrfToken: string };

  // Node 18+: getSetCookie() returns one entry per Set-Cookie header.
  const setCookies =
    typeof (r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (r.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [r.headers.get('set-cookie') ?? ''];
  const csrfCookie = pickCsrfCookieFromHeaders(setCookies);
  if (!csrfCookie) {
    throw new Error('CSRF cookie was not set by /api/auth/csrf-token');
  }

  const result = {
    token: data.csrfToken,
    csrfCookie,
    combinedCookie: `${sessionCookie}; ${csrfCookie}`,
  };
  csrfCache.set(sessionCookie, result);
  return result;
}

// Install global fetch interceptor — auto-attaches CSRF to raw mutating
// fetches against the live server. Idempotent: re-importing helpers.ts in
// multiple specs only patches once thanks to the marker symbol.
const PATCHED_MARKER = Symbol.for('flow.csrf.patched');
type PatchedFetch = typeof fetch & { [PATCHED_MARKER]?: true };
if (!(globalThis.fetch as PatchedFetch)[PATCHED_MARKER]) {
  function resolveUrlAndMethod(input: RequestInfo | URL, init?: RequestInit): { url: string; method: string } {
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET') ?? 'GET').toUpperCase();
    let url: string;
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.toString();
    else url = (input as Request).url;
    return { url, method };
  }

  const patched: PatchedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const { url, method } = resolveUrlAndMethod(input, init);

    if (!url.startsWith(BASE_URL)) return rawFetch(input, init);
    if (!MUTATING_METHODS.has(method)) return rawFetch(input, init);

    const pathOnly = url.slice(BASE_URL.length).split('?')[0];
    if (!pathOnly.startsWith('/api/')) return rawFetch(input, init);
    if (SKIP_PATHS.has(pathOnly)) return rawFetch(input, init);
    if (SIGNED_UPLOAD_PATH_REGEX.test(pathOnly)) return rawFetch(input, init);

    const headers = new Headers(init?.headers);
    // Caller already set a token (regression spec exercising rejection paths
    // or success path) — don't overwrite.
    if (headers.has('x-csrf-token')) return rawFetch(input, init);

    const cookieHeader = headers.get('cookie');
    if (!cookieHeader) return rawFetch(input, init);

    const sessionMatch = cookieHeader.match(SESSION_COOKIE_REGEX);
    if (!sessionMatch) return rawFetch(input, init);

    try {
      const { token, csrfCookie } = await withCsrf(sessionMatch[0]);
      headers.set('X-CSRF-Token', token);
      // Avoid duplicating the csrf cookie if it's already in the Cookie header.
      if (!cookieHeader.includes(`${CSRF_COOKIE_NAME}=`)) {
        headers.set('Cookie', `${cookieHeader}; ${csrfCookie}`);
      }
      return rawFetch(input, { ...init, headers });
    } catch {
      // If token fetch fails (e.g. session expired), fall through and let the
      // server return its real error to the caller.
      return rawFetch(input, init);
    }
  }) as PatchedFetch;
  patched[PATCHED_MARKER] = true;
  globalThis.fetch = patched;
}

export async function apiGet(path: string, cookie: string): Promise<unknown> {
  const r = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
  return r.json();
}

export async function apiPost(path: string, body: object, cookie: string) {
  const { token, combinedCookie } = await withCsrf(cookie);
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: combinedCookie,
      'X-CSRF-Token': token,
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as unknown };
}

export async function apiPut(path: string, body: object, cookie: string) {
  const { token, combinedCookie } = await withCsrf(cookie);
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: combinedCookie,
      'X-CSRF-Token': token,
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as unknown };
}

export async function apiDelete(path: string, cookie: string) {
  const { token, combinedCookie } = await withCsrf(cookie);
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: {
      Cookie: combinedCookie,
      'X-CSRF-Token': token,
    },
  });
  return r.status;
}

/** Extract unit price from an ApiProduct (handles camelCase or snake_case API responses) */
export function productPrice(p: ApiProduct): number {
  return parseFloat(String(p.unitPrice ?? p.unit_price ?? 0));
}

/** Extract stock quantity from an ApiProduct */
export function productStock(p: ApiProduct): number {
  return p.stockQuantity ?? p.stock_qty ?? 0;
}

// ── Response-shape helpers ────────────────────────────────────────────────────

export function toProductList(raw: unknown): ApiProduct[] {
  if (Array.isArray(raw)) return raw as ApiProduct[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).products)) {
    return (raw as Record<string, unknown>).products as ApiProduct[];
  }
  return [];
}

export function toCustomerList(raw: unknown): ApiCustomer[] {
  if (Array.isArray(raw)) return raw as ApiCustomer[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).customers)) {
    return (raw as Record<string, unknown>).customers as ApiCustomer[];
  }
  return [];
}

export function toSupplierList(raw: unknown): ApiSupplier[] {
  if (Array.isArray(raw)) return raw as ApiSupplier[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).suppliers)) {
    return (raw as Record<string, unknown>).suppliers as ApiSupplier[];
  }
  return [];
}

export function toQuotationList(raw: unknown): ApiQuotation[] {
  if (Array.isArray(raw)) return raw as ApiQuotation[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).quotations)) {
    return (raw as Record<string, unknown>).quotations as ApiQuotation[];
  }
  return [];
}

export function toInvoiceList(raw: unknown): ApiInvoice[] {
  if (Array.isArray(raw)) return raw as ApiInvoice[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).invoices)) {
    return (raw as Record<string, unknown>).invoices as ApiInvoice[];
  }
  return [];
}

export function toPurchaseOrderList(raw: unknown): ApiPurchaseOrder[] {
  if (Array.isArray(raw)) return raw as ApiPurchaseOrder[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.purchaseOrders)) return obj.purchaseOrders as ApiPurchaseOrder[];
    if (Array.isArray(obj.data)) return obj.data as ApiPurchaseOrder[];
  }
  return [];
}

export function toDeliveryOrderList(raw: unknown): ApiDeliveryOrder[] {
  if (Array.isArray(raw)) return raw as ApiDeliveryOrder[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).deliveryOrders)) {
    return (raw as Record<string, unknown>).deliveryOrders as ApiDeliveryOrder[];
  }
  return [];
}
