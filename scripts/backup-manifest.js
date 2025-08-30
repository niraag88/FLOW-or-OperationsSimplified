#!/usr/bin/env node

import { Client } from '@replit/object-storage';

// Initialize object storage client
const objectStorageClient = new Client({
  bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
});

async function backupManifest() {
  try {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const filename = `manifest-${date}.json`;
    const storageKey = `backups/objects/${filename}`;

    console.log(`Starting object manifest backup: ${filename}`);

    // Get all objects
    const listResult = await objectStorageClient.list();
    
    if (!listResult.ok) {
      throw new Error(`Failed to list objects: ${listResult.error}`);
    }

    // Create manifest
    const manifest = {
      generatedAt: new Date().toISOString(),
      totalObjects: listResult.value.length,
      totalSize: listResult.value.reduce((sum, obj) => sum + (obj.size || 0), 0),
      objects: listResult.value.map(obj => ({
        name: obj.name,
        size: obj.size || 0,
        timeCreated: obj.timeCreated,
        etag: obj.etag,
        contentType: obj.contentType
      }))
    };

    console.log(`Found ${manifest.totalObjects} objects, total size: ${manifest.totalSize} bytes`);

    // Upload manifest
    const manifestJson = JSON.stringify(manifest, null, 2);
    const uploadResult = await objectStorageClient.uploadFromText(storageKey, manifestJson);
    
    if (!uploadResult.ok) {
      throw new Error(`Failed to upload manifest: ${uploadResult.error}`);
    }

    console.log(`Manifest uploaded to: ${storageKey}`);
    console.log('Manifest backup completed successfully');

    return {
      success: true,
      filename,
      storageKey,
      totalObjects: manifest.totalObjects,
      totalSize: manifest.totalSize,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Manifest backup failed:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Run backup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  backupManifest()
    .then(result => {
      console.log('Manifest backup result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Manifest backup script error:', error);
      process.exit(1);
    });
}

export { backupManifest };