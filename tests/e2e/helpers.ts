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

export async function apiGet(path: string, cookie: string): Promise<unknown> {
  const r = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
  return r.json();
}

export async function apiPost(path: string, body: object, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as unknown };
}

export async function apiPut(path: string, body: object, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: (await r.json()) as unknown };
}

export async function apiDelete(path: string, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
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
