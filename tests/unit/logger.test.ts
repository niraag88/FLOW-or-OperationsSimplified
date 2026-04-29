/**
 * Unit tests for the structured logger (Task #386).
 *
 * Run with:  npx tsx --test tests/unit/logger.test.ts
 *
 * Locks the production JSON shape: every line MUST be one valid JSON
 * object with `level`, `time`, `msg`, plus any merged context. Also
 * exercises the edge cases that previously broke the v1 implementation
 * (first-arg Error, BigInt meta, circular refs, key collisions).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';

interface CapturedLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

async function captureProduction(fn: (logger: typeof import('../../server/logger').logger) => void): Promise<CapturedLine[]> {
  const lines: CapturedLine[] = [];
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  // Bust the require/import cache so the logger module re-evaluates with the
  // forced NODE_ENV. (The logger reads NODE_ENV per-call so this is belt-
  // and-braces, not strictly required.)
  const mod = await import('../../server/logger');
  process.stdout.write = ((chunk: string | Uint8Array) => {
    lines.push({ stream: 'stdout', text: chunk.toString() });
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    lines.push({ stream: 'stderr', text: chunk.toString() });
    return true;
  }) as typeof process.stderr.write;
  try {
    fn(mod.logger);
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    process.env.NODE_ENV = prevNodeEnv;
  }
  return lines;
}

function parseLine(line: CapturedLine): Record<string, unknown> {
  // Each emit must be exactly one trailing newline + one JSON object.
  assert.equal(line.text.endsWith('\n'), true, 'log line must end with newline');
  const trimmed = line.text.slice(0, -1);
  assert.equal(trimmed.includes('\n'), false, 'log line must be single-line');
  return JSON.parse(trimmed) as Record<string, unknown>;
}

test('production: info goes to stdout with level/time/msg', async () => {
  const lines = await captureProduction((logger) => {
    logger.info('boot complete', { port: 5000 });
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].stream, 'stdout');
  const obj = parseLine(lines[0]);
  assert.equal(obj.level, 'info');
  assert.equal(obj.msg, 'boot complete');
  assert.equal(obj.port, 5000);
  assert.equal(typeof obj.time, 'string');
  assert.match(obj.time as string, /^\d{4}-\d{2}-\d{2}T/);
});

test('production: error goes to stderr', async () => {
  const lines = await captureProduction((logger) => {
    logger.error('thing failed:', new Error('boom'));
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].stream, 'stderr');
  const obj = parseLine(lines[0]);
  assert.equal(obj.level, 'error');
  assert.equal(obj.msg, 'thing failed:');
  assert.equal(obj.message, 'boom');
  assert.equal(typeof obj.stack, 'string');
});

test('production: warn goes to stderr', async () => {
  const lines = await captureProduction((logger) => {
    logger.warn('low disk');
  });
  assert.equal(lines[0].stream, 'stderr');
  const obj = parseLine(lines[0]);
  assert.equal(obj.level, 'warn');
});

test('production: bare Error first arg preserves stack', async () => {
  const lines = await captureProduction((logger) => {
    logger.error(new Error('bare boom'));
  });
  const obj = parseLine(lines[0]);
  assert.equal(obj.level, 'error');
  assert.equal(obj.msg, 'Error: bare boom');
  assert.equal(obj.name, 'Error');
  assert.equal(obj.message, 'bare boom');
  assert.equal(typeof obj.stack, 'string');
});

test('production: BigInt meta is serialised, not a fatal serialise error', async () => {
  const lines = await captureProduction((logger) => {
    logger.info('count', { value: 42n });
  });
  const obj = parseLine(lines[0]);
  assert.equal(obj.value, '42n');
  // The fallback stub line ({serialiseError:true}) must NOT have fired.
  assert.equal('serialiseError' in obj, false);
});

test('production: circular ref in meta does not collapse the payload', async () => {
  const lines = await captureProduction((logger) => {
    const a: Record<string, unknown> = { foo: 1 };
    a.self = a;
    logger.info('cycle', a);
  });
  const obj = parseLine(lines[0]);
  assert.equal(obj.foo, 1);
  // self.self must be the [Circular] sentinel, not throwing.
  assert.equal((obj.self as Record<string, unknown>).self, '[Circular]');
});

test('production: key collision goes to details, never silently dropped', async () => {
  const lines = await captureProduction((logger) => {
    // `msg` is a reserved top-level key; a meta `msg` must not clobber it.
    logger.info('real msg', { msg: 'collider', port: 5000 });
  });
  const obj = parseLine(lines[0]);
  assert.equal(obj.msg, 'real msg');
  assert.equal(obj.port, 5000);
  assert.deepEqual(obj.details, [{ msg: 'collider' }]);
});

test('production: primitives after the first arg land in details[]', async () => {
  const lines = await captureProduction((logger) => {
    logger.info('mixed', 'a string', 42);
  });
  const obj = parseLine(lines[0]);
  assert.equal(obj.msg, 'mixed');
  assert.deepEqual(obj.details, ['a string', 42]);
});
