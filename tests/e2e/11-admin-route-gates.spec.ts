/**
 * Admin route gates (Task #319)
 *
 * Proves that:
 *   1. POST /api/audit-logs and POST /api/recycle-bin are removed (404 for everyone).
 *   2. Sensitive backup / restore / factory-reset POSTs reject anonymous (401)
 *      and Staff (403) callers — never executed as Admin in this suite to
 *      avoid wiping or mutating data.
 *   3. Sensitive admin-only GETs reject anonymous (401) and Staff (403),
 *      and succeed (200) for Admin.
 *   4. DELETE /api/storage/object rejects anonymous (401) and Staff (403).
 *
 * Self-provisions a dedicated Staff user (`route_gate_staff`) and cleans it
 * up afterwards so this spec is independent of any other test file.
 */

import { test, expect } from '@playwright/test';
import { ADMIN, BASE_URL } from './helpers';

const STAFF_USERNAME = 'route_gate_staff';
const STAFF_PASSWORD = 'RouteGate123!';

async function loginCookie(username: string, password: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (resp.status !== 200) {
    throw new Error(`Login as ${username} failed: ${resp.status}`);
  }
  const cookie = resp.headers.get('set-cookie')?.split(';')[0] ?? '';
  if (!cookie) throw new Error(`No session cookie returned for ${username}`);
  return cookie;
}

async function api(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  cookie: string,
  body?: object,
): Promise<{ status: number }> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: resp.status };
}

test.describe('Admin route gates (Task #319)', () => {
  let adminCookie = '';
  let staffCookie = '';
  let staffUserId = '';

  test.beforeAll(async () => {
    adminCookie = await loginCookie(ADMIN.username, ADMIN.password);

    // Clean up leftover staff user from a previous interrupted run.
    const listResp = await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: adminCookie } });
    const listData = (await listResp.json()) as { users?: Array<{ id: string; username: string }> };
    const existing = (listData.users ?? []).find((u) => u.username === STAFF_USERNAME);
    if (existing) {
      await api('DELETE', `/api/users/${existing.id}`, adminCookie);
    }

    // Provision the Staff fixture user.
    const createResp = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        username: STAFF_USERNAME,
        password: STAFF_PASSWORD,
        role: 'Staff',
        firstName: 'Route',
        lastName: 'Gate',
        email: 'route.gate@audit.test',
      }),
    });
    if (createResp.status !== 201) {
      const text = await createResp.text().catch(() => '');
      throw new Error(`Failed to create Staff fixture user: ${createResp.status} ${text}`);
    }
    const created = (await createResp.json()) as { user?: { id: string } };
    staffUserId = created.user?.id ?? '';
    expect(staffUserId).toBeTruthy();

    staffCookie = await loginCookie(STAFF_USERNAME, STAFF_PASSWORD);
  });

  test.afterAll(async () => {
    if (staffUserId && adminCookie) {
      await api('DELETE', `/api/users/${staffUserId}`, adminCookie);
    }
  });

  // ── 1. Removed routes (POST /api/audit-logs, POST /api/recycle-bin) ──────

  test('POST /api/audit-logs is removed (anonymous, staff, admin all → 404)', async () => {
    const body = { entity_type: 'forged', entity_id: '1', action: 'CREATE' };
    const anon = await api('POST', '/api/audit-logs', '', body);
    const staff = await api('POST', '/api/audit-logs', staffCookie, body);
    const admin = await api('POST', '/api/audit-logs', adminCookie, body);
    expect(anon.status).toBe(404);
    expect(staff.status).toBe(404);
    expect(admin.status).toBe(404);
  });

  test('POST /api/recycle-bin is removed (anonymous, staff, admin all → 404)', async () => {
    const body = { document_type: 'Invoice', document_id: 'forged', document_data: '{}' };
    const anon = await api('POST', '/api/recycle-bin', '', body);
    const staff = await api('POST', '/api/recycle-bin', staffCookie, body);
    const admin = await api('POST', '/api/recycle-bin', adminCookie, body);
    expect(anon.status).toBe(404);
    expect(staff.status).toBe(404);
    expect(admin.status).toBe(404);
  });

  // ── 2. Sensitive admin-only POSTs: reject anon + staff, never run as admin ──

  const sensitivePosts: Array<{ name: string; path: string; body: object }> = [
    { name: 'POST /api/ops/run-backups', path: '/api/ops/run-backups', body: {} },
    { name: 'POST /api/ops/restore-upload', path: '/api/ops/restore-upload', body: {} },
    {
      name: 'POST /api/ops/backup-runs/:id/restore',
      path: '/api/ops/backup-runs/999999/restore',
      body: {},
    },
    { name: 'POST /api/ops/factory-reset', path: '/api/ops/factory-reset', body: {} },
  ];

  for (const route of sensitivePosts) {
    test(`${route.name} → 401 anon, 403 staff (admin gate proven)`, async () => {
      const anon = await api('POST', route.path, '', route.body);
      expect(anon.status).toBe(401);
      const staff = await api('POST', route.path, staffCookie, route.body);
      expect(staff.status).toBe(403);
    });
  }

  // ── 3. Sensitive admin-only GETs: 401 anon, 403 staff, 200 admin ─────────

  const sensitiveGets: Array<{ name: string; path: string }> = [
    { name: 'GET /api/ops/backup-status', path: '/api/ops/backup-status' },
    { name: 'GET /api/ops/backup-runs', path: '/api/ops/backup-runs' },
    { name: 'GET /api/ops/restore-runs', path: '/api/ops/restore-runs' },
    { name: 'GET /api/storage/list-prefix?prefix=backups/', path: '/api/storage/list-prefix?prefix=backups/' },
    { name: 'GET /api/db/size', path: '/api/db/size' },
    { name: 'GET /api/storage/total-size', path: '/api/storage/total-size' },
    { name: 'GET /api/system/app-size', path: '/api/system/app-size' },
  ];

  for (const route of sensitiveGets) {
    test(`${route.name} → 401 anon, 403 staff, 200 admin`, async () => {
      const anon = await api('GET', route.path, '');
      expect(anon.status).toBe(401);
      const staff = await api('GET', route.path, staffCookie);
      expect(staff.status).toBe(403);
      const admin = await api('GET', route.path, adminCookie);
      expect(admin.status).toBe(200);
    });
  }

  // ── 4. DELETE /api/storage/object: 401 anon, 403 staff (skip admin) ──────

  test('DELETE /api/storage/object → 401 anon, 403 staff (admin gate proven)', async () => {
    const path = '/api/storage/object?key=does-not-exist/route-gate-test.pdf';
    const anon = await api('DELETE', path, '');
    expect(anon.status).toBe(401);
    const staff = await api('DELETE', path, staffCookie);
    expect(staff.status).toBe(403);
  });
});
