import type { Express } from "express";
import { storageObjects, invoices, deliveryOrders, purchaseOrders, goodsReceipts } from "@shared/schema";
import { db, pool } from "../../db";
import { eq } from "drizzle-orm";
import crypto from 'crypto';
import {
  requireAuth,
  objectStorageClient,
  validateUploadInput,
  validatePdfMagicBytes,
  validateImageMagicBytes,
  upload,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ERROR_MESSAGE,
  type AuthenticatedRequest,
} from "../../middleware";
import { logger } from "../../logger";

export function registerStorageUploadRoutes(app: Express) {
  app.post('/api/storage/sign-upload', requireAuth(['Admin', 'Staff', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const { key, contentType, checksum, fileSize } = req.body;

      if (!key) return res.status(400).json({ error: 'Key is required' });
      if (!contentType) return res.status(400).json({ error: 'Content type is required' });

      const validation = validateUploadInput(key, contentType, fileSize);
      if (!validation.valid) return res.status(400).json({ error: validation.error });

      if (req.user?.role !== 'Admin') {
        if (!key.includes(req.user?.id || '')) {
          return res.status(403).json({ error: 'Can only upload to your own files' });
        }
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + (10 * 60 * 1000);

      await pool.query(
        'INSERT INTO signed_tokens (token, key, expires, type, content_type, file_size, checksum) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [token, key, expires, 'upload', contentType ?? null, fileSize ?? null, checksum ?? null]
      );

      res.json({
        url: `/api/storage/upload/${token}`,
        method: 'PUT',
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          ...(checksum && { 'Content-MD5': checksum })
        }
      });
    } catch (error) {
      logger.error('Error generating upload URL:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  app.put('/api/storage/upload/:token', upload.single('file'), async (req, res) => {
    try {
      const { token } = req.params;
      const tokenResult = await pool.query(
        'SELECT * FROM signed_tokens WHERE token = $1 AND expires > $2',
        [token, Date.now()]
      );
      const row = tokenResult.rows[0];
      const tokenData = row ? {
        key: row.key as string,
        expires: Number(row.expires),
        type: row.type as 'upload' | 'download',
        contentType: row.content_type as string | undefined,
        fileSize: row.file_size as number | undefined,
        checksum: row.checksum as string | undefined,
      } : null;

      if (!tokenData || tokenData.type !== 'upload') {
        return res.status(401).json({ error: 'Invalid or expired upload token' });
      }

      let fileData: Buffer;
      if (req.file) {
        fileData = req.file.buffer;
      } else {
        const overflow = await new Promise<{ tooLarge: boolean; data?: Buffer }>((resolve, reject) => {
          const chunks: Buffer[] = [];
          let total = 0;
          req.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > MAX_UPLOAD_BYTES) {
              req.pause();
              resolve({ tooLarge: true });
              return;
            }
            chunks.push(chunk);
          });
          req.on('end', () => resolve({ tooLarge: false, data: Buffer.concat(chunks) }));
          req.on('error', reject);
        });

        if (overflow.tooLarge) {
          await pool.query('DELETE FROM signed_tokens WHERE token = $1', [token]);
          res.set('Connection', 'close');
          res.status(413).json({ error: MAX_UPLOAD_ERROR_MESSAGE });
          await new Promise<void>((resolve) => {
            res.once('finish', resolve);
            res.once('close', resolve);
          });
          req.destroy();
          return;
        }
        fileData = overflow.data!;
      }

      if (tokenData.fileSize && fileData.length !== tokenData.fileSize) {
        await pool.query('DELETE FROM signed_tokens WHERE token = $1', [token]);
        return res.status(400).json({ error: 'File size mismatch' });
      }

      if (tokenData.checksum) {
        const hash = crypto.createHash('md5').update(fileData).digest('hex');
        if (hash !== tokenData.checksum) {
          await pool.query('DELETE FROM signed_tokens WHERE token = $1', [token]);
          return res.status(400).json({ error: 'Checksum mismatch' });
        }
      }

      if (tokenData.contentType === 'application/pdf') {
        const pdfValidation = validatePdfMagicBytes(fileData);
        if (!pdfValidation.valid) {
          await pool.query('DELETE FROM signed_tokens WHERE token = $1', [token]);
          return res.status(400).json({ error: pdfValidation.error });
        }
      }

      const result = await objectStorageClient.uploadFromBytes(tokenData.key, fileData);
      if (!result.ok) {
        throw new Error(`Object storage upload failed: ${result.error?.message || 'unknown error'}`);
      }

      await pool.query('DELETE FROM signed_tokens WHERE token = $1', [token]);

      try {
        await db.insert(storageObjects)
          .values({ key: tokenData.key, sizeBytes: fileData.length })
          .onConflictDoUpdate({ target: storageObjects.key, set: { sizeBytes: fileData.length, uploadedAt: new Date() } });
      } catch (trackErr) {
        logger.error('Could not record storage size for', tokenData.key, '— size reporting may be inaccurate:', trackErr);
      }

      res.json({ success: true, key: tokenData.key });
    } catch (error) {
      logger.error('Error uploading file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  app.post('/api/storage/upload-scan', requireAuth(['Admin', 'Manager', 'Staff']), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file provided' });

      const storageKey = req.headers['x-storage-key'] as string;
      const contentType = req.headers['x-content-type'] as string;
      const fileSize = parseInt(req.headers['x-file-size'] as string);

      if (!storageKey || !contentType || !fileSize) {
        return res.status(400).json({ error: 'Missing required headers' });
      }

      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(contentType)) {
        return res.status(400).json({ error: 'Only PDF, JPG, and PNG files are allowed' });
      }

      if (fileSize > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: MAX_UPLOAD_ERROR_MESSAGE });
      }

      if (!storageKey.match(/^(invoices|delivery|purchase-orders|goods-receipts)\/\d{4}\/([^\/]+\.(pdf|jpg|jpeg|png)|[^\/]+\/\d{10,}-[^\/]+\.(pdf|jpg|jpeg|png))$/)) {
        return res.status(400).json({ error: 'Invalid storage key format' });
      }

      // Verify the key references a real document of the matching type so a
      // crafted key like `invoices/2026/INV-12345.pdf` cannot overwrite an
      // unrelated document's scan. The role gate above already mirrors the
      // four PATCH /<doc>/:id/scan-key routes (Admin/Manager/Staff). For
      // anonymous-staging GRN keys (no embedded document identifier) we
      // require the key to be unused so a guessed timestamp can't overwrite
      // an existing scan.
      const segments = storageKey.split('/');
      const prefix = segments[0];
      const keyYear = parseInt(segments[1], 10);
      const rest = segments.slice(2);
      const stripExt = (s: string) => s.replace(/\.(pdf|jpg|jpeg|png)$/i, '');

      let docIdentifier: string | null = null;
      if (rest.length === 1) {
        // Flat: `<prefix>/<year>/<file>.<ext>` — identifier = filename without
        // extension. For GRNs this format has no embedded identifier (the
        // filename is `<timestamp>-<safeName>`), so leave it null.
        if (prefix !== 'goods-receipts') docIdentifier = stripExt(rest[0]);
      } else {
        // Folder: `<prefix>/<year>/<folder>/<ts>-<file>.<ext>` — identifier =
        // folder name. GRN folders are `<receiptNumber>-doc<slot>`.
        docIdentifier = prefix === 'goods-receipts'
          ? rest[0].replace(/-doc\d+$/, '')
          : rest[0];
      }

      if (docIdentifier) {
        // Pull the doc's primary date so we can bind the key's year segment
        // to the document. Fall back to createdAt if the business date is
        // nullable (invoiceDate / orderDate on DOs).
        let docDate: Date | null = null;
        if (prefix === 'invoices') {
          const row = await db.select({ d: invoices.invoiceDate, c: invoices.createdAt })
            .from(invoices).where(eq(invoices.invoiceNumber, docIdentifier)).limit(1);
          if (row.length > 0) docDate = row[0].d ? new Date(row[0].d) : row[0].c;
        } else if (prefix === 'purchase-orders') {
          const row = await db.select({ d: purchaseOrders.orderDate, c: purchaseOrders.createdAt })
            .from(purchaseOrders).where(eq(purchaseOrders.poNumber, docIdentifier)).limit(1);
          if (row.length > 0) docDate = row[0].d ? new Date(row[0].d) : row[0].c;
        } else if (prefix === 'delivery') {
          const row = await db.select({ d: deliveryOrders.orderDate, c: deliveryOrders.createdAt })
            .from(deliveryOrders).where(eq(deliveryOrders.orderNumber, docIdentifier)).limit(1);
          if (row.length > 0) docDate = row[0].d ? new Date(row[0].d) : row[0].c;
        } else if (prefix === 'goods-receipts') {
          const row = await db.select({ d: goodsReceipts.receivedDate, c: goodsReceipts.createdAt })
            .from(goodsReceipts).where(eq(goodsReceipts.receiptNumber, docIdentifier)).limit(1);
          if (row.length > 0) docDate = row[0].d ?? row[0].c;
        }
        if (!docDate) {
          return res.status(404).json({ error: 'Referenced document not found' });
        }
        // Bind the key's year segment to the document's year so a crafted key
        // like `invoices/1999/INV-123/...` is rejected even when INV-123
        // exists (its scan key must live under its own year folder).
        if (docDate.getUTCFullYear() !== keyYear) {
          return res.status(404).json({ error: 'Storage key year does not match document year' });
        }
        // Task #367 (RF-4): refuse a direct re-upload to a key that already
        // holds a scan. Without this, a user who knows an existing
        // attachment path can silently overwrite a real document's scan,
        // bypassing the audited remove-then-upload replace flow that is the
        // ONLY sanctioned way to swap an existing scan. The same 409 has
        // applied since #353 to anonymous staging keys (below); this brings
        // doc-bound keys to parity. Check storage_objects first (cheap,
        // covers every key written by the app) and then probe object
        // storage to catch any legacy file uploaded before tracking
        // existed.
        const existing = await db
          .select({ key: storageObjects.key })
          .from(storageObjects)
          .where(eq(storageObjects.key, storageKey))
          .limit(1);
        if (existing.length > 0) {
          return res.status(409).json({ error: 'A scan already exists at that key. Use the replace flow.' });
        }
        const objectExists = await objectStorageClient.exists(storageKey);
        if (objectExists.ok && objectExists.value) {
          return res.status(409).json({ error: 'A scan already exists at that key. Use the replace flow.' });
        }
      } else {
        // Anonymous staging upload (GRN flat format only). Require the key
        // is fresh — refuse if storage_objects already tracks it so a
        // guessed timestamp cannot overwrite an existing scan. Also pin the
        // year segment to the current year so old/forged year folders are
        // rejected (these keys have no document yet to bind to).
        const nowYear = new Date().getUTCFullYear();
        if (keyYear !== nowYear) {
          return res.status(400).json({ error: 'Staging key year must be the current year' });
        }
        const existing = await db.select({ key: storageObjects.key }).from(storageObjects).where(eq(storageObjects.key, storageKey)).limit(1);
        if (existing.length > 0) {
          return res.status(409).json({ error: 'Storage key already in use' });
        }
        // Belt-and-braces: also check the underlying object store for any
        // legacy object that was uploaded before storage_objects tracking
        // existed. This closes the narrow case where a guessed timestamp
        // could overwrite an untracked legacy file.
        const objectExists = await objectStorageClient.exists(storageKey);
        if (objectExists.ok && objectExists.value) {
          return res.status(409).json({ error: 'Storage key already in use' });
        }
      }

      if (req.file.size !== fileSize) {
        return res.status(400).json({ error: 'File size mismatch' });
      }

      if (contentType === 'application/pdf') {
        const pdfValidation = validatePdfMagicBytes(req.file.buffer);
        if (!pdfValidation.valid) return res.status(400).json({ error: pdfValidation.error });
      } else {
        const imgValidation = validateImageMagicBytes(req.file.buffer, contentType);
        if (!imgValidation.valid) return res.status(400).json({ error: imgValidation.error });
      }

      const result = await objectStorageClient.uploadFromBytes(storageKey, req.file.buffer);
      if (!result.ok) throw new Error(`Upload failed: ${result.error}`);

      try {
        await db.insert(storageObjects)
          .values({ key: storageKey, sizeBytes: req.file.size })
          .onConflictDoUpdate({ target: storageObjects.key, set: { sizeBytes: req.file.size, uploadedAt: new Date() } });
      } catch (trackErr) {
        logger.error('Could not record storage size for', storageKey, '— size reporting may be inaccurate:', trackErr);
      }

      res.json({ success: true, key: storageKey });
    } catch (error) {
      logger.error('Error uploading scan:', error);
      res.status(500).json({ error: 'Failed to upload scan' });
    }
  });
}
