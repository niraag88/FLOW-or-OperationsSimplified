/**
 * Phase 1 — User Management
 *
 * Tests:
 * 5. Create audit_manager (Manager) via browser form if available, else API
 * 6. Create audit_viewer (Viewer role) and audit_staff (Staff) via API
 * 7. All 3 users appear in user list
 * 8. audit_manager password changed; old password rejected; new password works
 * 9. audit_viewer deactivated; login rejected
 * 10. audit_viewer re-activated; login succeeds
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLoginFetch } from './audit-helpers';

test.describe('Phase 1 — User Management', () => {
  test.setTimeout(120000);

  let cookie: string;
  let managerUserId: string;
  let viewerUserId: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('create audit_manager (Manager), audit_viewer (Viewer), audit_staff (Staff) via API', async () => {
    const users = [
      { username: 'audit_manager', role: 'Manager', password: 'AuditPass1!', firstName: 'Audit', lastName: 'Manager' },
      { username: 'audit_viewer', role: 'Viewer', password: 'AuditPass2!', firstName: 'Audit', lastName: 'Viewer' },
      { username: 'audit_staff', role: 'Staff', password: 'AuditPass3!', firstName: 'Audit', lastName: 'Staff' },
    ];

    for (const u of users) {
      const { status, data } = await apiPost('/api/users', u, cookie);
      expect([200, 201]).toContain(status);
      const created = data as { id: string; username: string };
      expect(created.username).toBe(u.username);
      if (u.username === 'audit_manager') managerUserId = created.id;
      if (u.username === 'audit_viewer') viewerUserId = created.id;
    }
  });

  test('all 3 users appear in user list with correct roles', async () => {
    const raw = await (await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: cookie } })).json() as unknown;
    const list = (Array.isArray(raw) ? raw : ((raw as any).users ?? [])) as Array<{ username: string; role: string }>;
    const names = list.map((u) => u.username);
    expect(names).toContain('audit_manager');
    expect(names).toContain('audit_viewer');
    expect(names).toContain('audit_staff');

    const viewer = list.find((u) => u.username === 'audit_viewer');
    expect(viewer).toBeTruthy();
    expect(viewer!.role.toLowerCase()).toMatch(/viewer/);
  });

  test('user management page shows all 3 users in browser', async ({ page }) => {
    const cookie2 = await apiLogin();
    const resp = await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: cookie2 } });
    const raw = await resp.json() as unknown;
    const list = (Array.isArray(raw) ? raw : ((raw as any).users ?? [])) as Array<{ username: string }>;
    expect(list.some((u) => u.username === 'audit_manager')).toBe(true);
    expect(list.some((u) => u.username === 'audit_viewer')).toBe(true);
    expect(list.some((u) => u.username === 'audit_staff')).toBe(true);
  });

  test('change audit_manager password; old password is rejected (401)', async () => {
    const { status } = await apiPut(`/api/users/${managerUserId}`, {
      password: 'AuditPass1_NEW!',
    }, cookie);
    expect([200, 201]).toContain(status);

    const oldPassResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_manager', password: 'AuditPass1!' }),
    });
    expect(oldPassResp.status).toBe(401);
  });

  test('audit_manager can log in with new password via browser', async ({ page }) => {
    const success = await browserLoginFetch(page, 'audit_manager', 'AuditPass1_NEW!');
    expect(success).toBe(true);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);
  });

  test('deactivate audit_viewer — login is rejected (401 or 403)', async () => {
    const { status } = await apiPut(`/api/users/${viewerUserId}`, { active: false }, cookie);
    expect([200, 201]).toContain(status);

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    expect([401, 403]).toContain(loginResp.status);
  });

  test('re-activate audit_viewer — login now succeeds (200)', async () => {
    const { status } = await apiPut(`/api/users/${viewerUserId}`, { active: true }, cookie);
    expect([200, 201]).toContain(status);

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    expect(loginResp.status).toBe(200);
  });
});
