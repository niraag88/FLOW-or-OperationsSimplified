/**
 * Phase 1 — User Management
 *
 * 5-11. Create users, edit, login with new password, deactivate/reactivate
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLoginFetch } from './audit-helpers';

test.describe('Phase 1 — User Management', () => {
  test.setTimeout(120000);

  let cookie: string;
  let managerUserId: string;
  let viewerUserId: string;
  let staffUserId: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('create three audit users via API', async () => {
    const users = [
      { username: 'audit_manager', role: 'Manager', password: 'AuditPass1!', firstName: 'Audit', lastName: 'Manager' },
      { username: 'audit_viewer', role: 'Staff', password: 'AuditPass2!', firstName: 'Audit', lastName: 'Viewer' },
      { username: 'audit_staff', role: 'Staff', password: 'AuditPass3!', firstName: 'Audit', lastName: 'Staff' },
    ];

    for (const u of users) {
      const { status, data } = await apiPost('/api/users', u, cookie);
      expect([200, 201]).toContain(status);
      const created = data as { id: string; username: string };
      expect(created.username).toBe(u.username);
      if (u.username === 'audit_manager') managerUserId = created.id;
      if (u.username === 'audit_viewer') viewerUserId = created.id;
      if (u.username === 'audit_staff') staffUserId = created.id;
    }

    test.info().annotations.push({ type: 'info', description: 'Created 3 audit users: audit_manager, audit_viewer, audit_staff' });
  });

  test('all three users appear in user list', async () => {
    const raw = await (await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: cookie } })).json() as unknown[];
    const list = Array.isArray(raw) ? raw : ((raw as any).users ?? []) as Array<{ username: string }>;
    const names = list.map((u) => (u as { username: string }).username);
    expect(names).toContain('audit_manager');
    expect(names).toContain('audit_viewer');
    expect(names).toContain('audit_staff');
  });

  test('edit audit_manager: change display name and password', async () => {
    test.skip(!managerUserId, 'Requires audit_manager user to be created');
    const { status } = await apiPut(`/api/users/${managerUserId}`, {
      firstName: 'Audit',
      lastName: 'Manager Updated',
      password: 'AuditPass1_NEW!',
    }, cookie);
    expect([200, 201]).toContain(status);
    test.info().annotations.push({ type: 'info', description: 'audit_manager password changed to AuditPass1_NEW!' });
  });

  test('audit_manager can log in with NEW password', async ({ page }) => {
    test.skip(!managerUserId, 'Requires audit_manager user to be created');
    const success = await browserLoginFetch(page, 'audit_manager', 'AuditPass1_NEW!');
    expect(success).toBe(true);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/dashboard|flow|internal/i);
    test.info().annotations.push({ type: 'info', description: 'audit_manager logged in with new password successfully' });
  });

  test('audit_manager login with OLD password is rejected', async ({ page }) => {
    test.skip(!managerUserId, 'Requires audit_manager user to be created');
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_manager', password: 'AuditPass1!' }),
    });
    expect(resp.status).toBe(401);
    test.info().annotations.push({ type: 'info', description: 'Old password correctly rejected for audit_manager' });
  });

  test('deactivate audit_viewer; login as viewer is rejected', async ({ page }) => {
    test.skip(!viewerUserId, 'Requires audit_viewer user to be created');
    const { status } = await apiPut(`/api/users/${viewerUserId}`, { active: false }, cookie);
    expect([200, 201]).toContain(status);

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    expect([401, 403]).toContain(loginResp.status);
    test.info().annotations.push({ type: 'info', description: 'Deactivated audit_viewer; login rejected' });
  });

  test('re-activate audit_viewer', async () => {
    test.skip(!viewerUserId, 'Requires audit_viewer user to be created');
    const { status } = await apiPut(`/api/users/${viewerUserId}`, { active: true }, cookie);
    expect([200, 201]).toContain(status);
    test.info().annotations.push({ type: 'info', description: 'audit_viewer re-activated' });
  });
});
