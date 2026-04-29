/**
 * server/factoryReset.ts
 *
 * Single source of truth for the full factory-reset operation.
 *
 * ─── Four-wall defence (Task #331) ───────────────────────────────────────────
 * Live business data was once wiped because automated tests called the route
 * with no body and no environment check. To make that mistake unrepeatable
 * the destructive path is now guarded by four independent walls. Any single
 * misconfiguration is caught by the next wall.
 *
 *   Wall 1 (this file)
 *     executeFactoryReset() refuses to start the transaction unless the
 *     caller passes the literal FACTORY_RESET_CONFIRMATION_PHRASE. Any
 *     future endpoint, script, or background job that calls this helper
 *     must opt in deliberately.
 *
 *   Wall 2 (server/routes/system.ts)
 *     POST /api/ops/factory-reset reads `confirmation` from the JSON body
 *     and rejects with 400 if it is missing or wrong. A bare POST never
 *     reaches the helper.
 *
 *   Wall 3 (client/src/pages/UserManagement.tsx)
 *     The UI dialog presents a typed-text input. The destructive button
 *     stays disabled until the user types the exact phrase character by
 *     character. The mutation includes `{ confirmation }` in the body.
 *
 *   Wall 4 (tests/e2e/* destructive specs)
 *     Specs that execute a real factory reset are skipped unless both
 *     ALLOW_FACTORY_RESET_TESTS=true is set AND the resolved DATABASE_URL
 *     matches a known-disposable allowlist. The standing route-gate test
 *     at tests/e2e/11-admin-route-gates.spec.ts (anon/staff rejection
 *     only — never reaches the helper) continues to run as today.
 *
 * Invoked by:
 *   - POST /api/ops/factory-reset  (HTTP route in server/routes/system.ts)
 *   - npx tsx scripts/delete-dummy-data.ts --all-user-data --confirm-phrase="..."
 *
 * Exports:
 *   FACTORY_RESET_CONFIRMATION_PHRASE — single source of truth for the phrase.
 *   FACTORY_RESET_TABLES — ordered list of tables to wipe (children before
 *                          parents). Used by both the HTTP route and the CLI
 *                          dry-run wrapper.
 *   executeFactoryReset  — full transactional reset including company_settings
 *                          reset and audit log entry; used directly by HTTP
 *                          route and CLI script after each validates the phrase.
 *
 * The users table is partially preserved: only users with role = 'Admin' are
 * kept. All non-Admin user accounts are deleted as part of the reset. The ops
 * schema (restore_runs) is intentionally preserved.
 */

import type { PoolClient } from 'pg';
import { FACTORY_RESET_CONFIRMATION_PHRASE } from '../shared/factoryResetPhrase';

/**
 * Re-exported from shared/ so both client and server use the same phrase
 * without the client having to import server-only modules. Long, specific,
 * and unmistakable so it cannot be typed by accident or hardcoded into a
 * generic test fixture.
 */
export { FACTORY_RESET_CONFIRMATION_PHRASE };

export interface FactoryResetActor {
  id: string;
  name: string;
}

export interface FactoryResetOptions {
  /**
   * Must equal FACTORY_RESET_CONFIRMATION_PHRASE exactly. Any other value
   * (including undefined, empty string, trimmed/whitespace variants, or a
   * lowercase version) causes the helper to throw before opening a
   * transaction. The error message intentionally does NOT echo the phrase
   * back so a caller cannot brute-force it from error responses.
   */
  confirmation: string;
  /**
   * Optional human-readable hint logged to the audit row (e.g. the host of
   * DATABASE_URL the route handler parsed). Never required for the guard.
   */
  databaseHost?: string;
}

export interface FactoryResetResult {
  tablesCleared: string[];
  rowsDeleted: number;
}

export class FactoryResetConfirmationError extends Error {
  readonly code = 'factory_reset_confirmation_required';
  constructor() {
    super(
      'Factory reset refused: the caller did not provide the required ' +
        'confirmation phrase. This is a deliberate guard against accidental ' +
        'data loss. See server/factoryReset.ts for the four-wall design.',
    );
    this.name = 'FactoryResetConfirmationError';
  }
}

/**
 * Ordered list of tables to delete in FK-safe order (children before parents).
 * The CLI dry-run wrapper iterates this list to COUNT rows without deleting.
 */
export const FACTORY_RESET_TABLES: readonly string[] = [
  'stock_movements',
  'stock_count_items',
  'stock_counts',
  'goods_receipt_items',
  'goods_receipts',
  'purchase_order_items',
  'purchase_orders',
  'invoice_line_items',
  'invoices',
  'delivery_order_items',
  'delivery_orders',
  'quotation_items',
  'quotations',
  'products',
  'customers',
  'suppliers',
  'brands',
  'recycle_bin',
  'storage_objects',
  'audit_log',
  'vat_returns',
  'financial_years',
  'backup_runs',
  'signed_tokens',
  'storage_monitoring',
];

/**
 * Full transactional factory reset.
 *
 * @param client  A connected pg PoolClient — caller is responsible for releasing it.
 * @param actor   User/actor details written to the audit log.
 * @param options Confirmation phrase (required) and optional database host hint.
 *                See FACTORY_RESET_CONFIRMATION_PHRASE.
 *
 * @throws FactoryResetConfirmationError if `options.confirmation` does not
 *         exactly equal FACTORY_RESET_CONFIRMATION_PHRASE. Thrown BEFORE the
 *         transaction opens, so a failed guard never holds locks or partially
 *         wipes anything.
 */
export async function executeFactoryReset(
  client: PoolClient,
  actor: FactoryResetActor,
  options: FactoryResetOptions,
): Promise<FactoryResetResult> {
  if (
    typeof options?.confirmation !== 'string' ||
    options.confirmation !== FACTORY_RESET_CONFIRMATION_PHRASE
  ) {
    throw new FactoryResetConfirmationError();
  }

  const tablesCleared: string[] = [];
  let rowsDeleted = 0;

  const wipe = async (table: string) => {
    const { rows } = await client.query(`DELETE FROM ${table} RETURNING 1`);
    if (rows.length > 0) {
      tablesCleared.push(table);
      rowsDeleted += rows.length;
    }
  };

  await client.query('BEGIN');

  try {
    for (const table of FACTORY_RESET_TABLES) {
      await wipe(table);
    }

    await client.query('DELETE FROM company_settings');
    await client.query(`INSERT INTO company_settings (company_name) VALUES ('')`);

    // Delete all non-Admin user accounts — only Admin role users are preserved
    await client.query(`DELETE FROM users WHERE role != 'Admin'`);

    const auditDetails = JSON.stringify({
      message:
        'All business data wiped via factory reset; non-Admin user accounts deleted',
      confirmation_phrase_typed: options.confirmation,
      database_host: options.databaseHost ?? null,
      tables_cleared: tablesCleared.length,
      rows_deleted: rowsDeleted,
    });

    await client.query(
      `INSERT INTO audit_log (actor, actor_name, target_id, target_type, action, details, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [actor.id, actor.name, 'system', 'system', 'FACTORY_RESET', auditDetails],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }

  return { tablesCleared, rowsDeleted };
}
