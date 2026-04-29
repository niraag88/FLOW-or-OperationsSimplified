/**
 * Unit tests for the boot-time env validator (Task #321).
 *
 * Run with:  npx tsx --test tests/unit/config.test.ts
 *
 * The project does not ship a JS test runner, so these tests use
 * node:test (built into Node 20+) executed via tsx for TypeScript
 * support. They never invoke `validateConfigOrExit`, so process.exit
 * is never called.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, validateConfigOrExit, getConfig } from '../../server/config';

const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  SESSION_SECRET: 'a'.repeat(32),
  DEFAULT_OBJECT_STORAGE_BUCKET_ID: 'replit-objstore-fixture-bucket-id',
};

test('validateConfig: a complete dev env passes', () => {
  const r = validateConfig(VALID_ENV);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.config.NODE_ENV, 'development');
    assert.equal(r.config.PORT, '5000'); // default
    assert.equal(r.config.DATABASE_URL, VALID_ENV.DATABASE_URL);
  }
});

test('validateConfig: missing DATABASE_URL fails with a useful message', () => {
  const env = { ...VALID_ENV };
  delete env.DATABASE_URL;
  const r = validateConfig(env);
  assert.equal(r.ok, false);
  if (!r.ok) {
    const joined = r.errors.join('\n');
    assert.match(joined, /DATABASE_URL/);
    assert.match(joined, /required/);
    // Hint must be included for actionability
    assert.match(joined, /Fix:/);
    assert.match(joined, /postgres:\/\//);
  }
});

test('validateConfig: SESSION_SECRET shorter than 32 chars fails', () => {
  const env = { ...VALID_ENV, SESSION_SECRET: 'too-short' };
  const r = validateConfig(env);
  assert.equal(r.ok, false);
  if (!r.ok) {
    const joined = r.errors.join('\n');
    assert.match(joined, /SESSION_SECRET/);
    assert.match(joined, /32 characters/);
  }
});

test('validateConfig: malformed DATABASE_URL fails', () => {
  const env = { ...VALID_ENV, DATABASE_URL: 'mysql://nope' };
  const r = validateConfig(env);
  assert.equal(r.ok, false);
  if (!r.ok) {
    const joined = r.errors.join('\n');
    assert.match(joined, /DATABASE_URL/);
    assert.match(joined, /postgres/);
  }
});

// Task #362 (RF-8): OPS_TOKEN was previously required in production to
// gate /api/ops/* endpoints. The middleware that consumed it
// (`requireOpsToken`) was removed during Task #355's cleanup because
// every /api/ops/* route is now protected by an authenticated Admin
// session. The startup requirement was therefore stale, and the field
// was dropped from the schema. The matching "missing OPS_TOKEN fails
// in production" assertion was deleted; this test pins the new contract
// by asserting that a PRODUCTION env without OPS_TOKEN now passes
// validation, so a future contributor doesn't silently reintroduce the
// requirement.
test('validateConfig: a production env without OPS_TOKEN still passes (Task #362)', () => {
  const env = { ...VALID_ENV, NODE_ENV: 'production' as const };
  const r = validateConfig(env);
  assert.equal(r.ok, true);
});

test('validateConfig: missing DEFAULT_OBJECT_STORAGE_BUCKET_ID fails', () => {
  const env = { ...VALID_ENV };
  delete env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  const r = validateConfig(env);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.errors.join('\n'), /DEFAULT_OBJECT_STORAGE_BUCKET_ID/);
  }
});

test('validateConfig: PORT must be 1..65535', () => {
  const env = { ...VALID_ENV, PORT: '99999' };
  const r = validateConfig(env);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.errors.join('\n'), /PORT/);
  }

  const env2 = { ...VALID_ENV, PORT: 'abc' };
  const r2 = validateConfig(env2);
  assert.equal(r2.ok, false);
});

test('validateConfig: multiple failures are reported together', () => {
  const env = { ...VALID_ENV, SESSION_SECRET: 'short' };
  delete env.DATABASE_URL;
  const r = validateConfig(env);
  assert.equal(r.ok, false);
  if (!r.ok) {
    const joined = r.errors.join('\n');
    assert.match(joined, /DATABASE_URL/);
    assert.match(joined, /SESSION_SECRET/);
  }
});

test('validateConfig: never echoes the offending value (no secret leak)', () => {
  const env = { ...VALID_ENV, SESSION_SECRET: 'plaintext-secret-value-here' };
  const r = validateConfig(env);
  assert.equal(r.ok, false);
  if (!r.ok) {
    const joined = r.errors.join('\n');
    assert.equal(joined.includes('plaintext-secret-value-here'), false);
  }
});

test('getConfig: throws if called before validateConfigOrExit, returns the config after', () => {
  // Note: this test file imports config.ts fresh per process; getConfig
  // hasn't been populated yet so the first call must throw.
  assert.throws(() => getConfig(), /before validateConfigOrExit/);
  const config = validateConfigOrExit(VALID_ENV);
  const fetched = getConfig();
  assert.equal(fetched, config);
  assert.equal(fetched.DATABASE_URL, VALID_ENV.DATABASE_URL);
});

// Integration test that catches the ESM-hoisting bug discovered in
// code review: a naive `import { validateConfigOrExit }; validateConfigOrExit();`
// in server/index.ts followed by `import { pool } from "./db"` does NOT
// run the validator first — db.ts evaluates first and throws its own
// (much less useful) "DATABASE_URL must be set" before our aggregated
// banner ever prints. The fix is to keep server/index.ts's only static
// import as the validator, then dynamically import bootstrap.ts after
// validation. This test spawns the real entrypoint with a broken env
// and asserts our banner wins.
test('server/index.ts: validator banner wins over side-effect imports', async () => {
  const { spawnSync } = await import('node:child_process');
  const path = await import('node:path');
  const url = await import('node:url');
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const entry = path.resolve(here, '../../server/index.ts');

  const r = spawnSync('npx', ['tsx', entry], {
    env: {
      ...process.env,
      DATABASE_URL: '',
      SESSION_SECRET: 'too-short',
      DEFAULT_OBJECT_STORAGE_BUCKET_ID: '',
    },
    encoding: 'utf-8',
    timeout: 30000,
  });

  const out = (r.stdout || '') + (r.stderr || '');
  // Our banner must be present...
  assert.match(out, /FATAL: Environment validation failed/);
  // ...with at least these aggregated failures...
  assert.match(out, /DATABASE_URL/);
  assert.match(out, /SESSION_SECRET/);
  // ...and the cryptic db.ts throw must NOT have fired first.
  assert.equal(
    /DATABASE_URL must be set\. Did you forget to provision a database\?/.test(out),
    false,
    'db.ts threw before validator — ESM hoisting regression',
  );
  assert.equal(r.status, 1, 'expected non-zero exit on validation failure');
});
