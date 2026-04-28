/**
 * logAuditAction was previously a thin wrapper around POST /api/audit-logs.
 * That endpoint was removed in Task #319 because audit log records must be
 * written server-side from the relevant action handlers (via the internal
 * writeAuditLog() helper) — clients should not be able to forge audit
 * entries. The server-side handlers for retention save/purge already write
 * their own audit log rows.
 *
 * This shim is preserved as a no-op so existing call sites keep compiling
 * without touching unrelated code. New code should not call it.
 */
export const logAuditAction = async (
  _entityType: any,
  _entityId: any,
  _action: any,
  _userEmail: any,
  _changes: object = {},
  _metadata: object = {},
): Promise<void> => {
  // Intentionally a no-op. See file header.
};
