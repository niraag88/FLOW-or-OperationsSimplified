import type { Request, Response, NextFunction } from "express";
import { Client } from '@replit/object-storage';
import { users, auditLog, products, stockMovements, type InsertAuditLog, type User } from "@shared/schema";
import { db, pool } from "./db";
import { eq, sql } from "drizzle-orm";
import multer from 'multer';
import bcrypt from 'bcrypt';
import session from 'express-session';
import connectPg from 'connect-pg-simple';

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
const AUDIT_LOG_RETRY_ATTEMPTS = 3;
const AUDIT_LOG_RETRY_BASE_MS = 100;

export async function writeAuditLogSync(tx: DbClient, auditData: InsertAuditLog): Promise<void> {
  // No catch — propagate the error so the surrounding tx rolls back.
  await tx.insert(auditLog).values(auditData);
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
          // Exponential backoff: 100ms, 200ms, 400ms…
          const delayMs = AUDIT_LOG_RETRY_BASE_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    console.error(
      `Audit log write failed after ${AUDIT_LOG_RETRY_ATTEMPTS} attempts:`,
      lastErr,
      { auditData },
    );
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
