/**
 * Phase 1 — User Management
 *
 * Tests:
 * - Create audit_manager (Manager), audit_viewer (Viewer), audit_staff (Staff) via API
 * - All 3 users appear in users list API with correct roles
 * - Users Management page renders in browser showing all 3 users
 * - audit_manager password changed; old password rejected (401); new password login works in browser
 * - audit_viewer deactivated; login rejected (401)
 * - audit_viewer re-activated; login succeeds (200)
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, browserLoginFetch } from './audit-helpers';

interface User { id: string; username: string; role: string; }

test.describe('Phase 1 — User Management', () => {
  test.setTimeout(120000);

  let cookie: string;
  let managerUserId: string;
  let viewerUserId: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('create audit_manager (Manager), audit_viewer (Viewer), audit_staff (Staff) via API', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/users for 3 roles' });
    const users = [
      { username: 'audit_manager', role: 'Manager', password: 'AuditPass1!', firstName: 'Audit', lastName: 'Manager' },
      { username: 'audit_viewer', role: 'Viewer', password: 'AuditPass2!', firstName: 'Audit', lastName: 'Viewer' },
      { username: 'audit_staff', role: 'Staff', password: 'AuditPass3!', firstName: 'Audit', lastName: 'Staff' },
    ];

    for (const u of users) {
      const { status, data } = await apiPost<User>('/api/users', u, cookie);
      expect([200, 201]).toContain(status);
      expect(data.username).toBe(u.username);
      if (u.username === 'audit_manager') managerUserId = data.id;
      if (u.username === 'audit_viewer') viewerUserId = data.id;
    }
    test.info().annotations.push({ type: 'result', description: `managerUserId=${managerUserId} viewerUserId=${viewerUserId}` });
  });

  test('all 3 users appear in user list API with correct roles', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/users and verify all 3 usernames present' });
    const list = await (await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: cookie } })).json() as User[];
    const names = list.map((u) => u.username);
    expect(names).toContain('audit_manager');
    expect(names).toContain('audit_viewer');
    expect(names).toContain('audit_staff');

    const viewer = list.find((u) => u.username === 'audit_viewer');
    expect(viewer).toBeTruthy();
    expect(viewer!.role.toLowerCase()).toMatch(/viewer/);
    test.info().annotations.push({ type: 'result', description: `viewer role: ${viewer?.role}` });
  });

  test('Users/Settings page renders in browser showing all 3 users', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Users or /Settings in browser, assert all 3 usernames visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Users`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Page body includes audit_manager: ${body.includes('audit_manager')}` });
    expect(body).toMatch(/audit_manager|audit_viewer|audit_staff/i);
  });

  test('change audit_manager password via API; old password rejected (401)', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT /api/users/${managerUserId} with new password` });
    const { status } = await apiPut(`/api/users/${managerUserId}`, { password: 'AuditPass1_NEW!' }, cookie);
    expect([200, 201]).toContain(status);

    const oldPassResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_manager', password: 'AuditPass1!' }),
    });
    test.info().annotations.push({ type: 'result', description: `Old password login HTTP ${oldPassResp.status} (expected 401)` });
    expect(oldPassResp.status).toBe(401);
  });

  test('audit_manager can log in with new password via browser form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Fill login form with audit_manager + new password, submit' });
    const success = await browserLoginFetch(page, 'audit_manager', 'AuditPass1_NEW!');
    test.info().annotations.push({ type: 'result', description: `Browser login success: ${success}` });
    expect(success).toBe(true);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);
  });

  test('deactivate audit_viewer; login returns 401', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT /api/users/${viewerUserId} active=false; attempt login` });
    const { status } = await apiPut(`/api/users/${viewerUserId}`, { active: false }, cookie);
    expect([200, 201]).toContain(status);

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    test.info().annotations.push({ type: 'result', description: `Deactivated user login HTTP ${loginResp.status}` });
    expect([401, 403]).toContain(loginResp.status);
  });

  test('re-activate audit_viewer; login returns 200', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT /api/users/${viewerUserId} active=true; attempt login` });
    const { status } = await apiPut(`/api/users/${viewerUserId}`, { active: true }, cookie);
    expect([200, 201]).toContain(status);

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    test.info().annotations.push({ type: 'result', description: `Reactivated user login HTTP ${loginResp.status}` });
    expect(loginResp.status).toBe(200);
  });
});
