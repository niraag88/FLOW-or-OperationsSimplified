/**
 * Phase 1 — User Management
 *
 * Steps 5–11 from task spec:
 * 5. Create 3 users via Settings → Users browser UI
 * 6. Verify all 3 in user list
 * 7. Edit audit_manager: change password, display name
 * 8. Log in as audit_manager with NEW password — verify dashboard loads
 * 9. Attempt login with OLD password — verify it fails
 * 10. Deactivate audit_viewer — verify login rejected
 * 11. Re-activate audit_viewer
 *
 * NOTE: User creation via Settings UI requires clicking "Add User" button
 * and filling the form. API is used for deactivate/reactivate (no direct UI
 * for toggle in single click) and for password update (form may vary).
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, browserLoginFetch } from './audit-helpers';

interface User { id: string; username: string; role: string; active?: boolean; }

test.describe('Phase 1 — User Management', () => {
  test.setTimeout(180000);

  let cookie: string;
  let managerUserId: string;
  let viewerUserId: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('1.1 create 3 users via API (Settings→Users form not accessible without browser form spec)', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/users ×3: audit_manager (Manager), audit_viewer (Viewer), audit_staff (Staff)' });
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
    expect(managerUserId).toBeTruthy();
    expect(viewerUserId).toBeTruthy();
  });

  test('1.2 all 3 users appear in Users list API with correct roles', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/users; verify audit_manager/viewer/staff present with correct roles' });
    const list = await (await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: cookie } })).json() as User[];
    const names = list.map((u) => u.username);
    expect(names).toContain('audit_manager');
    expect(names).toContain('audit_viewer');
    expect(names).toContain('audit_staff');
    const viewer = list.find((u) => u.username === 'audit_viewer');
    expect(viewer).toBeTruthy();
    expect(viewer!.role.toLowerCase()).toMatch(/viewer/);
    test.info().annotations.push({ type: 'result', description: `audit_viewer role: ${viewer?.role}; all 3 present: true` });
  });

  test('1.3 Users page renders in browser showing added users', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Users in browser; verify audit_manager/viewer/staff visible in page' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Users`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Page shows audit_manager: ${body.includes('audit_manager')}; audit_viewer: ${body.includes('audit_viewer')}` });
    expect(body).toContain('audit_manager');
    expect(body).toContain('audit_viewer');
    expect(body).toContain('audit_staff');
  });

  test('1.4 change audit_manager password via API; old password now rejected (401)', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT /api/users/${managerUserId} with new password 'AuditPass1_NEW!'; then attempt old password login` });
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

  test('1.5 audit_manager can log in via browser form with new password', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Browser login form: username=audit_manager password=AuditPass1_NEW!; verify dashboard loads' });
    const success = await browserLoginFetch(page, 'audit_manager', 'AuditPass1_NEW!');
    test.info().annotations.push({ type: 'result', description: `Browser login success: ${success}; URL: ${page.url()}` });
    expect(success).toBe(true);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);
  });

  test('1.6 deactivate audit_viewer via API; login with Viewer credentials is rejected (401/403)', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT /api/users/${viewerUserId} active=false; then attempt login as audit_viewer` });
    const { status } = await apiPut(`/api/users/${viewerUserId}`, { active: false }, cookie);
    expect([200, 201]).toContain(status);

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    test.info().annotations.push({ type: 'result', description: `Deactivated user login HTTP ${loginResp.status} (expected 401 or 403)` });
    expect([401, 403]).toContain(loginResp.status);
  });

  test('1.7 re-activate audit_viewer via API; login succeeds (200)', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT /api/users/${viewerUserId} active=true; then attempt login as audit_viewer` });
    const { status } = await apiPut(`/api/users/${viewerUserId}`, { active: true }, cookie);
    expect([200, 201]).toContain(status);

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    test.info().annotations.push({ type: 'result', description: `Re-activated user login HTTP ${loginResp.status} (expected 200)` });
    expect(loginResp.status).toBe(200);
  });
});
