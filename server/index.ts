/**
 * Server entrypoint (Task #321).
 *
 * Order matters here. Static ESM imports are hoisted by the loader and
 * run BEFORE any top-level code in the importing module. That means a
 * naive `import { validateConfigOrExit } from "./config";
 * validateConfigOrExit();` followed by `import { pool } from "./db";`
 * does NOT run the validator first — `db.ts` evaluates first and
 * throws its own (much less helpful) `DATABASE_URL must be set`
 * error before our aggregated banner ever prints.
 *
 * To make fail-fast actually fail-fast, this file has only ONE static
 * import: the validator. Everything else (express, db, routes, vite,
 * etc.) lives in `./bootstrap` and is loaded via a dynamic
 * `await import(...)` only AFTER validation passes. On failure the
 * dynamic import never runs.
 */

import { validateConfigOrExit } from "./config";

validateConfigOrExit();

await import("./bootstrap");
