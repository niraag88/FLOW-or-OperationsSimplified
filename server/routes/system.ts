import type { Express } from "express";
import { auditLog, recycleBin, storageObjects, invoices, deliveryOrders, quotations, purchaseOrders, invoiceLineItems, deliveryOrderItems, quotationItems, purchaseOrderItems, products, brands, suppliers, customers, financialYears, backupRuns, restoreRuns, users } from "@shared/schema";
import { db, pool } from "../db";
import { executeFactoryReset } from "../factoryReset";
import { eq, desc, sum, inArray } from "drizzle-orm";
import { Readable } from 'stream';
import { execSync } from 'child_process';
import { createWriteStream, createReadStream, unlink } from 'fs';
import { tmpdir } from 'os';
import ExcelJS from 'exceljs';
import { requireAuth, requireRole, writeAuditLog, objectStorageClient, validateUploadInput, validatePdfMagicBytes, validateImageMagicBytes, upload, type AuthenticatedRequest } from "../middleware";
import crypto from 'crypto';

export function registerSystemRoutes(app: Express) {
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

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
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        await new Promise((resolve) => req.on('end', resolve));
        fileData = Buffer.concat(chunks);
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
        console.warn('Could not record storage size for', tokenData.key, '— size reporting may be inaccurate:', trackErr);
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

      const isSmallUpload = storageKey.startsWith('purchase-orders/') || storageKey.startsWith('goods-receipts/');
      const maxSizeBytes = isSmallUpload ? 2 * 1024 * 1024 : 25 * 1024 * 1024;
      if (fileSize > maxSizeBytes) {
        return res.status(400).json({ error: `File size exceeds ${isSmallUpload ? '2MB' : '25MB'} limit` });
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
        console.warn('Could not record storage size for', storageKey, '— size reporting may be inaccurate:', trackErr);
      }

      res.json({ success: true, key: storageKey });
    } catch (error) {
      console.error('Error uploading scan:', error);
      res.status(500).json({ error: 'Failed to upload scan' });
    }
  });

  app.get('/api/storage/signed-get', requireAuth(), async (req, res) => {
    try {
      const { key } = req.query;
      if (!key) return res.status(400).json({ error: 'Key parameter is required' });

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

  app.post('/api/audit-logs', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { entity_type, entity_id, action, changes, metadata } = req.body;

      if (!entity_type || !action) {
        return res.status(400).json({ error: 'entity_type and action are required' });
      }

      const details = changes && Object.keys(changes).length > 0
        ? JSON.stringify(changes)
        : (metadata && Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined);

      const [entry] = await db.insert(auditLog).values({
        actor: req.user!.id,
        actorName: req.user?.username || req.user!.id,
        targetId: entity_id ? String(entity_id) : 'unknown',
        targetType: entity_type,
        action: String(action).toUpperCase(),
        details: details ?? null,
      }).returning();

      res.status(201).json(entry);
    } catch (error) {
      console.error('Error writing audit log:', error);
      res.status(500).json({ error: 'Failed to write audit log' });
    }
  });

  app.get('/api/recycle-bin', requireAuth(), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/recycle-bin', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { document_type, document_id, document_number, document_data, reason, original_status, can_restore } = req.body;
      if (!document_type || !document_id) {
        return res.status(400).json({ error: 'document_type and document_id are required' });
      }
      const [item] = await db.insert(recycleBin).values({
        documentType: String(document_type),
        documentId: String(document_id),
        documentNumber: document_number || String(document_id),
        documentData: typeof document_data === 'string' ? document_data : JSON.stringify(document_data || {}),
        deletedBy: req.user?.username || 'unknown',
        deletedDate: new Date(),
        reason: reason || 'Deleted from UI',
        originalStatus: original_status || null,
        canRestore: can_restore !== undefined ? Boolean(can_restore) : true,
      }).returning();
      res.json({ success: true, id: item.id });
    } catch (error) {
      console.error('Error adding to recycle bin:', error);
      res.status(500).json({ error: 'Failed to add to recycle bin' });
    }
  });

  app.delete('/api/recycle-bin/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
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
    const startedAt = new Date();
    let dbResult: any = null;
    let manifestResult: any = null;

    const recordRun = async (overrideError?: string) => {
      const success = !!(dbResult?.success && manifestResult?.success);
      try {
        await db.insert(backupRuns).values({
          ranAt: startedAt,
          finishedAt: new Date(),
          triggeredBy: req.user!.id,
          success,
          dbSuccess: dbResult?.success ?? false,
          dbFilename: dbResult?.filename || null,
          dbStorageKey: dbResult?.storageKey || null,
          dbFileSize: dbResult?.fileSize || null,
          manifestSuccess: manifestResult?.success ?? false,
          manifestFilename: manifestResult?.filename || null,
          manifestStorageKey: manifestResult?.storageKey || null,
          manifestTotalObjects: manifestResult?.totalObjects || null,
          manifestTotalSizeBytes: manifestResult?.totalSize || null,
          errorMessage: overrideError || (!success ? [dbResult?.error, manifestResult?.error].filter(Boolean).join('; ') : null),
        });
      } catch (dbErr) {
        console.error('Failed to record backup run:', dbErr);
      }
    };

    try {
      // @ts-ignore
      const { uploadBackup } = await import('../../scripts/uploadBackup.js');
      // @ts-ignore
      const { writeManifest } = await import('../../scripts/writeManifest.js');

      [dbResult, manifestResult] = await Promise.all([uploadBackup(), writeManifest()]);
      const success = dbResult.success && manifestResult.success;

      await recordRun();
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: 'backup', targetType: 'backup_run', action: 'CREATE', details: `Manual backup ${success ? 'succeeded' : 'failed'}` });

      const response = {
        success,
        timestamp: new Date().toISOString(),
        dbBackup: { success: dbResult.success, filename: dbResult.filename, storageKey: dbResult.storageKey, fileSize: dbResult.fileSize, error: dbResult.error },
        manifestBackup: { success: manifestResult.success, filename: manifestResult.filename, storageKey: manifestResult.storageKey, totalObjects: manifestResult.totalObjects, totalSize: manifestResult.totalSize, error: manifestResult.error }
      };

      if (success) {
        res.status(200).json(response);
      } else {
        console.error('Backup failed:', { dbResult, manifestResult });
        res.status(500).json(response);
      }
    } catch (error) {
      console.error('Error running backups:', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      await recordRun(errMsg);
      res.status(500).json({ success: false, error: errMsg, timestamp: new Date().toISOString() });
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
   *   2. RUN the restore (drops + recreates public schema).
   *   3. AFTER the restore, update the pre-created row with the final result.
   *      Also best-effort write to public.audit_log (which is recreated from
   *      the backup; if the backup is very old and lacks audit_log, this fails
   *      silently — the ops record is already the definitive audit trail).
   */
  async function runRestore(opts: {
    sqlGzStream: import('stream').Readable;
    triggeredBy: string;
    sourceBackupRunId?: number;
    sourceFilename?: string;
    res: import('express').Response;
    actorName: string;
  }) {
    const { sqlGzStream, triggeredBy, sourceBackupRunId, sourceFilename, res, actorName } = opts;
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
      console.warn('Could not pre-create ops.restore_runs record:', preErr);
    }

    // Step 2: Run the restore.
    let result: { success: boolean; error?: string; durationMs: number };
    try {
      // @ts-ignore
      const { restoreBackup } = await import('../../scripts/restoreBackup.js');
      result = await restoreBackup(sqlGzStream);
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
        console.warn('Could not update ops.restore_runs record after restore:', updateErr);
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
        console.warn('Could not insert ops.restore_runs record after restore:', retryErr);
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

  /** POST /api/ops/backup-runs/:id/restore — restore from a stored cloud backup */
  app.post('/api/ops/backup-runs/:id/restore', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
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
      sqlGzStream: stream,
      triggeredBy: req.user!.id,
      actorName: req.user?.username || req.user!.id,
      sourceBackupRunId: runId,
      sourceFilename: run.dbStorageKey.split('/').pop() || run.dbStorageKey,
      res,
    });
  });

  /**
   * POST /api/ops/restore-upload — restore from an uploaded .sql.gz file.
   *
   * Buffers the upload to a temp file on disk before calling runRestore().
   * This ensures the busboy fileSize limit check completes BEFORE any
   * destructive DROP SCHEMA action begins, eliminating the race condition
   * where a truncated oversized file could start a restore.
   *
   * Flow:
   *   1. bb.on('file'): pipe fileStream → temp file; track hitSizeLimit flag
   *   2. bb.on('finish'): await writePromise (disk flush confirmed), then
   *      check hitSizeLimit → 413, or call runRestore from createReadStream
   *   3. cleanupTemp() is called in all exit paths including bb.on('error')
   */
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

      try {
        await runRestore({
          sqlGzStream: createReadStream(tempPath!),
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
   * untouched.  Users table is preserved — only the Admin can call this.
   *
   * Deletion order respects FK constraints (children before parents).
   */
  app.post('/api/ops/factory-reset', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    const client = await pool.connect();
    try {
      await executeFactoryReset(client, {
        id: String(req.user!.id),
        name: req.user!.username,
      });
      res.json({ ok: true, message: 'Factory reset complete. All business data has been wiped.' });
    } catch (error: any) {
      console.error('Factory reset failed:', error);
      res.status(500).json({ error: 'Factory reset failed', details: error.message });
    } finally {
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
