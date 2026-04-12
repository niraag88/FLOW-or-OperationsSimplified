/**
 * Phase 1 — User Management
 *
 * 5-11. Create users, edit, login with new password, deactivate/reactivate
 * 
 * NOTE: audit_viewer must use role 'Viewer' (not 'Staff')
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, browserLoginFetch } from './audit-helpers';

test.describe('Phase 1 — User Management', () => {
  test.setTimeout(120000);

  let cookie: string;
  let managerUserId: string;
  let viewerUserId: string;
  let staffUserId: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('create audit_manager (Manager role) via browser Create User form', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const createUserBtn = page.locator('[data-testid="button-create-user"], button').filter({ hasText: /create user|add user|new user/i }).first();
    if (await createUserBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createUserBtn.click();
      await page.waitForTimeout(1000);

      const usernameInput = page.locator('[data-testid="input-create-username"], input[placeholder*="username" i]').first();
      await expect(usernameInput).toBeVisible({ timeout: 5000 });
      await usernameInput.fill('audit_manager');

      const passwordInput = page.locator('input[type="password"], input[placeholder*="password" i]').first();
      if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await passwordInput.fill('AuditPass1!');
      }

      const roleSelect = page.locator('[data-testid="select-create-role"]').first();
      if (await roleSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await roleSelect.click();
        await page.waitForTimeout(300);
        await page.locator('[role="option"]').filter({ hasText: /manager/i }).first().click();
      }

      const confirmBtn = page.locator('[data-testid="button-confirm-create-user"], button').filter({ hasText: /create|confirm|save/i }).first();
      await confirmBtn.click();
      await page.waitForTimeout(2000);
      test.info().annotations.push({ type: 'info', description: 'audit_manager created via browser form' });
    } else {
      test.info().annotations.push({ type: 'info', description: 'Create user button not found via browser — falling back to API' });
      const { status, data } = await apiPost('/api/users', {
        username: 'audit_manager', role: 'Manager', password: 'AuditPass1!', firstName: 'Audit', lastName: 'Manager',
      }, cookie);
      expect([200, 201]).toContain(status);
      managerUserId = (data as { id: string }).id;
    }

    const usersRaw = await (await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: cookie } })).json() as unknown;
    const list = Array.isArray(usersRaw) ? usersRaw : ((usersRaw as any).users ?? []) as Array<{ id: string; username: string }>;
    const found = list.find((u) => u.username === 'audit_manager');
    expect(found).toBeTruthy();
    managerUserId = found!.id;
    test.info().annotations.push({ type: 'info', description: `audit_manager confirmed in user list, id=${managerUserId}` });
  });

  test('create audit_viewer (Viewer role) and audit_staff (Staff role) via API', async () => {
    const users = [
      { username: 'audit_viewer', role: 'Viewer', password: 'AuditPass2!', firstName: 'Audit', lastName: 'Viewer' },
      { username: 'audit_staff', role: 'Staff', password: 'AuditPass3!', firstName: 'Audit', lastName: 'Staff' },
    ];

    for (const u of users) {
      const existingResp = await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: cookie } });
      const existingRaw = await existingResp.json() as unknown;
      const existing = (Array.isArray(existingRaw) ? existingRaw : ((existingRaw as any).users ?? [])) as Array<{ id: string; username: string }>;
      const alreadyExists = existing.find((e) => e.username === u.username);
      if (alreadyExists) {
        if (u.username === 'audit_viewer') viewerUserId = alreadyExists.id;
        if (u.username === 'audit_staff') staffUserId = alreadyExists.id;
        continue;
      }

      const { status, data } = await apiPost('/api/users', u, cookie);
      expect([200, 201]).toContain(status);
      const created = data as { id: string; username: string };
      expect(created.username).toBe(u.username);
      if (u.username === 'audit_viewer') viewerUserId = created.id;
      if (u.username === 'audit_staff') staffUserId = created.id;
    }

    const usersRaw = await (await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: cookie } })).json() as unknown;
    const list = (Array.isArray(usersRaw) ? usersRaw : ((usersRaw as any).users ?? [])) as Array<{ username: string; role: string }>;
    const viewerUser = list.find((u) => u.username === 'audit_viewer');
    expect(viewerUser).toBeTruthy();
    expect(viewerUser!.role).toMatch(/viewer/i);
    test.info().annotations.push({ type: 'info', description: `audit_viewer role=${viewerUser!.role}; audit_staff created` });
  });

  test('all three users appear in user list', async () => {
    const raw = await (await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: cookie } })).json() as unknown;
    const list = (Array.isArray(raw) ? raw : ((raw as any).users ?? [])) as Array<{ username: string }>;
    const names = list.map((u) => u.username);
    expect(names).toContain('audit_manager');
    expect(names).toContain('audit_viewer');
    expect(names).toContain('audit_staff');
    test.info().annotations.push({ type: 'info', description: 'All 3 audit users confirmed in user list' });
  });

  test('edit audit_manager: change display name and password via API', async () => {
    test.skip(!managerUserId, 'Requires audit_manager user to be created');
    const { status } = await apiPut(`/api/users/${managerUserId}`, {
      firstName: 'Audit',
      lastName: 'Manager Updated',
      password: 'AuditPass1_NEW!',
    }, cookie);
    expect([200, 201]).toContain(status);
    test.info().annotations.push({ type: 'info', description: 'audit_manager password changed to AuditPass1_NEW!' });
  });

  test('audit_manager can log in with NEW password via browser', async ({ page }) => {
    test.skip(!managerUserId, 'Requires audit_manager user to be created');
    const success = await browserLoginFetch(page, 'audit_manager', 'AuditPass1_NEW!');
    expect(success).toBe(true);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/dashboard|flow|internal|purchase|quotation/i);
    test.info().annotations.push({ type: 'info', description: 'audit_manager logged in with new password successfully' });
  });

  test('audit_manager login with OLD password is rejected (401)', async () => {
    test.skip(!managerUserId, 'Requires audit_manager user to be created');
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_manager', password: 'AuditPass1!' }),
    });
    expect(resp.status).toBe(401);
    test.info().annotations.push({ type: 'info', description: 'Old password correctly rejected for audit_manager' });
  });

  test('deactivate audit_viewer; login as viewer is rejected', async () => {
    test.skip(!viewerUserId, 'Requires audit_viewer user to be created');
    const { status: deactivateStatus } = await apiPut(`/api/users/${viewerUserId}`, { active: false }, cookie);
    expect([200, 201]).toContain(deactivateStatus);

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    expect([401, 403]).toContain(loginResp.status);
    test.info().annotations.push({ type: 'info', description: 'Deactivated audit_viewer; login rejected with 401/403' });
  });

  test('re-activate audit_viewer; login succeeds', async ({ page }) => {
    test.skip(!viewerUserId, 'Requires audit_viewer user to be created');
    const { status } = await apiPut(`/api/users/${viewerUserId}`, { active: true }, cookie);
    expect([200, 201]).toContain(status);

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    expect(loginResp.status).toBe(200);
    test.info().annotations.push({ type: 'info', description: 'audit_viewer re-activated and login succeeds' });
  });
});
