#!/usr/bin/env node

import { Client } from '@replit/object-storage';

// Initialize object storage client
const objectStorageClient = new Client({
  bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
});

async function writeManifest() {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = now.toISOString().split('T')[1].substring(0, 8).replace(/:/g, '');
    const filename = `manifest-${dateStr}-${timeStr}.json`;
    const storageKey = `backups/objects/${filename}`;

    console.log(`Starting object manifest backup: ${filename}`);

    // Get all objects with pagination support
    let allObjects = [];
    let continuationToken = null;
    let totalSize = 0;

    do {
      const listOptions = continuationToken ? { continuationToken } : {};
      const listResult = await objectStorageClient.list(listOptions);
      
      if (!listResult.ok) {
        throw new Error(`Failed to list objects: ${listResult.error}`);
      }

      // Add objects from this page
      allObjects = allObjects.concat(listResult.value.objects || []);
      continuationToken = listResult.value.nextContinuationToken;

      console.log(`Retrieved ${listResult.value.objects?.length || 0} objects (page ${Math.ceil(allObjects.length / 1000)})`);

    } while (continuationToken);

    // Calculate totals
    for (const obj of allObjects) {
      totalSize += obj.size || 0;
    }

    // Create manifest with computed totals
    const manifest = {
      generatedAt: new Date().toISOString(),
      totalObjects: allObjects.length,
      totalSize,
      totals: {
        byPrefix: computePrefixTotals(allObjects),
        byExtension: computeExtensionTotals(allObjects),
        byMonth: computeMonthlyTotals(allObjects)
      },
      objects: allObjects.map(obj => ({
        name: obj.name,
        size: obj.size || 0,
        timeCreated: obj.timeCreated,
        etag: obj.etag,
        contentType: obj.contentType
      }))
    };

    console.log(`Found ${manifest.totalObjects} objects, total size: ${manifest.totalSize} bytes`);
    console.log('Breakdown by prefix:', manifest.totals.byPrefix);

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
      totals: manifest.totals,
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

// Compute totals by prefix (e.g., scans/, backups/, etc.)
function computePrefixTotals(objects) {
  const prefixTotals = {};
  
  for (const obj of objects) {
    const prefix = obj.name.split('/')[0] || 'root';
    if (!prefixTotals[prefix]) {
      prefixTotals[prefix] = { count: 0, size: 0 };
    }
    prefixTotals[prefix].count++;
    prefixTotals[prefix].size += obj.size || 0;
  }
  
  return prefixTotals;
}

// Compute totals by file extension
function computeExtensionTotals(objects) {
  const extTotals = {};
  
  for (const obj of objects) {
    const parts = obj.name.split('.');
    const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'no-extension';
    if (!extTotals[ext]) {
      extTotals[ext] = { count: 0, size: 0 };
    }
    extTotals[ext].count++;
    extTotals[ext].size += obj.size || 0;
  }
  
  return extTotals;
}

// Compute totals by creation month
function computeMonthlyTotals(objects) {
  const monthlyTotals = {};
  
  for (const obj of objects) {
    if (!obj.timeCreated) continue;
    
    const month = obj.timeCreated.substring(0, 7); // YYYY-MM
    if (!monthlyTotals[month]) {
      monthlyTotals[month] = { count: 0, size: 0 };
    }
    monthlyTotals[month].count++;
    monthlyTotals[month].size += obj.size || 0;
  }
  
  return monthlyTotals;
}

// Run backup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  writeManifest()
    .then(result => {
      console.log('Manifest backup result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Manifest backup script error:', error);
      process.exit(1);
    });
}

export { writeManifest };