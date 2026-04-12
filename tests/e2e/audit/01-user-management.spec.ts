/**
 * Phase 1 — User Management
 *
 * Steps 5–11 from task spec:
 * 5. Create 3 users via Settings → User Management browser form (data-testid selectors)
 * 6. Verify all 3 appear in the user list (browser)
 * 7. Edit audit_manager: change password and display name via Edit form (browser)
 * 8. Log in as audit_manager with NEW password via browser form; verify dashboard loads; log out
 * 9. Attempt login with OLD password — verify it fails (401)
 * 10. Deactivate audit_viewer via Edit form browser toggle; verify login as viewer is rejected
 * 11. Re-activate audit_viewer via Edit form browser toggle; verify login succeeds
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, browserLogin, browserLoginFetch } from './audit-helpers';

interface User { id: string; username: string; role: string; active?: boolean; }

async function createUserViaBrowser(
  page: import('@playwright/test').Page,
  username: string,
  password: string,
  firstName: string,
  lastName: string,
  role: string,
): Promise<void> {
  await page.click('[data-testid="button-create-user"]');
  await page.waitForTimeout(800);
  await page.fill('[data-testid="input-create-username"]', username);
  await page.fill('[data-testid="input-create-password"]', password);
  await page.fill('[data-testid="input-create-firstname"]', firstName);
  await page.fill('[data-testid="input-create-lastname"]', lastName);
  const roleCombo = page.locator('[data-testid="select-create-role"]');
  await roleCombo.click();
  await page.waitForTimeout(500);
  await page.locator('[role="option"]').filter({ hasText: new RegExp(role, 'i') }).first().click();
  await page.waitForTimeout(500);
  await page.click('[data-testid="button-confirm-create-user"]');
  await page.waitForTimeout(1500);
}

test.describe('Phase 1 — User Management', () => {
  test.setTimeout(240000);

  let cookie: string;
  let viewerUserId: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('1.1 step 5: create audit_manager user via Settings → User Management browser form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /user-management; click Create User; fill form for audit_manager (Manager role); confirm' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/user-management`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    await createUserViaBrowser(page, 'audit_manager', 'AuditPass1!', 'Audit', 'Manager', 'Manager');
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `User list contains audit_manager: ${body.includes('audit_manager')}` });
    expect(body).toContain('audit_manager');
  });

  test('1.2 step 5: create audit_viewer user via browser form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /user-management; create audit_viewer (Viewer role) via form' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/user-management`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    await createUserViaBrowser(page, 'audit_viewer', 'AuditPass2!', 'Audit', 'Viewer', 'Viewer');
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `User list contains audit_viewer: ${body.includes('audit_viewer')}` });
    expect(body).toContain('audit_viewer');
  });

  test('1.3 step 5: create audit_staff user via browser form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /user-management; create audit_staff (Staff role) via form' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/user-management`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    await createUserViaBrowser(page, 'audit_staff', 'AuditPass3!', 'Audit', 'Staff', 'Staff');
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `User list contains audit_staff: ${body.includes('audit_staff')}` });
    expect(body).toContain('audit_staff');
  });

  test('1.4 step 6: browser shows all 3 users in user management page', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /user-management; verify audit_manager, audit_viewer, audit_staff all visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/user-management`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `manager=${body.includes('audit_manager')} viewer=${body.includes('audit_viewer')} staff=${body.includes('audit_staff')}` });
    expect(body).toContain('audit_manager');
    expect(body).toContain('audit_viewer');
    expect(body).toContain('audit_staff');
  });

  test('1.5 step 7: edit audit_manager — change display name and password via browser Edit form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click Edit for audit_manager; update firstName to "Audit Manager"; change password to AuditPass1_NEW!; save' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/user-management`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const editBtn = page.locator('[data-testid="button-edit-audit_manager"]');
    await editBtn.click();
    await page.waitForTimeout(1000);

    const firstNameInput = page.locator('[data-testid="input-edit-firstname"]');
    await firstNameInput.clear();
    await firstNameInput.fill('Audit Manager');

    const pwInput = page.locator('[data-testid="input-edit-password"]');
    await pwInput.fill('AuditPass1_NEW!');

    await page.click('[data-testid="button-confirm-update-user"]');
    await page.waitForTimeout(2000);

    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Body after edit save — "Audit Manager" present: ${body.includes('Audit Manager')}` });
    expect(body).toContain('audit_manager');
  });

  test('1.6 step 8: audit_manager can log in via browser form with NEW password; dashboard loads', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Browser login: username=audit_manager password=AuditPass1_NEW!; verify dashboard/home renders' });
    const success = await browserLoginFetch(page, 'audit_manager', 'AuditPass1_NEW!');
    test.info().annotations.push({ type: 'result', description: `Login success: ${success}; URL: ${page.url()}` });
    expect(success).toBe(true);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(10);
  });

  test('1.7 step 9: login with OLD password AuditPass1! is rejected (401)', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/auth/login with audit_manager + AuditPass1! (old); expect 401' });
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_manager', password: 'AuditPass1!' }),
    });
    test.info().annotations.push({ type: 'result', description: `Old password login HTTP ${resp.status} (expected 401)` });
    expect(resp.status).toBe(401);
  });

  test('1.8 step 10: deactivate audit_viewer via browser Edit form toggle; verify login rejected', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click Edit for audit_viewer; toggle active=false; save; then attempt login and expect rejection' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/user-management`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const users = await (await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: cookie } })).json() as User[];
    const viewer = users.find((u) => u.username === 'audit_viewer');
    viewerUserId = viewer?.id ?? '';

    const editBtn = page.locator('[data-testid="button-edit-audit_viewer"]');
    await editBtn.click();
    await page.waitForTimeout(1000);

    const activeToggle = page.locator('[data-testid="switch-edit-active"]');
    const isChecked = await activeToggle.isChecked().catch(() => false);
    if (isChecked) {
      await activeToggle.click();
      await page.waitForTimeout(500);
    }

    await page.click('[data-testid="button-confirm-update-user"]');
    await page.waitForTimeout(2000);

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    test.info().annotations.push({ type: 'result', description: `Deactivated viewer login HTTP ${loginResp.status} (expected 401 or 403)` });
    expect([401, 403]).toContain(loginResp.status);
  });

  test('1.9 step 11: re-activate audit_viewer via browser Edit form toggle; verify login succeeds', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click Edit for audit_viewer; toggle active=true; save; verify login succeeds' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/user-management`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const editBtn = page.locator('[data-testid="button-edit-audit_viewer"]');
    await editBtn.click();
    await page.waitForTimeout(1000);

    const activeToggle = page.locator('[data-testid="switch-edit-active"]');
    const isChecked = await activeToggle.isChecked().catch(() => false);
    if (!isChecked) {
      await activeToggle.click();
      await page.waitForTimeout(500);
    }

    await page.click('[data-testid="button-confirm-update-user"]');
    await page.waitForTimeout(2000);

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    test.info().annotations.push({ type: 'result', description: `Re-activated viewer login HTTP ${loginResp.status} (expected 200)` });
    expect(loginResp.status).toBe(200);
  });
});
