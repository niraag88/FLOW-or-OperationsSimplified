/**
 * Regression guard for Task #386.
 *
 * Run with:  npx tsx --test tests/unit/loggerNoConsoleRegression.test.ts
 *
 * Asserts that no `server/*.ts` file (other than the logger module
 * itself, which mentions `console.*` only inside a documentation
 * comment) calls `console.log` / `console.error` / `console.warn` /
 * `console.debug` / `console.info`. Future PRs that reintroduce a
 * raw `console.*` call under server/ will fail this test, keeping
 * the structured-logger contract enforceable without requiring a
 * package.json lint script.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..', '..', 'server');
// The logger module itself documents the migration in its module-level
// comment ("Replaces ad-hoc `console.log` / `console.error` ...") and
// is allowed to mention `console.*` in prose. Everything else must use
// the logger.
const ALLOWLIST = new Set([path.resolve(SERVER_ROOT, 'logger.ts')]);

// Match a real call expression, e.g. `console.error(`. Comment mentions
// like `// fall through to console.error` are NOT followed by `(` and
// will not match — but we additionally strip line/block comments before
// scanning to be conservative.
const CONSOLE_CALL = /\bconsole\.(log|error|warn|debug|info)\s*\(/;

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      yield full;
    }
  }
}

function stripComments(src: string): string {
  // Remove block comments first, then line comments. Crude but sufficient
  // for catching `console.*` mentions inside documentation; it would
  // false-negative on a `console.log` literal inside a string, which is
  // the desired behaviour (we only care about real call sites).
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('no server/*.ts file calls console.* directly (use logger instead)', async () => {
  const offenders: { file: string; lines: number[] }[] = [];
  for await (const file of walk(SERVER_ROOT)) {
    if (ALLOWLIST.has(file)) continue;
    const src = await fs.readFile(file, 'utf8');
    const stripped = stripComments(src);
    if (!CONSOLE_CALL.test(stripped)) continue;
    // Re-walk the original to report human-friendly line numbers.
    const lines = src.split('\n');
    const hits: number[] = [];
    const strippedLines = stripped.split('\n');
    for (let i = 0; i < strippedLines.length; i++) {
      if (CONSOLE_CALL.test(strippedLines[i])) hits.push(i + 1);
    }
    offenders.push({ file: path.relative(SERVER_ROOT, file), lines: hits });
  }
  assert.equal(
    offenders.length,
    0,
    `console.* call sites must use the structured logger from server/logger.ts.\n` +
      `Offenders:\n` +
      offenders
        .map((o) => `  ${o.file}: line(s) ${o.lines.join(', ')}`)
        .join('\n'),
  );
});
