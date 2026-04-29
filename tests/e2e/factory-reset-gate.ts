/**
 * tests/e2e/factory-reset-gate.ts
 *
 * Wall 4 of the four-wall defence (Task #331).
 *
 * Any spec that calls POST /api/ops/factory-reset for real (i.e. expects 200
 * and wipes the DB) must guard the call with `gateFactoryResetTests()` in a
 * `test.beforeAll` hook. The gate skips the entire spec unless BOTH:
 *
 *   1. The env flag ALLOW_FACTORY_RESET_TESTS=true is set, AND
 *   2. DATABASE_URL contains a disposable-marker token at a word boundary
 *      (see tests/e2e/disposable-db.ts).
 *
 * Standing route-gate tests that only check 401/403 (and never hit the
 * helper) — e.g. tests/e2e/11-admin-route-gates.spec.ts — do NOT need this
 * gate because they cannot wipe data. They keep running on every CI pass.
 *
 * The exported FACTORY_RESET_CONFIRMATION_PHRASE is the body specs must send
 * (when the gate allows them through) so they reach the helper successfully.
 */
import { test } from '@playwright/test';
import { isDisposableDatabase } from './disposable-db';

export { FACTORY_RESET_CONFIRMATION_PHRASE } from '../../shared/factoryResetPhrase';

export interface GateDecision {
  allow: boolean;
  reason: string;
}

export function shouldAllowFactoryResetTests(
  env: NodeJS.ProcessEnv = process.env,
): GateDecision {
  if (env.ALLOW_FACTORY_RESET_TESTS !== 'true') {
    return {
      allow: false,
      reason:
        'ALLOW_FACTORY_RESET_TESTS is not set to "true". Set it explicitly to ' +
        'opt in. This is one of two safety walls — see tests/e2e/factory-reset-gate.ts.',
    };
  }
  const disposable = isDisposableDatabase(env);
  if (!disposable.allow) {
    return { allow: false, reason: disposable.reason };
  }
  return {
    allow: true,
    reason: disposable.reason,
  };
}

/**
 * Drop into a `test.beforeAll` to skip the entire spec unless both safety
 * walls are satisfied. Logs a clear console line either way so a CI run that
 * skips tells you exactly why.
 *
 *   test.beforeAll(() => { gateFactoryResetTests('Factory Reset spec'); });
 */
export function gateFactoryResetTests(specLabel: string): void {
  const decision = shouldAllowFactoryResetTests();
  if (!decision.allow) {
    // eslint-disable-next-line no-console
    console.log(
      `[factory-reset-gate] SKIPPING "${specLabel}" — ${decision.reason}`,
    );
    test.skip(true, `factory-reset gate refused: ${decision.reason}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[factory-reset-gate] ALLOWING "${specLabel}" — ${decision.reason}`,
  );
}
