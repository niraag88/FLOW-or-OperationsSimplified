/**
 * tests/e2e/backup-destructive-gate.ts
 *
 * Two-wall safety gate for any backup-related test that actually writes to
 * object storage, mutates the configured retention, or relies on the
 * scheduler ticking against the live process. Mirrors the
 * factory-reset-gate.ts pattern (Task #331) so the same disposable-DB
 * check protects both kinds of destructive run.
 *
 * Wall 1: env flag RUN_DESTRUCTIVE_BACKUP_TEST=1 must be set explicitly.
 * Wall 2: DATABASE_URL must point at a database whose name contains a
 *         disposable-marker token at a word boundary (see
 *         tests/e2e/disposable-db.ts).
 *
 * Use it from a `test.beforeAll` hook in any destructive backup describe
 * block. Read-only scheduled-backup tests (GET shape, PUT validation,
 * etc.) do NOT need this gate because they never call /api/ops/run-backups
 * and never write retention to a value that would prune live history.
 */
import { test } from '@playwright/test';
import { isDisposableDatabase } from './disposable-db';

export interface BackupGateDecision {
  allow: boolean;
  reason: string;
}

export function shouldAllowBackupDestructiveTests(
  env: NodeJS.ProcessEnv = process.env,
): BackupGateDecision {
  if (env.RUN_DESTRUCTIVE_BACKUP_TEST !== '1') {
    return {
      allow: false,
      reason:
        'RUN_DESTRUCTIVE_BACKUP_TEST is not set to "1". Set it explicitly to ' +
        'opt in. This is one of two safety walls — see ' +
        'tests/e2e/backup-destructive-gate.ts.',
    };
  }
  const disposable = isDisposableDatabase(env);
  if (!disposable.allow) {
    return { allow: false, reason: disposable.reason };
  }
  return { allow: true, reason: disposable.reason };
}

/**
 * Drop into a `test.beforeAll` to skip the entire describe block unless
 * both safety walls are satisfied. Logs a clear console line either way
 * so a CI run that skips tells you exactly why.
 *
 *   test.beforeAll(() => { gateBackupDestructiveTests('Manual backups'); });
 */
export function gateBackupDestructiveTests(specLabel: string): void {
  const decision = shouldAllowBackupDestructiveTests();
  if (!decision.allow) {
    // eslint-disable-next-line no-console
    console.log(
      `[backup-destructive-gate] SKIPPING "${specLabel}" — ${decision.reason}`,
    );
    test.skip(true, `backup-destructive gate refused: ${decision.reason}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[backup-destructive-gate] ALLOWING "${specLabel}" — ${decision.reason}`,
  );
}
