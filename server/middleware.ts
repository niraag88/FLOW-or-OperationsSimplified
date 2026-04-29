import type { Request, Response, NextFunction } from "express";
import { Client } from '@replit/object-storage';
import { users, auditLog, products, stockMovements, type InsertAuditLog, type User } from "@shared/schema";
import { db, pool } from "./db";
import { eq, sql } from "drizzle-orm";
import multer from 'multer';
import bcrypt from 'bcrypt';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import { promises as fsPromises } from 'fs';
import path from 'path';

export const objectStorageClient = new Client({
  bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
});

// One-shot test seam: when armed, the *next* call to
// deleteStorageObjectSafely() returns a synthetic failure and the flag is
// consumed (auto-resets). Persistent toggling is intentionally not supported,
// so a forgotten cleanup or a parallel request can't poison subsequent
// deletes.
let _forceStorageDeleteFailOnce = false;
export function setForceStorageDeleteFail(enabled: boolean) {
  _forceStorageDeleteFailOnce = enabled;
}
export function isForceStorageDeleteFailEnabled() {
  return _forceStorageDeleteFailOnce;
}

export async function deleteStorageObjectSafely(
  key: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (_forceStorageDeleteFailOnce) {
    _forceStorageDeleteFailOnce = false;
    return { ok: false, error: 'forced-failure (test seam, one-shot)' };
  }
  try {
    const result = await objectStorageClient.delete(key, { ignoreNotFound: true });
    if (result.ok) return { ok: true };
    const errMsg =
      result.error && typeof result.error === 'object' && 'message' in result.error
        ? String((result.error as { message: unknown }).message)
        : String(result.error);
    return { ok: false, error: errMsg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

setInterval(async () => {
  try {
    await pool.query('DELETE FROM signed_tokens WHERE expires < $1', [Date.now()]);
  } catch (err) {
    console.error('Failed to clean up expired signed tokens:', err);
  }
}, 5 * 60 * 1000);

// PDF template helpers (Task #373) live in a side-effect-free module so
// unit tests can import them without keeping the event loop alive via
// the signed-token cleanup setInterval above. Re-exported here so that
// existing importers (server/routes/exports.ts) keep working unchanged.
export { escapeHtml, generateDOPDF } from './lib/pdfTemplates';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_ERROR_MESSAGE = 'File too large. Maximum size is 5 MB. Please scan in black-and-white, or reduce colour resolution to 200 dpi.';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}


export const validatePdfMagicBytes = (fileBuffer: Buffer) => {
  if (!fileBuffer || fileBuffer.length < 4) {
    return { valid: false, error: 'Invalid file format. Only real PDF files are allowed.' };
  }
  const magicBytes = fileBuffer.slice(0, 4).toString('ascii');
  if (magicBytes !== '%PDF') {
    return { valid: false, error: 'Invalid file format. Only real PDF files are allowed.' };
  }
  return { valid: true };
};

export const validateImageMagicBytes = (fileBuffer: Buffer, contentType: string) => {
  if (!fileBuffer || fileBuffer.length < 4) {
    return { valid: false, error: 'Invalid file format.' };
  }
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    if (fileBuffer[0] !== 0xFF || fileBuffer[1] !== 0xD8 || fileBuffer[2] !== 0xFF) {
      return { valid: false, error: 'Invalid file format. Only real JPEG images are allowed.' };
    }
  } else if (contentType === 'image/png') {
    if (fileBuffer[0] !== 0x89 || fileBuffer[1] !== 0x50 || fileBuffer[2] !== 0x4E || fileBuffer[3] !== 0x47) {
      return { valid: false, error: 'Invalid file format. Only real PNG images are allowed.' };
    }
  }
  return { valid: true };
};

export const validateUploadInput = (key: string, contentType: string, fileSize?: number) => {
  if (!key.startsWith('invoices/') && !key.startsWith('delivery/')) {
    return { valid: false, error: 'Key must start with invoices/ or delivery/' };
  }
  if (contentType !== 'application/pdf') {
    return { valid: false, error: 'Content type must be application/pdf' };
  }
  if (fileSize && fileSize > MAX_UPLOAD_BYTES) {
    return { valid: false, error: MAX_UPLOAD_ERROR_MESSAGE };
  }
  return { valid: true };
};

const PostgresSessionStore = connectPg(session);
export const sessionStore = new PostgresSessionStore({
  pool,
  createTableIfMissing: true,
  tableName: 'sessions'
});

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export const requireAuth = (allowedRoles: Array<"Admin" | "Manager" | "Staff"> = ["Admin", "Manager", "Staff"]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: 'User not found' });
      }
      if (!user.active) {
        return res.status(403).json({ error: 'Account deactivated' });
      }
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ error: 'Authentication error' });
    }
  };
};

export const requireRole = (role: "Admin" | "Manager" | "Staff") => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: 'User not found' });
      }
      if (!user.active) {
        return res.status(403).json({ error: 'Account deactivated' });
      }
      if (user.role === 'Admin') {
        req.user = user;
        return next();
      }
      if (user.role !== role) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      req.user = user;
      next();
    } catch (error) {
      console.error('Role auth middleware error:', error);
      return res.status(500).json({ error: 'Authentication error' });
    }
  };
};

export type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// ─── Audit-log durability (Task #375) ────────────────────────────────────────
// Two complementary write paths:
//
//   writeAuditLogSync(tx, data)
//     For sensitive admin actions (factory reset, user delete, permanent
//     delete from recycle bin, invoice/DO cancel). Inserts inside the
//     caller's transaction and THROWS on failure so the surrounding
//     work rolls back together with the audit row. Never use the
//     non-tx db here — the durability guarantee depends on every audit
//     write happening atomically with the action it describes.
//
//   writeAuditLog(data)  (default async / fire-and-forget)
//     For non-sensitive bookkeeping (CRUD on ordinary entities). Uses a
//     small retry-with-backoff window so a brief Neon hiccup doesn't
//     silently swallow the row. Only after every retry has failed do
//     we fall through to console.error — which still preserves the
//     pre-#375 behaviour (the request itself is not failed).
//
// Adding a new sensitive route MUST use writeAuditLogSync. Bare
// writeAuditLog on a destructive route is a regression.
//
// If the async path exhausts its retries the row is appended to a
// disk-spool file (audit-spool.jsonl by default; override via
// getAuditSpoolPath()). A periodic replay worker drains the spool back
// into the DB once it recovers — so even an extended Neon outage
// does not silently lose audit rows.
const AUDIT_LOG_RETRY_ATTEMPTS = 3;
const AUDIT_LOG_RETRY_BASE_MS = 100;
// Resolved on each call (not cached at module-load) so tests can
// point the spool at a temp path via process.env.AUDIT_SPOOL_PATH
// without re-importing the module.
function getAuditSpoolPath(): string {
  return process.env.AUDIT_SPOOL_PATH || path.join(process.cwd(), 'audit-spool.jsonl');
}
const AUDIT_SPOOL_REPLAY_INTERVAL_MS = 60_000;
const AUDIT_SPOOL_REPLAY_INITIAL_DELAY_MS = 30_000;

// Test seam: when set to '1' (only honoured outside production) the
// next writeAuditLogSync call throws synthetically so the integration
// test can prove the surrounding transaction rolls back. Persistent
// flag — toggled by an admin-only test endpoint mounted in dev only.
let _auditFaultInject = false;
export function setAuditFaultInject(enabled: boolean) {
  _auditFaultInject = enabled;
}
export function isAuditFaultInjectEnabled() {
  return _auditFaultInject;
}

export async function writeAuditLogSync(tx: DbClient, auditData: InsertAuditLog): Promise<void> {
  if (process.env.NODE_ENV !== 'production' && _auditFaultInject) {
    throw new Error('writeAuditLogSync: synthetic test failure (AUDIT_FAULT_INJECT)');
  }
  // No catch — propagate the error so the surrounding tx rolls back.
  await tx.insert(auditLog).values(auditData);
}

// All spool-file I/O (appends + the rename/write steps of replay) is
// serialised through this single chained-promise queue. Node is
// single-threaded so this acts as a process-wide mutex — without it,
// a concurrent append landing between replay's read and replay's
// rewrite could be silently overwritten.
let spoolIoQueue: Promise<void> = Promise.resolve();

async function withSpoolLock<T>(op: () => Promise<T>): Promise<T> {
  const previous = spoolIoQueue;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  spoolIoQueue = previous.then(() => gate);
  await previous.catch(() => {});
  try {
    return await op();
  } finally {
    release();
  }
}

// Exported for the concurrency regression test in
// tests/unit/auditLogDurability.test.ts. Production callers should NOT
// invoke this directly — let the writeAuditLog retry path decide when
// to spool. Exposing it here keeps the test honest: the test
// exercises the same lock/append code path that production uses.
export async function spoolAuditRow(data: InsertAuditLog): Promise<void> {
  await withSpoolLock(async () => {
    const line = JSON.stringify({ data, spooledAt: new Date().toISOString() }) + '\n';
    try {
      await fsPromises.appendFile(getAuditSpoolPath(), line, 'utf8');
    } catch (writeErr) {
      // The DB is down AND the disk write failed — nothing left to
      // do but log loudly. Operationally this is the audit-log
      // equivalent of a hardware failure.
      console.error(
        'CRITICAL: Audit-log disk-spool write failed; row will be lost:',
        writeErr,
        { auditData: data },
      );
    }
  });
}

let spoolReplayInFlight = false;

// Drain the on-disk spool back into the audit_log table. Returns the
// number of rows replayed and the number that are still pending. Safe
// under concurrent appends:
//
//   1. Atomically rename the live spool to a per-replay snapshot file
//      (under withSpoolLock). New failed writes that race the replay
//      land in a fresh AUDIT_SPOOL_PATH file — they are not visible
//      to this replay run and they are not at risk of being clobbered.
//   2. Process the snapshot (DB inserts) WITHOUT holding the lock,
//      so spool appends are not blocked on a slow Neon recovery.
//   3. Re-append still-failing lines back to the live spool file
//      under withSpoolLock, then unlink the snapshot.
//
// The in-flight guard short-circuits overlapping replay calls.
export async function replayAuditSpool(): Promise<{ replayed: number; pending: number }> {
  if (spoolReplayInFlight) return { replayed: 0, pending: 0 };
  spoolReplayInFlight = true;
  const snapshotPath = `${getAuditSpoolPath()}.replay-${Date.now()}-${process.pid}`;
  try {
    let snapshotExists = false;
    await withSpoolLock(async () => {
      try {
        await fsPromises.rename(getAuditSpoolPath(), snapshotPath);
        snapshotExists = true;
      } catch (renameErr: unknown) {
        if ((renameErr as NodeJS.ErrnoException)?.code === 'ENOENT') {
          // Spool file doesn't exist — nothing to replay.
          return;
        }
        throw renameErr;
      }
    });
    if (!snapshotExists) return { replayed: 0, pending: 0 };

    const content = await fsPromises.readFile(snapshotPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const stillPending: string[] = [];
    let replayed = 0;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const data = parsed.data as InsertAuditLog;
        await db.insert(auditLog).values(data);
        replayed++;
      } catch (replayErr) {
        // DB still down or row malformed — keep it for the next
        // replay. Better to retry forever than to silently drop a
        // sensitive audit row.
        stillPending.push(line);
      }
    }
    if (stillPending.length > 0) {
      await withSpoolLock(async () => {
        // Re-append to the live spool (which may have grown during
        // replay). appendFile is atomic per call on POSIX, and
        // serialised with concurrent appends via withSpoolLock.
        await fsPromises.appendFile(
          getAuditSpoolPath(),
          stillPending.join('\n') + '\n',
          'utf8',
        );
      });
    }
    // Snapshot processed — remove it. unlink failures are non-fatal:
    // the snapshot path is unique (timestamp + pid) and a leftover
    // file just wastes a few bytes on disk.
    await fsPromises.unlink(snapshotPath).catch(() => {});
    if (replayed > 0) {
      console.log(
        `[audit-spool] Replayed ${replayed} buffered audit row(s); ${stillPending.length} still pending`,
      );
    }
    return { replayed, pending: stillPending.length };
  } catch (replayErr) {
    // If something blew up between rename and re-append, try to put
    // the snapshot back so we don't lose the rows.
    try {
      await fsPromises.access(snapshotPath);
      await withSpoolLock(async () => {
        const snapshotContent = await fsPromises.readFile(snapshotPath, 'utf8').catch(() => '');
        if (snapshotContent.length > 0) {
          await fsPromises.appendFile(getAuditSpoolPath(), snapshotContent, 'utf8').catch(() => {});
        }
        await fsPromises.unlink(snapshotPath).catch(() => {});
      });
    } catch {
      /* snapshot already gone or unreadable — nothing to recover */
    }
    throw replayErr;
  } finally {
    spoolReplayInFlight = false;
  }
}

let spoolReplayTimer: NodeJS.Timeout | null = null;
let spoolReplayInitialTimer: NodeJS.Timeout | null = null;

export function startAuditSpoolReplayTimer(): void {
  if (spoolReplayTimer || spoolReplayInitialTimer) return;
  // Initial attempt after a short grace period so the DB pool is warm.
  spoolReplayInitialTimer = setTimeout(() => {
    spoolReplayInitialTimer = null;
    void replayAuditSpool().catch((err) =>
      console.error('[audit-spool] initial replay error:', err),
    );
  }, AUDIT_SPOOL_REPLAY_INITIAL_DELAY_MS);
  spoolReplayInitialTimer.unref?.();
  spoolReplayTimer = setInterval(() => {
    void replayAuditSpool().catch((err) =>
      console.error('[audit-spool] periodic replay error:', err),
    );
  }, AUDIT_SPOOL_REPLAY_INTERVAL_MS);
  spoolReplayTimer.unref?.();
}

export function stopAuditSpoolReplayTimer(): void {
  if (spoolReplayTimer) {
    clearInterval(spoolReplayTimer);
    spoolReplayTimer = null;
  }
  if (spoolReplayInitialTimer) {
    clearTimeout(spoolReplayInitialTimer);
    spoolReplayInitialTimer = null;
  }
}

export const writeAuditLog = (auditData: InsertAuditLog): void => {
  void (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < AUDIT_LOG_RETRY_ATTEMPTS; attempt++) {
      try {
        await db.insert(auditLog).values(auditData);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < AUDIT_LOG_RETRY_ATTEMPTS - 1) {
          // Exponential backoff between attempts. With 3 total
          // attempts and base = 100ms, the sleeps are 100ms then
          // 200ms (no sleep after the final attempt before falling
          // through to the disk-spool path).
          const delayMs = AUDIT_LOG_RETRY_BASE_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    // All in-memory retries exhausted — spool to disk and let the
    // periodic replay worker drain it once the DB recovers.
    console.error(
      `Audit log write failed after ${AUDIT_LOG_RETRY_ATTEMPTS} attempts; spooling to disk:`,
      lastErr,
      { auditData },
    );
    await spoolAuditRow(auditData);
  })();
};

export async function updateProductStock(
  productId: number,
  quantityChange: number,
  movementType: string,
  referenceId: number,
  referenceType: string,
  unitCost: number,
  notes: string,
  userId: string,
  tx?: DbClient
) {
  const dbClient: DbClient = tx ?? db;

  const [updated] = await dbClient
    .update(products)
    .set({
      stockQuantity: sql`COALESCE(stock_quantity, 0) + ${quantityChange}`,
      updatedAt: new Date()
    })
    .where(eq(products.id, productId))
    .returning({
      newStock: products.stockQuantity,
      previousStock: sql<number>`${products.stockQuantity} - ${quantityChange}`,
    });

  if (!updated) {
    throw new Error(`Product with ID ${productId} not found`);
  }

  const newStock = updated.newStock ?? 0;
  const previousStock = updated.previousStock ?? 0;

  await dbClient.insert(stockMovements).values({
    productId,
    movementType,
    referenceId,
    referenceType,
    quantity: quantityChange,
    previousStock,
    newStock,
    unitCost: unitCost.toString(),
    notes,
    createdBy: userId
  });

  return { previousStock, newStock };
}
