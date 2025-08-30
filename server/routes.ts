import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { Client } from '@replit/object-storage';
import pkg from 'pg';
import crypto from 'crypto';
import multer from 'multer';
const { Pool } = pkg;

// Initialize clients with the bucket ID from environment
const objectStorageClient = new Client({
  bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
});
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// In-memory store for signed URL tokens (in production, use Redis or similar)
const signedTokens = new Map<string, { key: string; expires: number; type: 'upload' | 'download' }>();

// Cleanup expired tokens every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of signedTokens.entries()) {
    if (data.expires < now) {
      signedTokens.delete(token);
    }
  }
}, 60 * 60 * 1000);

// Configure multer for handling file uploads
const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // POST /api/storage/sign-upload
  // Generate a signed token for uploading files (since Replit doesn't support native signed URLs)
  app.post('/api/storage/sign-upload', async (req, res) => {
    try {
      const { key, contentType, checksum } = req.body;
      
      if (!key) {
        return res.status(400).json({ error: 'Key is required' });
      }

      // Generate a secure token
      const token = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + (10 * 60 * 1000); // 10 minutes

      // Store token with metadata
      signedTokens.set(token, {
        key: key,
        expires: expires,
        type: 'upload'
      });

      // Return upload URL that points to our proxy endpoint
      const uploadUrl = `/api/storage/upload/${token}`;

      res.json({
        url: uploadUrl,
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

  // PUT /api/storage/upload/:token
  // Handle uploads via signed token
  app.put('/api/storage/upload/:token', upload.single('file'), async (req, res) => {
    try {
      const { token } = req.params;
      const tokenData = signedTokens.get(token);

      if (!tokenData || tokenData.expires < Date.now() || tokenData.type !== 'upload') {
        return res.status(401).json({ error: 'Invalid or expired upload token' });
      }

      // Get file data from request body (for PUT with raw data) or from multer
      let fileData: Buffer;
      if (req.file) {
        fileData = req.file.buffer;
      } else {
        // Handle raw PUT data
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        await new Promise((resolve) => req.on('end', resolve));
        fileData = Buffer.concat(chunks);
      }

      // Upload to Replit Object Storage
      const result = await objectStorageClient.uploadFromBytes(tokenData.key, fileData);

      // Clean up token
      signedTokens.delete(token);

      res.json({ success: true, key: tokenData.key });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  // GET /api/storage/signed-get
  // Generate a signed token for downloading files
  app.get('/api/storage/signed-get', async (req, res) => {
    try {
      const { key } = req.query;
      
      if (!key) {
        return res.status(400).json({ error: 'Key parameter is required' });
      }

      // Verify the object exists
      const exists = await objectStorageClient.exists(key as string);
      if (!exists.ok || !exists.value) {
        return res.status(404).json({ error: 'Object not found' });
      }

      // Generate a secure token
      const token = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + (60 * 60 * 1000); // 1 hour

      // Store token with metadata
      signedTokens.set(token, {
        key: key as string,
        expires: expires,
        type: 'download'
      });

      const downloadUrl = `/api/storage/download/${token}`;
      res.json({ url: downloadUrl });
    } catch (error) {
      console.error('Error generating download URL:', error);
      res.status(500).json({ error: 'Failed to generate download URL' });
    }
  });

  // GET /api/storage/download/:token
  // Handle downloads via signed token
  app.get('/api/storage/download/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const tokenData = signedTokens.get(token);

      if (!tokenData || tokenData.expires < Date.now() || tokenData.type !== 'download') {
        return res.status(401).json({ error: 'Invalid or expired download token' });
      }

      // Stream file from Replit Object Storage
      const stream = await objectStorageClient.downloadAsStream(tokenData.key);
      if (!stream.ok) {
        return res.status(404).json({ error: 'Object not found' });
      }

      // Set appropriate headers
      res.set({
        'Content-Disposition': `attachment; filename="${tokenData.key}"`,
        'Content-Type': 'application/octet-stream'
      });

      // Pipe the stream to response
      stream.value.pipe(res);
    } catch (error) {
      console.error('Error downloading file:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });

  // GET /api/storage/list-prefix
  // List objects with a given prefix
  app.get('/api/storage/list-prefix', async (req, res) => {
    try {
      const { prefix = '' } = req.query;
      
      const result = await objectStorageClient.list({ prefix: prefix as string });
      
      if (!result.ok) {
        throw new Error('Failed to list objects');
      }

      // Transform to match expected format
      const formattedObjects = result.value.map((obj: any) => ({
        key: obj.name,
        size: obj.size || 0,
        lastModified: obj.timeCreated,
        etag: obj.etag
      }));

      res.json({ objects: formattedObjects });
    } catch (error) {
      console.error('Error listing objects:', error);
      res.status(500).json({ error: 'Failed to list objects' });
    }
  });

  // GET /api/storage/total-size
  // Get total size of all objects in the bucket
  app.get('/api/storage/total-size', async (req, res) => {
    try {
      const result = await objectStorageClient.list();
      
      if (!result.ok) {
        throw new Error('Failed to list objects');
      }

      // Sum up sizes
      const totalSize = result.value.reduce((sum: number, obj: any) => sum + (obj.size || 0), 0);

      res.json({ bytes: totalSize });
    } catch (error) {
      console.error('Error calculating total size:', error);
      res.status(500).json({ error: 'Failed to calculate total size' });
    }
  });

  // GET /api/db/size
  // Get current database size
  app.get('/api/db/size', async (req, res) => {
    try {
      const query = `
        SELECT 
          pg_database_size(current_database()) as size_bytes,
          pg_size_pretty(pg_database_size(current_database())) as size_pretty
      `;
      
      const result = await pool.query(query);
      const { size_bytes, size_pretty } = result.rows[0];

      res.json({ 
        bytes: parseInt(size_bytes),
        pretty: size_pretty
      });
    } catch (error) {
      console.error('Error getting database size:', error);
      res.status(500).json({ error: 'Failed to get database size' });
    }
  });

  // Additional utility endpoints

  // GET /api/storage/object-info
  // Get detailed information about a specific object
  app.get('/api/storage/object-info', async (req, res) => {
    try {
      const { key } = req.query;
      
      if (!key) {
        return res.status(400).json({ error: 'Key parameter is required' });
      }

      const exists = await objectStorageClient.exists(key as string);
      if (!exists.ok || !exists.value) {
        return res.status(404).json({ error: 'Object not found' });
      }

      // Since Replit client doesn't have a stat method, we'll return basic info
      res.json({
        key: key,
        exists: true,
        message: 'Object exists - detailed metadata not available with current client'
      });
    } catch (error) {
      console.error('Error getting object info:', error);
      res.status(500).json({ error: 'Failed to get object information' });
    }
  });

  // DELETE /api/storage/object
  // Delete an object
  app.delete('/api/storage/object', async (req, res) => {
    try {
      const { key } = req.query;
      
      if (!key) {
        return res.status(400).json({ error: 'Key parameter is required' });
      }

      const result = await objectStorageClient.delete(key as string);
      
      if (!result.ok) {
        throw new Error('Failed to delete object');
      }
      
      res.json({ success: true, message: 'Object deleted successfully' });
    } catch (error) {
      console.error('Error deleting object:', error);
      res.status(500).json({ error: 'Failed to delete object' });
    }
  });

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  const httpServer = createServer(app);

  return httpServer;
}
