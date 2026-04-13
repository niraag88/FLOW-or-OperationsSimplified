/**
 * server/factoryReset.ts
 *
 * Single source of truth for the full factory-reset operation.
 * Invoked by:
 *   - POST /api/ops/factory-reset  (HTTP route in server/routes/system.ts)
 *   - npx tsx scripts/delete-dummy-data.ts --all-user-data  (CLI, supports dry-run)
 *
 * Exports:
 *   FACTORY_RESET_TABLES — ordered list of tables to wipe (children before parents).
 *                          Used by both the HTTP route and the CLI dry-run wrapper.
 *   executeFactoryReset  — full transactional reset including company_settings
 *                          reset and audit log entry; used directly by HTTP route.
 *
 * The users table is partially preserved: only users with role = 'Admin' are kept.
 * All non-Admin user accounts are deleted as part of the reset.
 * The ops schema (restore_runs) is intentionally preserved.
 */

import type { PoolClient } from 'pg';

export interface FactoryResetActor {
  id: string;
  name: string;
}

export interface FactoryResetResult {
  tablesCleared: string[];
  rowsDeleted: number;
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
 */
export async function executeFactoryReset(
  client: PoolClient,
  actor: FactoryResetActor,
): Promise<FactoryResetResult> {
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

    await client.query(
      `INSERT INTO audit_log (actor, actor_name, target_id, target_type, action, details, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [actor.id, actor.name, 'system', 'system', 'FACTORY_RESET',
       'All business data wiped via factory reset; non-Admin user accounts deleted'],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }

  return { tablesCleared, rowsDeleted };
}
