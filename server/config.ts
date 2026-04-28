/**
 * Boot-time environment validation (Task #321).
 *
 * The rest of the server still reads `process.env.X` directly today;
 * this module's job is purely to fail fast at startup with a clear
 * error message instead of letting a missing/malformed value surface
 * as a cryptic crash on the first request that needs it.
 *
 * Refactoring callsites to import the typed `config` object is
 * deliberately out of scope for this task — see task-321.md.
 */

import { z } from 'zod';

// Helper: production = NODE_ENV explicitly set to 'production'. Anything
// else (undefined, 'development', 'test', etc.) is treated as non-prod.
const isProd = (env: NodeJS.ProcessEnv) => env.NODE_ENV === 'production';

/**
 * Schema describing the environment contract. The schema is built
 * dynamically because OPS_TOKEN's required-ness depends on NODE_ENV.
 */
function buildSchema(env: NodeJS.ProcessEnv) {
  return z.object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .optional()
      .default('development'),

    PORT: z
      .string()
      .optional()
      .default('5000')
      .refine((v) => /^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 65535, {
        message: 'PORT must be a positive integer between 1 and 65535',
      }),

    DATABASE_URL: z
      .string({ required_error: 'DATABASE_URL is required' })
      .min(1, 'DATABASE_URL is required')
      .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
        message: 'DATABASE_URL must be a postgres:// or postgresql:// connection string',
      }),

    SESSION_SECRET: z
      .string({ required_error: 'SESSION_SECRET is required' })
      .min(32, 'SESSION_SECRET must be at least 32 characters long'),

    DEFAULT_OBJECT_STORAGE_BUCKET_ID: z
      .string({ required_error: 'DEFAULT_OBJECT_STORAGE_BUCKET_ID is required (object storage is in active use)' })
      .min(1, 'DEFAULT_OBJECT_STORAGE_BUCKET_ID is required (object storage is in active use)'),

    OPS_TOKEN: isProd(env)
      ? z
          .string({ required_error: 'OPS_TOKEN is required in production (used to gate /api/ops/* endpoints)' })
          .min(1, 'OPS_TOKEN is required in production (used to gate /api/ops/* endpoints)')
      : z.string().optional(),

    SESSION_MAX_AGE: z
      .string()
      .optional()
      .refine((v) => v === undefined || (/^\d+$/.test(v) && Number(v) > 0), {
        message: 'SESSION_MAX_AGE must be a positive integer (milliseconds) when set',
      }),
  });
}

export type Config = z.infer<ReturnType<typeof buildSchema>>;

/**
 * Per-variable hint shown alongside each failure. Kept short so the
 * boot-time error stays scannable. Never reference a value here — only
 * variable names — so we can't accidentally leak a secret.
 */
const FIX_HINTS: Record<string, string> = {
  DATABASE_URL:
    'Provision a Postgres database and set DATABASE_URL to the connection string (e.g. postgres://user:pass@host/db).',
  SESSION_SECRET:
    'Set SESSION_SECRET to a random 32+ character string. Generate one with: openssl rand -hex 32',
  DEFAULT_OBJECT_STORAGE_BUCKET_ID:
    'Set DEFAULT_OBJECT_STORAGE_BUCKET_ID to the object-storage bucket ID. On Replit, provision Object Storage to populate this automatically.',
  OPS_TOKEN:
    'Set OPS_TOKEN to a long random secret. It gates the destructive /api/ops/* endpoints when called outside an authenticated admin session.',
  PORT: 'Set PORT to an integer between 1 and 65535, or leave it unset to use the default (5000).',
  SESSION_MAX_AGE:
    'Set SESSION_MAX_AGE to a positive integer in milliseconds, or leave it unset to use the default (8 hours).',
  NODE_ENV: "Set NODE_ENV to 'development', 'production', or 'test'.",
};

export type ValidationResult =
  | { ok: true; config: Config }
  | { ok: false; errors: string[] };

/**
 * Validate the supplied env (defaults to process.env). Returns a
 * structured result so the unit test can inspect the errors without
 * triggering process.exit.
 */
export function validateConfig(env: NodeJS.ProcessEnv = process.env): ValidationResult {
  const schema = buildSchema(env);
  const parsed = schema.safeParse(env);
  if (parsed.success) {
    return { ok: true, config: parsed.data };
  }

  const errors: string[] = [];
  for (const issue of parsed.error.errors) {
    const key = String(issue.path[0] ?? '<unknown>');
    const hint = FIX_HINTS[key] ?? '';
    errors.push(hint ? `  - ${key}: ${issue.message}\n      Fix: ${hint}` : `  - ${key}: ${issue.message}`);
  }
  return { ok: false, errors };
}

/**
 * Run validation and, on failure, print a clear list of problems and
 * exit non-zero before the HTTP listener opens. Wired in as the very
 * first thing in server/index.ts. The validated config is cached and
 * available to other modules via `getConfig()` (typed `config` object
 * mentioned in task-321.md).
 */
export function validateConfigOrExit(env: NodeJS.ProcessEnv = process.env): Config {
  const result = validateConfig(env);
  if (!result.ok) {
    // Use stderr + a clear banner so the failure is impossible to miss
    // in deploy logs. Never print the offending values — only names.
    console.error(
      '\nFATAL: Environment validation failed. The server cannot start.\n',
    );
    for (const line of result.errors) console.error(line);
    console.error('\nFix the variables above in your environment and restart.\n');
    process.exit(1);
  }
  cachedConfig = result.config;
  return result.config;
}

let cachedConfig: Config | null = null;

/**
 * Returns the typed, validated config. Must be called AFTER
 * `validateConfigOrExit()` has run at startup (server/index.ts does
 * this). Refactoring existing `process.env.X` reads to use this is
 * out of scope for Task #321 — the export exists so future callers
 * can adopt it incrementally.
 */
export function getConfig(): Config {
  if (!cachedConfig) {
    throw new Error(
      'getConfig() called before validateConfigOrExit(). Ensure server/index.ts has run.',
    );
  }
  return cachedConfig;
}
