import type { Express } from "express";
import { storageObjects } from "@shared/schema";
import { db, pool } from "../../db";
import { eq, sum, inArray } from "drizzle-orm";
import { execSync } from 'child_process';
import crypto from 'crypto';
import {
  requireAuth,
  requireRole,
  writeAuditLog,
  objectStorageClient,
  type AuthenticatedRequest,
} from "../../middleware";
import { logger } from "../../logger";

export function registerStorageDownloadRoutes(app: Express) {
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
      logger.error('Error generating download URL:', error);
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
        logger.error('Error streaming file from storage:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to download file' });
      });
      stream.pipe(res);
    } catch (error) {
      logger.error('Error downloading file:', error);
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
      logger.error('Error listing objects:', error);
      res.status(500).json({ error: 'Failed to list objects' });
    }
  });

  app.get('/api/db/size', requireAuth(['Admin']), async (req, res) => {
    try {
      const result = await pool.query(`SELECT pg_database_size(current_database()) as bytes`);
      const bytes = parseInt(result.rows[0].bytes);
      res.json({ bytes, pretty: `${(bytes / 1024 / 1024).toFixed(1)} MB` });
    } catch (error) {
      logger.error('Error getting database size:', error);
      res.status(500).json({ error: 'Failed to get database size' });
    }
  });

  app.get('/api/storage/total-size', requireAuth(['Admin']), async (req, res) => {
    try {
      const [result] = await db.select({ total: sum(storageObjects.sizeBytes) }).from(storageObjects);
      const totalSize = Number(result?.total ?? 0);
      res.json({ bytes: totalSize });
    } catch (error) {
      logger.error('Error calculating total size:', error);
      res.status(500).json({ error: 'Failed to calculate total size' });
    }
  });

  app.get('/api/system/app-size', requireAuth(['Admin']), async (req, res) => {
    try {
      const output = execSync('du -sb /home/runner/workspace 2>/dev/null').toString();
      const bytes = parseInt(output.split('\t')[0]);
      res.json({ bytes });
    } catch (error) {
      logger.error('Error getting app size:', error);
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
      logger.error('Error getting object info:', error);
      res.status(500).json({ error: 'Failed to get object information' });
    }
  });

  app.delete('/api/storage/object', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const { key } = req.query;
      if (!key) return res.status(400).json({ error: 'Key parameter is required' });

      const result = await objectStorageClient.delete(key as string);
      if (!result.ok) throw new Error('Failed to delete object');

      await db.delete(storageObjects).where(eq(storageObjects.key, key as string));

      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(key),
        targetType: 'storage_object',
        action: 'storage_object.deleted',
        details: `Storage object deleted: ${key}`,
      });

      res.json({ success: true, message: 'Object deleted successfully' });
    } catch (error) {
      logger.error('Error deleting object:', error);
      res.status(500).json({ error: 'Failed to delete object' });
    }
  });
}
