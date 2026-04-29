/**
 * shared/destructiveActionPhrases.ts
 *
 * Single source of truth for every destructive admin action's typed-
 * confirmation phrase. Lives in `shared/` so the React client and the
 * Express server import the SAME constant — there is no second place to
 * forget to update if a phrase ever changes.
 *
 * Pattern (extends the four-wall defence introduced in Task #331 for
 * factory reset to every other destructive admin action — Task #337):
 *
 *   Wall 1  server-side helper (`server/typedConfirmation.ts`) refuses the
 *           request before any write if `confirmation` does not match.
 *   Wall 2  the route returns 400 with a stable error code; the expected
 *           phrase is never echoed back so a caller cannot brute-force it
 *           from error responses.
 *   Wall 3  the client uses `<TypedConfirmDialog>` which keeps the
 *           destructive button disabled until the typed text matches the
 *           phrase exactly, then sends `{ confirmation }` in the request.
 *
 * Phrase-design rules:
 *   - Each phrase mentions WHAT is being destroyed (so muscle memory across
 *     dialogs cannot trigger the wrong action).
 *   - Each phrase is short enough that a real admin will not give up and
 *     start avoiding the recycle bin / user management / etc.
 *   - Factory reset keeps its long, catastrophic phrase (Task #331). It
 *     re-exports through this file so callers have one import path.
 */

export { FACTORY_RESET_CONFIRMATION_PHRASE } from './factoryResetPhrase';

/**
 * `DELETE /api/recycle-bin/:id` — permanently removes a single item from
 * the recycle bin. Used by single-item delete, bulk-selected delete, AND
 * the "Clear All" loop (each iteration of the loop hits the endpoint once,
 * so the same phrase is reused for every iteration of one user-typed
 * confirmation).
 */
export const RECYCLE_BIN_PERMANENT_DELETE_PHRASE = 'PERMANENTLY DELETE';

/**
 * `DELETE /api/users/:id` — Admin user-account delete. There is no
 * recycle bin for user accounts; once a user is deleted their audit trail
 * still references them by id but the row is gone.
 */
export const USER_DELETE_PHRASE = 'DELETE USER';

/**
 * `POST /api/settings/retention/purge` — runs the retention policy now,
 * permanently deleting old audit-log rows and old export files. The
 * normal scheduled job is unaffected; this phrase guards only the
 * Admin "Run now" button.
 */
export const RETENTION_PURGE_PHRASE = 'PURGE OLD DATA';

/**
 * `POST /api/ops/backup-runs/:id/restore` AND
 * `POST /api/ops/restore-upload` — Emergency restore. Both endpoints
 * replace the entire current database with the contents of a backup
 * file; anything written between the backup and now is lost forever.
 * The phrase matches the long-standing on-screen wording so existing
 * admin muscle-memory keeps working.
 */
export const RESTORE_PHRASE = 'EMERGENCY RESTORE';
