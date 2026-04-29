import type { Express } from "express";
import { auditLog, recycleBin, storageObjects, invoices, deliveryOrders, quotations, purchaseOrders, invoiceLineItems, deliveryOrderItems, quotationItems, purchaseOrderItems, products, brands, suppliers, customers, financialYears, backupRuns, restoreRuns, users } from "@shared/schema";
import { db, pool } from "../db";
import {
  executeFactoryReset,
  FACTORY_RESET_CONFIRMATION_PHRASE,
  FactoryResetConfirmationError,
} from "../factoryReset";
import { sendIfMissingConfirmation } from "../typedConfirmation";
import {
  RECYCLE_BIN_PERMANENT_DELETE_PHRASE,
  RESTORE_PHRASE,
} from "../../shared/destructiveActionPhrases";
import { eq, desc, sum, inArray } from "drizzle-orm";
import { Readable } from 'stream';
import { execSync } from 'child_process';
import { createWriteStream, createReadStream, unlink } from 'fs';
import { tmpdir } from 'os';
import ExcelJS from 'exceljs';
import { requireAuth, requireRole, writeAuditLog, objectStorageClient, validateUploadInput, validatePdfMagicBytes, validateImageMagicBytes, upload, setForceStorageDeleteFail, isForceStorageDeleteFailEnabled, MAX_UPLOAD_BYTES, MAX_UPLOAD_ERROR_MESSAGE, type AuthenticatedRequest } from "../middleware";
import { runBackup } from "../runBackup";
import { withBackupLock } from "../backupLock";
import { getBackupSchedule, updateBackupSchedule, BackupScheduleInputSchema } from "../backupSchedule";
import crypto from 'crypto';

export function registerSystemRoutes(app: Express) {
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
  }

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
      console.error('Error generating upload URL:', error);
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
        console.error('Could not record storage size for', tokenData.key, '— size reporting may be inaccurate:', trackErr);
      }

      res.json({ success: true, key: tokenData.key });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  app.post('/api/storage/upload-scan', requireAuth(), upload.single('file'), async (req, res) => {
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
        console.error('Could not record storage size for', storageKey, '— size reporting may be inaccurate:', trackErr);
      }

      res.json({ success: true, key: storageKey });
    } catch (error) {
      console.error('Error uploading scan:', error);
      res.status(500).json({ error: 'Failed to upload scan' });
    }
  });

  app.get('/api/storage/signed-get', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { key } = req.query;
      if (!key) return res.status(400).json({ error: 'Key parameter is required' });

      // Sensitive prefixes (backups/, restores/) hold full DB dumps and
      // restore artefacts. Any user able to mint a signed download token
      // for these objects can exfiltrate every business record. Restrict
      // them to Admin only — non-admin requests get 403 even if they
      // happen to know or guess a key. (Task #319 hardening.)
      const keyStr = String(key);
      const isSensitivePrefix = keyStr.startsWith('backups/') || keyStr.startsWith('restores/');
      if (isSensitivePrefix && req.user?.role !== 'Admin') {
        return res.status(403).json({ error: 'Forbidden: admin role required for this key' });
      }

      const exists = await objectStorageClient.exists(key as string);
      if (!exists.ok || !exists.value) {
        return res.status(404).json({ error: 'Object not found' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + (60 * 60 * 1000);

      await pool.query(
        'INSERT INTO signed_tokens (token, key, expires, type, content_type, file_size, checksum) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [token, key as string, expires, 'download', null, null, null]
      );

      res.json({ url: `/api/storage/download/${token}` });
    } catch (error) {
      console.error('Error generating download URL:', error);
      res.status(500).json({ error: 'Failed to generate download URL' });
    }
  });

  app.get('/api/storage/download/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const tokenResult = await pool.query(
        'SELECT * FROM signed_tokens WHERE token = $1 AND expires > $2',
        [token, Date.now()]
      );
      const dlRow = tokenResult.rows[0];
      const tokenData = dlRow ? {
        key: dlRow.key as string,
        expires: Number(dlRow.expires),
        type: dlRow.type as 'upload' | 'download',
      } : null;

      if (!tokenData || tokenData.type !== 'download') {
        return res.status(401).json({ error: 'Invalid or expired download token' });
      }

      const ext = tokenData.key.split('.').pop()?.toLowerCase() || '';
      const contentTypeMap: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
      };
      const fileContentType = contentTypeMap[ext] || 'application/octet-stream';
      const filename = tokenData.key.split('/').pop() || 'download';

      res.set({
        'Content-Type': fileContentType,
        'Content-Disposition': `inline; filename="${filename}"`,
      });

      const stream = objectStorageClient.downloadAsStream(tokenData.key);
      stream.on('error', (err: Error) => {
        console.error('Error streaming file from storage:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to download file' });
      });
      stream.pipe(res);
    } catch (error) {
      console.error('Error downloading file:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });

  app.get('/api/storage/list-prefix', requireAuth(['Admin']), async (req, res) => {
    try {
      const { prefix = '' } = req.query;
      const result = await objectStorageClient.list({ prefix: prefix as string });

      if (!result.ok) throw new Error('Failed to list objects');

      const keys = result.value.map((obj: any) => obj.name as string).filter(Boolean);
      const trackedSizes = new Map<string, number>();
      if (keys.length > 0) {
        const rows = await db.select({ key: storageObjects.key, sizeBytes: storageObjects.sizeBytes })
          .from(storageObjects)
          .where(inArray(storageObjects.key, keys));
        rows.forEach((r) => trackedSizes.set(r.key, r.sizeBytes));
      }

      const formattedObjects = result.value.map((obj: any) => ({
        key: obj.name,
        size: trackedSizes.get(obj.name) ?? obj.size ?? 0,
        lastModified: obj.timeCreated,
        etag: obj.etag
      }));

      res.json({ objects: formattedObjects });
    } catch (error) {
      console.error('Error listing objects:', error);
      res.status(500).json({ error: 'Failed to list objects' });
    }
  });

  app.get('/api/db/size', requireAuth(['Admin']), async (req, res) => {
    try {
      const result = await pool.query(`SELECT pg_database_size(current_database()) as bytes`);
      const bytes = parseInt(result.rows[0].bytes);
      res.json({ bytes, pretty: `${(bytes / 1024 / 1024).toFixed(1)} MB` });
    } catch (error) {
      console.error('Error getting database size:', error);
      res.status(500).json({ error: 'Failed to get database size' });
    }
  });

  app.get('/api/storage/total-size', requireAuth(['Admin']), async (req, res) => {
    try {
      const [result] = await db.select({ total: sum(storageObjects.sizeBytes) }).from(storageObjects);
      const totalSize = Number(result?.total ?? 0);
      res.json({ bytes: totalSize });
    } catch (error) {
      console.error('Error calculating total size:', error);
      res.status(500).json({ error: 'Failed to calculate total size' });
    }
  });

  app.get('/api/system/app-size', requireAuth(['Admin']), async (req, res) => {
    try {
      const output = execSync('du -sb /home/runner/workspace 2>/dev/null').toString();
      const bytes = parseInt(output.split('\t')[0]);
      res.json({ bytes });
    } catch (error) {
      console.error('Error getting app size:', error);
      res.status(500).json({ error: 'Failed to get app size' });
    }
  });

  app.get('/api/storage/object-info', requireAuth(['Admin']), async (req, res) => {
    try {
      const { key } = req.query;
      if (!key) return res.status(400).json({ error: 'Key parameter is required' });

      const exists = await objectStorageClient.exists(key as string);
      if (!exists.ok || !exists.value) {
        return res.status(404).json({ error: 'Object not found' });
      }

      res.json({
        key,
        exists: true,
        message: 'Object exists - detailed metadata not available with current client'
      });
    } catch (error) {
      console.error('Error getting object info:', error);
      res.status(500).json({ error: 'Failed to get object information' });
    }
  });

  app.delete('/api/storage/object', requireRole('Admin'), async (req, res) => {
    try {
      const { key } = req.query;
      if (!key) return res.status(400).json({ error: 'Key parameter is required' });

      const result = await objectStorageClient.delete(key as string);
      if (!result.ok) throw new Error('Failed to delete object');

      await db.delete(storageObjects).where(eq(storageObjects.key, key as string));

      res.json({ success: true, message: 'Object deleted successfully' });
    } catch (error) {
      console.error('Error deleting object:', error);
      res.status(500).json({ error: 'Failed to delete object' });
    }
  });

  app.get('/api/audit-logs', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const logs = await db.select().from(auditLog).orderBy(desc(auditLog.timestamp)).limit(500);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // POST /api/audit-logs intentionally not exposed: audit log records are
  // written server-side from each action handler via writeAuditLog(), so the
  // log can never be forged through the HTTP layer (Task #319).

  app.get('/api/recycle-bin', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const items = await db.select().from(recycleBin).orderBy(desc(recycleBin.deletedDate));
      const mapped = items.map(item => ({
        id: item.id,
        document_type: item.documentType,
        document_id: item.documentId,
        document_number: item.documentNumber,
        deleted_by: item.deletedBy,
        deleted_date: item.deletedDate,
        reason: item.reason,
        original_status: item.originalStatus,
        can_restore: item.canRestore,
        created_at: item.createdAt,
      }));
      res.json(mapped);
    } catch (error) {
      console.error('Error fetching recycle bin:', error);
      res.status(500).json({ error: 'Failed to fetch recycle bin' });
    }
  });

  // POST /api/recycle-bin intentionally not exposed: each entity DELETE
  // handler (invoices, delivery orders, quotations, purchase orders, etc.)
  // writes its own recycle-bin row server-side. Accepting forged
  // recycle-bin payloads from a client would let any logged-in user inject
  // bogus recovery rows referencing documents they never owned (Task #319).

  // DELETE /api/recycle-bin/:id — permanent delete. Requires the typed
  // confirmation phrase in the body.
  app.delete('/api/recycle-bin/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    if (!sendIfMissingConfirmation(
      res,
      req.body,
      RECYCLE_BIN_PERMANENT_DELETE_PHRASE,
      'recycle_bin_permanent_delete_confirmation_required',
      'Permanently delete from recycle bin',
    )) return;

    try {
      const id = parseInt(req.params.id);
      const [rbItem] = await db.select({ documentType: recycleBin.documentType, documentNumber: recycleBin.documentNumber }).from(recycleBin).where(eq(recycleBin.id, id));
      await db.delete(recycleBin).where(eq(recycleBin.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'recycle_bin', action: 'DELETE', details: `Permanently deleted ${rbItem?.documentType} #${rbItem?.documentNumber}` });
      res.json({ success: true, message: 'Permanently deleted from recycle bin' });
    } catch (error) {
      console.error('Error permanently deleting from recycle bin:', error);
      res.status(500).json({ error: 'Failed to permanently delete' });
    }
  });

  app.post('/api/recycle-bin/:id/restore', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const [item] = await db.select().from(recycleBin).where(eq(recycleBin.id, id));

      if (!item) return res.status(404).json({ error: 'Recycle bin item not found' });

      const { header, items: lineItems = [] } = JSON.parse(item.documentData);

      if (!['Invoice', 'DeliveryOrder', 'Quotation', 'PurchaseOrder', 'Product', 'Brand', 'Supplier', 'Customer'].includes(item.documentType)) {
        return res.status(400).json({ error: `Unknown document type: ${item.documentType}` });
      }

      const { invoices: invTable, deliveryOrders: doTable, quotations: quoteTable, purchaseOrders: poTable, invoiceLineItems: invItems, deliveryOrderItems: doItems, quotationItems: quoteItems, purchaseOrderItems: poItems } = await import('@shared/schema');

      await db.transaction(async (tx) => {
        if (item.documentType === 'Invoice') {
          const { id: _id, createdAt: _ca, ...headerData } = header;
          const [restored] = await tx.insert(invTable).values(headerData).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, invoiceId: _inv, ...liData } = li;
            await tx.insert(invItems).values({ ...liData, invoiceId: restored.id });
          }
        } else if (item.documentType === 'DeliveryOrder') {
          const { id: _id, createdAt: _ca, ...headerData } = header;
          const [restored] = await tx.insert(doTable).values(headerData).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, doId: _did, ...liData } = li;
            await tx.insert(doItems).values({ ...liData, doId: restored.id });
          }
        } else if (item.documentType === 'Quotation') {
          const { id: _id, createdAt: _ca, updatedAt: _ua, customerName: _cn, ...headerData } = header;
          const [restored] = await tx.insert(quoteTable).values({
            ...headerData,
            quoteDate: headerData.quoteDate ? new Date(headerData.quoteDate) : new Date(),
            validUntil: headerData.validUntil ? new Date(headerData.validUntil) : new Date(),
            referenceDate: headerData.referenceDate ? new Date(headerData.referenceDate) : null,
          }).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, quoteId: _qid, ...liData } = li;
            await tx.insert(quoteItems).values({ ...liData, quoteId: restored.id });
          }
        } else if (item.documentType === 'PurchaseOrder') {
          const { id: _id, createdAt: _ca, updatedAt: _ua, supplierName: _sn, ...headerData } = header;
          const [restored] = await tx.insert(poTable).values({
            ...headerData,
            orderDate: headerData.orderDate ? new Date(headerData.orderDate) : new Date(),
            expectedDelivery: headerData.expectedDelivery ? new Date(headerData.expectedDelivery) : null,
          }).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, poId: _pid, ...liData } = li;
            await tx.insert(poItems).values({ ...liData, poId: restored.id });
          }
        } else if (item.documentType === 'Product') {
          const { id: _id, createdAt: _ca, updatedAt: _ua, ...productData } = header;
          if (productData.sku) {
            const [existing] = await tx.select({ id: products.id })
              .from(products)
              .where(eq(products.sku, productData.sku));
            if (existing) {
              throw Object.assign(new Error(`A product with SKU "${productData.sku}" already exists. Rename the existing product's SKU first, then retry.`), { code: 'SKU_CONFLICT' });
            }
          }
          await tx.insert(products).values({ ...productData, isActive: true });
        } else if (item.documentType === 'Brand') {
          const { id: _id, createdAt: _ca, ...brandData } = header;
          await tx.insert(brands).values({ ...brandData });
        } else if (item.documentType === 'Supplier') {
          const { id: _id, createdAt: _ca, ...supplierData } = header;
          await tx.insert(suppliers).values({ ...supplierData });
        } else if (item.documentType === 'Customer') {
          const { id: _id, createdAt: _ca, ...customerData } = header;
          await tx.insert(customers).values({ ...customerData });
        }
        await tx.delete(recycleBin).where(eq(recycleBin.id, id));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'recycle_bin', action: 'UPDATE', details: `Restored ${item.documentType} #${item.documentNumber} from recycle bin` });
      res.json({ success: true, message: `${item.documentNumber} has been restored successfully` });
    } catch (error: any) {
      console.error('Error restoring document:', error);
      if (error?.code === 'SKU_CONFLICT') {
        return res.status(409).json({ error: error.message });
      }
      if (error?.code === '23505' && error?.constraint?.includes('sku')) {
        return res.status(409).json({ error: `SKU conflict: a product with that SKU already exists.` });
      }
      res.status(500).json({ error: 'Failed to restore document' });
    }
  });

  app.get('/api/ops/backup-status', requireAuth(['Admin']), async (req, res) => {
    try {
      const dbBackupsResult = await objectStorageClient.list({ prefix: 'backups/db/' });
      const manifestBackupsResult = await objectStorageClient.list({ prefix: 'backups/objects/' });

      let latestDbBackup: any = null;
      let latestManifestBackup: any = null;

      if (dbBackupsResult.ok && dbBackupsResult.value.length > 0) {
        latestDbBackup = dbBackupsResult.value
          .sort((a: any, b: any) => new Date(b.timeCreated || b.updated).getTime() - new Date(a.timeCreated || a.updated).getTime())[0];
      }

      if (manifestBackupsResult.ok && manifestBackupsResult.value.length > 0) {
        latestManifestBackup = manifestBackupsResult.value
          .sort((a: any, b: any) => new Date(b.timeCreated || b.updated).getTime() - new Date(a.timeCreated || a.updated).getTime())[0];
      }

      res.json({
        latestDbBackup: latestDbBackup ? {
          filename: (latestDbBackup as any).name,
          size: (latestDbBackup as any).size || 0,
          timestamp: (latestDbBackup as any).timeCreated || (latestDbBackup as any).updated
        } : null,
        latestManifestBackup: latestManifestBackup ? {
          filename: (latestManifestBackup as any).name,
          size: (latestManifestBackup as any).size || 0,
          timestamp: (latestManifestBackup as any).timeCreated || (latestManifestBackup as any).updated
        } : null
      });
    } catch (error) {
      console.error('Error getting backup status:', error);
      res.status(500).json({ error: 'Failed to get backup status' });
    }
  });

  app.post('/api/ops/run-backups', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      // Share the same advisory lock as the scheduled-backup tick so a
      // manual backup and a scheduled backup can never overlap, and two
      // simultaneous manual POSTs cannot collide on filenames or pruning.
      // Try-lock semantics: never wait — return 409 immediately if the
      // lock is held. (Task #345.)
      const outcome = await withBackupLock(async () => runBackup({
        id: req.user!.id,
        username: req.user?.username || String(req.user!.id),
      }));
      if (!outcome.acquired) {
        res.status(409).json({
          error: 'backup_already_running',
          message: 'Another backup is already in progress. Please wait for it to finish before starting a new one.',
        });
        return;
      }
      const result = outcome.result;
      if (result.success) {
        res.status(200).json(result);
      } else {
        console.error('Backup failed:', { db: result.dbBackup, manifest: result.manifestBackup, err: result.errorMessage });
        res.status(500).json(result);
      }
    } catch (error) {
      console.error('Error running backups:', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: errMsg, timestamp: new Date().toISOString() });
    }
  });

  app.get('/api/ops/backup-schedule', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const schedule = await getBackupSchedule();
      res.json(schedule);
    } catch (error) {
      console.error('Error fetching backup schedule:', error);
      res.status(500).json({ error: 'Failed to fetch backup schedule' });
    }
  });

  app.put('/api/ops/backup-schedule', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = BackupScheduleInputSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        return res.status(400).json({
          error: firstIssue?.message || 'Invalid backup schedule input',
          field: firstIssue?.path.join('.') || null,
          issues: parsed.error.issues,
        });
      }
      const updated = await updateBackupSchedule(parsed.data, req.user!.id);
      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: 'company',
        targetType: 'backup_schedule',
        action: 'UPDATE',
        details: `Backup schedule ${parsed.data.enabled ? `enabled (${parsed.data.frequency} at ${parsed.data.timeOfDay} Asia/Dubai, retain ${parsed.data.retentionCount}, alert ${parsed.data.alertThresholdDays}d)` : 'disabled'}`,
      });
      res.json(updated);
    } catch (error) {
      console.error('Error updating backup schedule:', error);
      res.status(500).json({ error: 'Failed to update backup schedule' });
    }
  });

  app.get('/api/ops/backup-runs', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const runs = await db.select().from(backupRuns).orderBy(desc(backupRuns.ranAt)).limit(20);
      res.json({ runs });
    } catch (error) {
      console.error('Error fetching backup runs:', error);
      res.status(500).json({ error: 'Failed to fetch backup runs' });
    }
  });

  /**
   * GET /api/ops/latest-backup — informational backup-freshness lookup.
   *
   * Used by the factory-reset confirmation dialog (Task #336) to surface a
   * yellow warning panel when the last successful backup is missing or older
   * than `freshnessWindowHours`.
   *
   * INFORMATIONAL ONLY. Nothing about this endpoint or its consumers gates
   * the destructive POST /api/ops/factory-reset call. The four-wall defence
   * (Task #331) remains the only enforcement boundary; this endpoint exists
   * solely to give the admin context before they choose to proceed.
   *
   * Response shape (always 200 for an authenticated Admin):
   *   {
   *     lastSuccessfulBackupAt: string | null,  // ISO timestamp of most recent fully-successful backup, or null
   *     freshnessWindowHours:   number,         // currently 24
   *     isFresh:                boolean,        // true iff lastSuccessfulBackupAt exists AND is younger than the window
   *   }
   */
  const BACKUP_FRESHNESS_WINDOW_HOURS = 24;
  app.get('/api/ops/latest-backup', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const [latest] = await db
        .select({ ranAt: backupRuns.ranAt })
        .from(backupRuns)
        .where(eq(backupRuns.success, true))
        .orderBy(desc(backupRuns.ranAt))
        .limit(1);

      const lastSuccessfulBackupAt = latest?.ranAt ?? null;
      let isFresh = false;
      if (lastSuccessfulBackupAt) {
        const ageMs = Date.now() - new Date(lastSuccessfulBackupAt).getTime();
        isFresh = ageMs >= 0 && ageMs < BACKUP_FRESHNESS_WINDOW_HOURS * 60 * 60 * 1000;
      }

      res.json({
        lastSuccessfulBackupAt: lastSuccessfulBackupAt
          ? new Date(lastSuccessfulBackupAt).toISOString()
          : null,
        freshnessWindowHours: BACKUP_FRESHNESS_WINDOW_HOURS,
        isFresh,
      });
    } catch (error) {
      console.error('Error fetching latest-backup freshness:', error);
      res.status(500).json({ error: 'Failed to fetch latest-backup freshness' });
    }
  });

  app.get('/api/ops/backup-runs/:id/download', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const runId = parseInt(req.params.id, 10);
      if (isNaN(runId)) return res.status(400).json({ error: 'Invalid backup run ID' });

      const [run] = await db.select().from(backupRuns).where(eq(backupRuns.id, runId)).limit(1);
      if (!run) return res.status(404).json({ error: 'Backup run not found' });
      if (!run.dbStorageKey) return res.status(404).json({ error: 'No database backup file associated with this run' });
      if (!run.dbSuccess) return res.status(400).json({ error: 'This backup run did not succeed — no file to download' });

      const filename = run.dbStorageKey.split('/').pop() || 'backup.sql.gz';

      const existsResult = await objectStorageClient.exists(run.dbStorageKey);
      if (!existsResult.ok || !existsResult.value) {
        return res.status(404).json({ error: 'Backup file no longer exists in storage — it may have been deleted or expired' });
      }

      res.set({
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });

      const stream = objectStorageClient.downloadAsStream(run.dbStorageKey);
      stream.on('error', (err: Error) => {
        console.error('Error streaming backup file from storage:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to stream backup file from storage' });
      });
      stream.pipe(res);
    } catch (error) {
      console.error('Error downloading backup:', error);
      res.status(500).json({ error: 'Failed to download backup' });
    }
  });

  // ─── Restore Endpoints ────────────────────────────────────────────────────

  /**
   * Shared restore helper.
   *
   * Audit persistence strategy:
   *   1. BEFORE the restore, insert a "pending" row into ops.restore_runs.
   *      The ops schema is NOT dropped by the restore (only public is), so
   *      this record is guaranteed to survive regardless of outcome.
   *   2. RUN the restore. The new restoreBackup() validates and decompresses
   *      the .sql.gz to a temp file BEFORE any destructive action, then
   *      runs DROP SCHEMA public + CREATE SCHEMA public + the dump in ONE
   *      psql --single-transaction. Any failure rolls back; live data
   *      remains intact.
   *   3. AFTER the restore, update the pre-created row with the final result.
   *      Also best-effort write to public.audit_log (which is recreated from
   *      the backup; if the backup is very old and lacks audit_log, this fails
   *      silently — the ops record is already the definitive audit trail).
   */
  async function runRestore(opts: {
    /** A readable .sql.gz stream OR a path to an existing .sql.gz file on disk. */
    sqlGzInput: import('stream').Readable | string;
    triggeredBy: string;
    sourceBackupRunId?: number;
    sourceFilename?: string;
    res: import('express').Response;
    actorName: string;
  }) {
    const { sqlGzInput, triggeredBy, sourceBackupRunId, sourceFilename, res, actorName } = opts;
    const label = sourceFilename || (sourceBackupRunId ? `backup run #${sourceBackupRunId}` : 'unknown');

    // Step 1: Pre-create a pending record in ops.restore_runs BEFORE the restore.
    // ops schema is not touched by DROP SCHEMA public CASCADE, so this always persists.
    let preCreatedId: number | null = null;
    try {
      const [inserted] = await db.insert(restoreRuns).values({
        triggeredBy,
        triggeredByName: actorName,
        sourceBackupRunId: sourceBackupRunId ?? null,
        sourceFilename: sourceFilename ?? null,
        success: null,  // pending — will be updated after restore
      }).returning({ id: restoreRuns.id });
      preCreatedId = inserted?.id ?? null;
    } catch (preErr) {
      console.error('Could not pre-create ops.restore_runs record:', preErr);
    }

    // Step 2: Run the restore.
    let result: { success: boolean; error?: string; durationMs: number };
    try {
      // @ts-ignore
      const { restoreBackup } = await import('../../scripts/restoreBackup.js');
      result = await restoreBackup(sqlGzInput);
    } catch (importOrRunError: any) {
      console.error('Error during restore execution:', importOrRunError);
      result = { success: false, error: importOrRunError.message || 'Restore failed unexpectedly', durationMs: 0 };
    }

    const finishedAt = new Date();

    // Step 3: Update the pre-created ops record with the final outcome.
    // The ops schema was untouched by the restore, so this always works.
    if (preCreatedId !== null) {
      try {
        await db.update(restoreRuns)
          .set({
            finishedAt,
            success: result.success,
            errorMessage: result.error ?? null,
            durationMs: result.durationMs ?? null,
          })
          .where(eq(restoreRuns.id, preCreatedId));
      } catch (updateErr) {
        console.error('Could not update ops.restore_runs record after restore:', updateErr);
      }
    } else {
      // Pre-create failed — insert a new complete record now.
      try {
        await db.insert(restoreRuns).values({
          triggeredBy,
          triggeredByName: actorName,
          sourceBackupRunId: sourceBackupRunId ?? null,
          sourceFilename: sourceFilename ?? null,
          finishedAt,
          success: result.success,
          errorMessage: result.error ?? null,
          durationMs: result.durationMs ?? null,
        });
      } catch (retryErr) {
        console.error('Could not insert ops.restore_runs record after restore:', retryErr);
      }
    }

    // Step 4 (best-effort): Write to public.audit_log in the now-restored DB.
    try {
      writeAuditLog({
        actor: triggeredBy,
        actorName,
        targetId: 'restore',
        targetType: 'restore_run',
        action: 'CREATE',
        details: `Database restore from ${label} ${result.success ? 'succeeded' : `failed: ${result.error}`} (durationMs: ${result.durationMs})`,
      });
    } catch (_) {}

    if (result.success) {
      return res.json({ success: true, durationMs: result.durationMs });
    } else {
      return res.status(500).json({ success: false, error: result.error || 'Restore failed', durationMs: result.durationMs });
    }
  }

  // POST /api/ops/backup-runs/:id/restore — restore from a stored cloud
  // backup. Requires the typed confirmation phrase in the body.
  app.post('/api/ops/backup-runs/:id/restore', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    if (!sendIfMissingConfirmation(
      res,
      req.body,
      RESTORE_PHRASE,
      'restore_confirmation_required',
      'Emergency restore from cloud backup',
    )) return;

    const runId = parseInt(req.params.id, 10);
    if (isNaN(runId)) return res.status(400).json({ error: 'Invalid backup run ID' });

    const [run] = await db.select().from(backupRuns).where(eq(backupRuns.id, runId)).limit(1);
    if (!run) return res.status(404).json({ error: 'Backup run not found' });
    if (!run.success) return res.status(400).json({ error: 'This backup run did not fully succeed — only fully successful backup runs can be restored' });
    if (!run.dbSuccess || !run.dbStorageKey) return res.status(400).json({ error: 'This backup run does not have a successful DB dump to restore from' });

    const existsResult = await objectStorageClient.exists(run.dbStorageKey);
    if (!existsResult.ok || !existsResult.value) {
      return res.status(404).json({ error: 'Backup file no longer exists in storage — it may have been deleted' });
    }

    const stream = objectStorageClient.downloadAsStream(run.dbStorageKey);
    return runRestore({
      sqlGzInput: stream,
      triggeredBy: req.user!.id,
      actorName: req.user?.username || req.user!.id,
      sourceBackupRunId: runId,
      sourceFilename: run.dbStorageKey.split('/').pop() || run.dbStorageKey,
      res,
    });
  });

  // POST /api/ops/restore-upload — restore from an uploaded .sql.gz file.
  // The upload is buffered to a temp file before runRestore is invoked so
  // the file-size check completes before any destructive action begins.
  // Requires a multipart `confirmation` field with the typed phrase.
  app.post('/api/ops/restore-upload', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Request must be multipart/form-data' });
    }

    // @ts-ignore
    const Busboy = (await import('busboy')).default;
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 500 * 1024 * 1024 } });

    const triggeredBy = req.user!.id;
    const actorName = req.user?.username || req.user!.id;

    let fileHandled = false;
    let tempPath: string | null = null;
    let hitSizeLimit = false;
    let sourceFilename = '';
    let confirmationField: string | undefined;

    bb.on('field', (fieldname: string, value: string) => {
      if (fieldname === 'confirmation') confirmationField = value;
    });

    // Resolves when the write stream finishes flushing to disk; rejects on error.
    // Default to resolved so bb.on('finish') can always await it safely when
    // no file event fired (e.g. wrong field name, extension error paths).
    let writePromise: Promise<void> = Promise.resolve();

    const cleanupTemp = () => {
      if (tempPath) {
        const p = tempPath;
        tempPath = null;
        unlink(p, (err) => {
          if (err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error('Failed to delete temp restore file:', err.message);
          }
        });
      }
    };

    bb.on('file', (fieldname: string, fileStream: import('stream').Readable, info: { filename: string }) => {
      if (fieldname !== 'file') { fileStream.resume(); return; }
      if (fileHandled) { fileStream.resume(); return; }
      fileHandled = true;

      const { filename } = info;
      if (!filename.endsWith('.sql.gz')) {
        fileStream.resume();
        res.status(400).json({ error: 'File must be a .sql.gz gzip-compressed PostgreSQL dump' });
        return;
      }

      sourceFilename = filename;
      tempPath = `${tmpdir()}/restore-upload-${crypto.randomUUID()}.sql.gz`;
      const ws = createWriteStream(tempPath);

      fileStream.on('limit', () => {
        hitSizeLimit = true;
        fileStream.resume();
      });

      writePromise = new Promise<void>((resolve, reject) => {
        fileStream.on('error', reject);
        ws.on('error', reject);
        ws.on('finish', resolve);
      });

      fileStream.pipe(ws);
    });

    bb.on('finish', async () => {
      if (!fileHandled) {
        if (!res.headersSent) res.status(400).json({ error: 'No file uploaded. Send a .sql.gz file as multipart field "file".' });
        return;
      }

      // Extension-check already sent a 400 — nothing more to do
      if (res.headersSent) return;

      // Wait for the upload to be fully flushed to disk before any destructive action
      try {
        await writePromise;
      } catch (err: any) {
        console.error('Error staging upload to temp file:', err.message);
        cleanupTemp();
        if (!res.headersSent) res.status(500).json({ error: 'Failed to buffer uploaded file' });
        return;
      }

      if (hitSizeLimit) {
        cleanupTemp();
        if (!res.headersSent) res.status(413).json({ error: 'File too large. Maximum size is 500 MB.' });
        return;
      }

      // Task #337 typed-phrase guard. Same shared helper as the JSON
      // routes — the multipart `confirmation` field captured above is
      // wrapped into a body-shaped object so the helper sees the same
      // shape it expects from `req.body`.
      if (
        !sendIfMissingConfirmation(
          res,
          { confirmation: confirmationField },
          RESTORE_PHRASE,
          'restore_confirmation_required',
          'Emergency restore from uploaded file',
        )
      ) {
        cleanupTemp();
        return;
      }

      try {
        // Pass the temp file path directly so restoreBackup() doesn't have to
        // re-stage the upload; restoreBackup will read from this path, validate,
        // and decompress to its own temp file before any destructive action.
        await runRestore({
          sqlGzInput: tempPath!,
          triggeredBy,
          actorName,
          sourceFilename,
          res,
        });
      } finally {
        cleanupTemp();
      }
    });

    bb.on('error', (err: Error) => {
      console.error('Busboy parse error:', err);
      cleanupTemp();
      if (!res.headersSent) res.status(400).json({ error: 'Failed to parse multipart upload' });
    });

    req.pipe(bb);
  });

  /**
   * GET /api/ops/restore-runs — last 10 restore run records.
   *
   * Reads from ops.restore_runs which is NOT in the public schema
   * and is therefore unaffected by database restores.
   * Uses triggeredByName (denormalized) since users table is in public
   * and may reflect a different state after restore.
   * LEFT JOIN on backup_runs (public) for the backup filename — best-effort.
   */
  app.get('/api/ops/restore-runs', requireAuth(['Admin']), async (req, res) => {
    try {
      const rows = await db
        .select({
          id: restoreRuns.id,
          restoredAt: restoreRuns.restoredAt,
          finishedAt: restoreRuns.finishedAt,
          triggeredBy: restoreRuns.triggeredBy,
          triggeredByName: restoreRuns.triggeredByName,
          sourceBackupRunId: restoreRuns.sourceBackupRunId,
          sourceFilename: restoreRuns.sourceFilename,
          success: restoreRuns.success,
          errorMessage: restoreRuns.errorMessage,
          durationMs: restoreRuns.durationMs,
          backupDbFilename: backupRuns.dbFilename,
        })
        .from(restoreRuns)
        .leftJoin(backupRuns, eq(restoreRuns.sourceBackupRunId, backupRuns.id))
        .orderBy(desc(restoreRuns.restoredAt))
        .limit(10);
      res.json({ runs: rows });
    } catch (error) {
      console.error('Error fetching restore runs:', error);
      res.status(500).json({ error: 'Failed to fetch restore history' });
    }
  });

  /**
   * POST /api/ops/factory-reset
   *
   * Wipes ALL business data from the public schema and re-inserts a blank
   * company_settings row.  The ops schema (restore_runs) is intentionally
   * untouched.  Users table partially preserved (only Admin role retained).
   *
   * Deletion order respects FK constraints (children before parents).
   *
   * ─── Wall 2 of the four-wall defence (Task #331) ─────────────────────────
   * Body MUST contain { confirmation: "<exact phrase>" }. Any deviation
   * (missing, wrong text, wrong casing, extra whitespace) is rejected with
   * 400 BEFORE the helper is invoked. This stops the historical bug where
   * a bare POST with no body wiped the database. The phrase is exported
   * from server/factoryReset.ts as FACTORY_RESET_CONFIRMATION_PHRASE.
   */
  app.post('/api/ops/factory-reset', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    const body = (req.body ?? {}) as { confirmation?: unknown };
    const confirmation = typeof body.confirmation === 'string' ? body.confirmation : '';

    if (confirmation !== FACTORY_RESET_CONFIRMATION_PHRASE) {
      // NOTE: do NOT echo the expected phrase back in the error body. The
      // phrase is shown in the UI dialog and lives at shared/factoryResetPhrase.ts;
      // a script must obtain it deliberately, not auto-recover from a 400.
      return res.status(400).json({
        error: 'factory_reset_confirmation_required',
        message:
          'Factory reset refused: the request body must include the exact ' +
          'confirmation phrase shown in the dialog. This is a deliberate ' +
          'guard against accidental data loss.',
      });
    }

    let databaseHost: string | undefined;
    try {
      databaseHost = new URL(process.env.DATABASE_URL ?? '').host || undefined;
    } catch {
      databaseHost = undefined;
    }

    const client = await pool.connect();
    // Postgres session-level advisory lock — prevents two concurrent
    // factory-reset requests from interleaving. The lock key (-31) is a
    // stable arbitrary integer dedicated to this operation; releasing on
    // any exit path (including server crash) is automatic when the
    // connection drops because session locks live on the connection.
    const FACTORY_RESET_LOCK_KEY = -31;
    let lockAcquired = false;
    try {
      const lockResult = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [FACTORY_RESET_LOCK_KEY],
      );
      lockAcquired = lockResult.rows[0]?.locked === true;
      if (!lockAcquired) {
        return res.status(409).json({
          error: 'factory_reset_in_progress',
          message:
            'Another factory reset is already running. Wait for it to finish, ' +
            'then try again.',
        });
      }

      await executeFactoryReset(
        client,
        { id: String(req.user!.id), name: req.user!.username },
        { confirmation, databaseHost },
      );
      res.json({ ok: true, message: 'Factory reset complete. All business data has been wiped.' });
    } catch (error: any) {
      if (error instanceof FactoryResetConfirmationError) {
        return res.status(400).json({
          error: 'factory_reset_confirmation_required',
          message: error.message,
        });
      }
      console.error('Factory reset failed:', error);
      res.status(500).json({ error: 'Factory reset failed', details: error.message });
    } finally {
      if (lockAcquired) {
        await client
          .query('SELECT pg_advisory_unlock($1)', [FACTORY_RESET_LOCK_KEY])
          .catch(() => {});
      }
      client.release();
    }
  });

  app.get('/api/books', requireAuth(), async (req, res) => {
    try {
      const years = await db.select().from(financialYears).orderBy(desc(financialYears.year));
      res.json(years);
    } catch (error) {
      console.error('Error fetching financial years:', error);
      res.status(500).json({ error: 'Failed to fetch financial years' });
    }
  });

  app.post('/api/books', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body;
      const year = parseInt(body.year);
      if (isNaN(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: 'Invalid year' });
      }
      const existing = await db.select().from(financialYears).where(eq(financialYears.year, year));
      if (existing.length > 0) {
        return res.status(409).json({ error: `Financial year ${year} already exists` });
      }
      const [created] = await db.insert(financialYears).values({
        year,
        startDate: body.start_date || `${year}-01-01`,
        endDate: body.end_date || `${year}-12-31`,
        status: 'Open',
      }).returning();
      writeAuditLog({ actor: req.user!.id, actorName: req.user!.username, targetId: String(created.id), targetType: 'financial_year', action: 'CREATE', details: `Financial year ${year} created` });
      res.status(201).json(created);
    } catch (error) {
      console.error('Error creating financial year:', error);
      res.status(500).json({ error: 'Failed to create financial year' });
    }
  });

  app.put('/api/books/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const { status } = req.body;
      if (!['Open', 'Closed'].includes(status)) {
        return res.status(400).json({ error: 'Status must be Open or Closed' });
      }
      const [updated] = await db.update(financialYears)
        .set({ status })
        .where(eq(financialYears.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Financial year not found' });
      writeAuditLog({ actor: req.user!.id, actorName: req.user!.username, targetId: String(id), targetType: 'financial_year', action: 'UPDATE', details: `Financial year ${updated.year} set to ${status}` });
      res.json(updated);
    } catch (error) {
      console.error('Error updating financial year:', error);
      res.status(500).json({ error: 'Failed to update financial year' });
    }
  });

  app.get('/api/books/:id/export', requireAuth(), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

      const [book] = await db.select().from(financialYears).where(eq(financialYears.id, id));
      if (!book) return res.status(404).json({ error: 'Financial year not found' });

      const startDate = new Date(book.startDate);
      const endDate = new Date(book.endDate);
      endDate.setHours(23, 59, 59, 999);

      const [allInvoices, allQuotations, allPOs, allDOs] = await Promise.all([
        db.select().from(invoices),
        db.select().from(quotations),
        db.select().from(purchaseOrders),
        db.select().from(deliveryOrders),
      ]);

      const inRange = (dateVal: string | Date | null | undefined) => {
        if (!dateVal) return false;
        const d = new Date(dateVal);
        return d >= startDate && d <= endDate;
      };

      const yearInvoices = allInvoices.filter(r => inRange(r.invoiceDate));
      const yearQuotations = allQuotations.filter(r => inRange(r.quoteDate));
      const yearPOs = allPOs.filter(r => inRange(r.orderDate));
      const yearDOs = allDOs.filter(r => inRange(r.orderDate));

      const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-GB') : '';
      const fmtNum = (n: any) => n ? parseFloat(String(n)).toFixed(2) : '0.00';

      const wb = new ExcelJS.Workbook();

      const addJsonSheet = (sheetName: string, rows: Record<string, any>[], fallbackNote: string) => {
        const ws = wb.addWorksheet(sheetName);
        if (rows.length === 0) {
          ws.addRow(['Note']);
          ws.addRow([fallbackNote]);
        } else {
          const headers = Object.keys(rows[0]);
          ws.addRow(headers);
          for (const row of rows) {
            ws.addRow(headers.map(h => row[h] ?? ''));
          }
        }
      };

      addJsonSheet('Invoices', yearInvoices.map(r => ({
        'Invoice Number': r.invoiceNumber,
        'Customer': r.customerName,
        'Date': fmtDate(r.invoiceDate),
        'Status': r.status,
        'Subtotal (AED)': fmtNum(r.amount),
        'VAT (AED)': fmtNum(r.vatAmount),
        'Total (AED)': fmtNum(r.amount),
        'Reference': r.reference || '',
        'Notes': r.notes || '',
      })), 'No invoices in this period');

      addJsonSheet('Quotations', yearQuotations.map(r => ({
        'Quote Number': r.quoteNumber,
        'Customer ID': r.customerId,
        'Date': fmtDate(r.quoteDate),
        'Status': r.status,
        'Subtotal (AED)': fmtNum(r.totalAmount),
        'VAT (AED)': fmtNum(r.vatAmount),
        'Total (AED)': fmtNum(r.grandTotal),
        'Reference': r.reference || '',
        'Notes': r.notes || '',
      })), 'No quotations in this period');

      addJsonSheet('Purchase Orders', yearPOs.map(r => ({
        'PO Number': r.poNumber,
        'Date': fmtDate(r.orderDate),
        'Status': r.status,
        'Total': fmtNum(r.totalAmount),
        'VAT': fmtNum(r.vatAmount),
        'Grand Total': fmtNum(r.grandTotal),
        'Notes': r.notes || '',
      })), 'No purchase orders in this period');

      addJsonSheet('Delivery Orders', yearDOs.map(r => ({
        'DO Number': r.orderNumber,
        'Customer': r.customerName,
        'Date': fmtDate(r.orderDate),
        'Status': r.status,
        'Subtotal (AED)': fmtNum(r.subtotal),
        'VAT (AED)': fmtNum(r.taxAmount),
        'Total (AED)': fmtNum(r.totalAmount),
        'Reference': r.reference || '',
        'Notes': r.notes || '',
      })), 'No delivery orders in this period');

      const xlsxBuffer = await wb.xlsx.writeBuffer();
      const filename = `FLOW_Year_${book.year}_Export.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(xlsxBuffer));
    } catch (error) {
      console.error('Error exporting financial year:', error);
      res.status(500).json({ error: 'Failed to export financial year' });
    }
  });
}
