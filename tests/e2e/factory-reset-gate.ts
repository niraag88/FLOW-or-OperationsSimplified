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
 *   2. DATABASE_URL contains one of the disposable-marker substrings below.
 *
 * Standing route-gate tests that only check 401/403 (and never hit the
 * helper) — e.g. tests/e2e/11-admin-route-gates.spec.ts — do NOT need this
 * gate because they cannot wipe data. They keep running on every CI pass.
 *
 * The exported FACTORY_RESET_CONFIRMATION_PHRASE is the body specs must send
 * (when the gate allows them through) so they reach the helper successfully.
 */
import { test } from '@playwright/test';

export { FACTORY_RESET_CONFIRMATION_PHRASE } from '../../shared/factoryResetPhrase';

/**
 * Tokens that mark the *database name* (not host, not username, not password)
 * as a disposable test database. Each token is matched with a word-style
 * boundary against the parsed DB name only, so an incidental substring in a
 * username/host/password can never trick the gate. Add new tokens cautiously.
 */
const DISPOSABLE_DBNAME_TOKENS = ['test', 'disposable', 'ephemeral'];

export interface GateDecision {
  allow: boolean;
  reason: string;
}

/** Extract the database name (path without leading slash) from DATABASE_URL. */
function parseDatabaseName(databaseUrl: string): string | null {
  try {
    const u = new URL(databaseUrl);
    const dbName = u.pathname.replace(/^\//, '').split('?')[0];
    return dbName.length > 0 ? dbName : null;
  } catch {
    return null;
  }
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
  const dbName = parseDatabaseName(env.DATABASE_URL ?? '');
  if (!dbName) {
    return {
      allow: false,
      reason:
        'DATABASE_URL is missing or unparseable, so the disposable-database ' +
        'check cannot run. Refusing to execute destructive factory-reset tests.',
    };
  }
  // Word-style boundary: token must start the name, end the name, or be
  // surrounded by non-alphanumeric characters. Prevents an incidental
  // substring like "latest" matching "test".
  const matchedToken = DISPOSABLE_DBNAME_TOKENS.find((token) => {
    const re = new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, 'i');
    return re.test(dbName);
  });
  if (!matchedToken) {
    return {
      allow: false,
      reason:
        `Database name "${dbName}" does not contain any disposable-marker ` +
        `token (${DISPOSABLE_DBNAME_TOKENS.join(', ')}) at a word boundary. ` +
        `Refusing to run destructive factory-reset tests against what looks ` +
        `like a non-disposable database.`,
    };
  }
  return {
    allow: true,
    reason: `disposable token "${matchedToken}" found in database name "${dbName}"`,
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
