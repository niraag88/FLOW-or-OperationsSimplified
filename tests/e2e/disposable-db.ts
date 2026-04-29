/**
 * tests/e2e/disposable-db.ts
 *
 * Shared "is this DATABASE_URL pointing at a disposable test database?"
 * check used by every destructive-test gate (factory-reset-gate.ts and
 * backup-destructive-gate.ts at time of writing).
 *
 * Keeping the disposable-DB rules in one place ensures that adding a new
 * disposable-marker token, or tightening the parsing, applies uniformly
 * to every destructive gate.
 */

/**
 * Tokens that mark the *database name* (not host, not username, not password)
 * as a disposable test database. Each token is matched with a word-style
 * boundary against the parsed DB name only, so an incidental substring in a
 * username/host/password can never trick the gate. Add new tokens cautiously.
 */
export const DISPOSABLE_DBNAME_TOKENS = ['test', 'disposable', 'ephemeral'];

/** Extract the database name (path without leading slash) from DATABASE_URL. */
export function parseDatabaseName(databaseUrl: string): string | null {
  try {
    const u = new URL(databaseUrl);
    const dbName = u.pathname.replace(/^\//, '').split('?')[0];
    return dbName.length > 0 ? dbName : null;
  } catch {
    return null;
  }
}

export interface DisposableDecision {
  allow: boolean;
  reason: string;
  /** Set when `allow === true`; the matched token from DISPOSABLE_DBNAME_TOKENS. */
  matchedToken?: string;
  /** Set when the URL parsed; useful for error messages. */
  dbName?: string;
}

/**
 * Returns `{ allow: true, ... }` when DATABASE_URL parses and the database
 * name contains at least one disposable-marker token at a word-style
 * boundary. Otherwise returns `{ allow: false, reason }` with a clear
 * explanation suitable for printing to a CI log.
 */
export function isDisposableDatabase(
  env: NodeJS.ProcessEnv = process.env,
): DisposableDecision {
  const dbName = parseDatabaseName(env.DATABASE_URL ?? '');
  if (!dbName) {
    return {
      allow: false,
      reason:
        'DATABASE_URL is missing or unparseable, so the disposable-database ' +
        'check cannot run. Refusing to execute destructive tests.',
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
        `Refusing to run destructive tests against what looks like a ` +
        `non-disposable database.`,
      dbName,
    };
  }
  return {
    allow: true,
    reason: `disposable token "${matchedToken}" found in database name "${dbName}"`,
    matchedToken,
    dbName,
  };
}
