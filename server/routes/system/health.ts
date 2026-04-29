import type { Express } from "express";
import { storageObjects } from "@shared/schema";
import { db, pool } from "../../db";
import { eq } from "drizzle-orm";
import {
  requireAuth,
  setForceStorageDeleteFail,
  isForceStorageDeleteFailEnabled,
  setAuditFaultInject,
  isAuditFaultInjectEnabled,
  type AuthenticatedRequest,
} from "../../middleware";

export function registerHealthRoutes(app: Express) {
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Test-only seams: force the next storage-delete to fail (one-shot), and
  // probe whether a tracked storage_objects row exists for a given key.
  // Together these let the e2e suite exercise the failure branch of
  // scan-delete handlers and verify the DB tracking row was not deleted.
  // Both routes are gated to non-production and require Admin auth.
  if (process.env.NODE_ENV !== 'production') {
    app.post('/api/__test__/force-storage-delete-fail', requireAuth(['Admin']), (req: AuthenticatedRequest, res) => {
      const enabled = (req.body as { enabled?: unknown })?.enabled === true;
      setForceStorageDeleteFail(enabled);
      res.json({ ok: true, enabled: isForceStorageDeleteFailEnabled() });
    });

    app.get('/api/__test__/storage-object-row', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
      const key = req.query.key;
      if (typeof key !== 'string' || !key) {
        return res.status(400).json({ error: 'key query parameter is required' });
      }
      const rows = await db.select({ key: storageObjects.key }).from(storageObjects).where(eq(storageObjects.key, key)).limit(1);
      res.json({ exists: rows.length > 0 });
    });

    app.get('/api/__test__/signed-token-count', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
      const key = req.query.key;
      if (typeof key !== 'string' || !key) {
        return res.status(400).json({ error: 'key query parameter is required' });
      }
      const result = await pool.query(
        'SELECT COUNT(*)::int AS count FROM signed_tokens WHERE key = $1',
        [key]
      );
      res.json({ count: result.rows[0]?.count ?? 0 });
    });

    // Task #375: persistent toggle that makes writeAuditLogSync throw,
    // so the integration test for sensitive-action rollback can prove
    // the surrounding transaction is actually atomic. Admin-gated and
    // mounted in non-production only — there is no production code path
    // that can flip this on.
    app.post('/api/__test__/audit-fault-inject', requireAuth(['Admin']), (req: AuthenticatedRequest, res) => {
      const enabled = (req.body as { enabled?: unknown })?.enabled === true;
      setAuditFaultInject(enabled);
      res.json({ ok: true, enabled: isAuditFaultInjectEnabled() });
    });
  }
}
