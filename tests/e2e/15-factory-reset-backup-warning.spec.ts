/**
 * tests/e2e/15-factory-reset-backup-warning.spec.ts
 *
 * Backup-Freshness Warning spec (Task #336).
 *
 * The factory-reset confirmation dialog renders an INFORMATIONAL yellow
 * warning panel + a one-click "Take a backup now" button when the latest
 * successful backup is missing or older than the freshness window
 * (currently 24 hours). The warning is purely contextual: it never gates
 * the destructive submit button. The submit button continues to be
 * enabled solely by the typed phrase matching the
 * FACTORY_RESET_CONFIRMATION_PHRASE.
 *
 * Two failure modes this spec defends against:
 *
 *   1. Regression where a future contributor accidentally adds backup
 *      freshness to the disabled-predicate of the destructive button,
 *      silently turning a heads-up into a block. The third assertion
 *      ("button is enabled even while the warning is still showing")
 *      catches that immediately.
 *
 *   2. The new GET /api/ops/latest-backup endpoint silently regressing in
 *      shape — the first test asserts the no-backup contract.
 *
 * GATING: this spec mutates public.backup_runs to deterministically
 * simulate "no recent backup" and is therefore destructive in the same
 * way the existing factory-reset specs are. It is skipped unless BOTH:
 *   1. ALLOW_FACTORY_RESET_TESTS=true is set, AND
 *   2. DATABASE_URL contains a known-disposable marker.
 * See tests/e2e/factory-reset-gate.ts.
 *
 * To run locally against a disposable database:
 *   ALLOW_FACTORY_RESET_TESTS=true \
 *   DATABASE_URL="postgres://.../my_test_db" \
 *   npx playwright test tests/e2e/15-factory-reset-backup-warning.spec.ts
 */
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';

import { apiLogin, BASE_URL, login } from './helpers';
import { gateFactoryResetTests, FACTORY_RESET_CONFIRMATION_PHRASE } from './factory-reset-gate';

interface LatestBackupResp {
  lastSuccessfulBackupAt: string | null;
  freshnessWindowHours: number;
  isFresh: boolean;
}

test.describe('Factory-reset dialog: backup-freshness warning is informational only (Task #336)', () => {
  let cookie: string;
  let pool: Pool;

  test.beforeAll(async () => {
    gateFactoryResetTests('Backup-freshness warning spec (15-factory-reset-backup-warning.spec.ts)');
    cookie = await apiLogin();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // Deterministic "no recent backup" baseline: wipe the backup_runs table
    // so the freshness endpoint reports null. Gated above, so this only ever
    // runs against a disposable database.
    await pool.query('DELETE FROM public.backup_runs');
  });

  test.afterAll(async () => {
    await pool?.end();
  });

  test('GET /api/ops/latest-backup returns null + isFresh:false when there are no successful backups', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/latest-backup`, {
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as LatestBackupResp;
    expect(body.lastSuccessfulBackupAt).toBeNull();
    expect(body.isFresh).toBe(false);
    // Lock the response contract — the dialog text reads "older than {n} hours"
    // and would silently degrade if the server changed the constant. Bump this
    // assertion deliberately if the window is ever retuned.
    expect(body.freshnessWindowHours).toBe(24);
  });

  test('Reset dialog: yellow warning shows AND destructive submit still enables once the phrase is typed', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/user-management`);

    // Open the Reset tab. The trigger is rendered as a TabsTrigger with
    // visible text "Reset". (No data-testid on the tab itself today; using
    // role+name keeps the spec resilient to incidental wrapper changes.)
    await page.getByRole('tab', { name: 'Reset' }).click();

    // The big red "Factory Reset" button on the Reset card opens the dialog.
    await page.getByRole('button', { name: /^Factory Reset$/ }).click();

    // The freshness panel always renders (even with backups). The warning
    // panel only renders when the latest successful backup is missing/stale.
    await expect(page.getByTestId('factory-reset-backup-freshness')).toBeVisible();
    await expect(page.getByTestId('factory-reset-backup-warning')).toBeVisible();
    await expect(page.getByTestId('factory-reset-latest-backup-at')).toContainText(/no backup found/i);

    // Initial state: phrase not typed → destructive button MUST be disabled
    // (this is the existing four-wall guard, not the new warning).
    const submitBtn = page.getByTestId('button-confirm-factory-reset');
    await expect(submitBtn).toBeDisabled();

    // Type the exact confirmation phrase.
    await page.getByTestId('input-factory-reset-confirm').fill(FACTORY_RESET_CONFIRMATION_PHRASE);

    // CRITICAL ASSERTION: the destructive button is now enabled even though
    // the yellow warning is STILL showing. This proves the new warning is
    // purely informational and never participates in the disable predicate.
    await expect(submitBtn).toBeEnabled();
    await expect(page.getByTestId('factory-reset-backup-warning')).toBeVisible();

    // Cancel — we never want this spec to actually wipe the database.
    await page.getByRole('button', { name: 'No, cancel' }).click();
    await expect(page.getByTestId('button-confirm-factory-reset')).not.toBeVisible();
  });
});
