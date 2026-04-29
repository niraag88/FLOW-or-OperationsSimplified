/**
 * Regression test for Task #349 (FS-2): tryDeleteBackupRowObjects() must
 * report `allGone: false` whenever the storage SDK signals failure —
 * including the silent `{ ok: false, error }` return shape, not just
 * thrown errors. Previously the prune loop only caught throws, so a
 * silent SDK failure would orphan the storage file while removing its
 * only UI pointer (the backup_runs catalogue row).
 *
 * Run with:  npx tsx --test tests/unit/pruneOldBackupsOrphan.test.ts
 *
 * No DB rows are inserted and no real storage SDK calls are made — the
 * one-shot test seam (setForceStorageDeleteFail in server/middleware.ts)
 * intercepts the delete call BEFORE it reaches the SDK and returns a
 * synthetic `{ ok: false, error }` exactly once.
 *
 * Note: importing server/runBackup.ts pulls in server/db.ts which
 * constructs a pg.Pool from DATABASE_URL at module load. The Pool is
 * not connected to until a query runs, so this test does not require
 * DATABASE_URL to be reachable, but it must be defined.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tryDeleteBackupRowObjects } from '../../server/runBackup';
import {
  setForceStorageDeleteFail,
  isForceStorageDeleteFailEnabled,
} from '../../server/middleware';

test('row is retained when the dbStorageKey delete returns {ok:false}', async () => {
  setForceStorageDeleteFail(true);
  try {
    const result = await tryDeleteBackupRowObjects({
      id: 999_001,
      dbStorageKey: 'orphan-test-fs2/db/synthetic.sql.gz',
      manifestStorageKey: null, // no second delete attempted
    });
    assert.equal(result.allGone, false, 'silent {ok:false} on dbStorageKey must keep the row');
  } finally {
    setForceStorageDeleteFail(false); // belt-and-braces; the seam auto-disarms on consumption
  }
});

test('row is retained when the manifestStorageKey delete returns {ok:false}', async () => {
  setForceStorageDeleteFail(true);
  try {
    const result = await tryDeleteBackupRowObjects({
      id: 999_002,
      dbStorageKey: null, // no first delete attempted
      manifestStorageKey: 'orphan-test-fs2/manifest/synthetic.json.gz',
    });
    assert.equal(result.allGone, false, 'silent {ok:false} on manifestStorageKey must keep the row');
  } finally {
    setForceStorageDeleteFail(false);
  }
});

test('row is safe to drop when both storage keys are NULL (no deletes attempted)', async () => {
  // No seam armed; with both keys NULL the helper attempts no SDK calls.
  const result = await tryDeleteBackupRowObjects({
    id: 999_003,
    dbStorageKey: null,
    manifestStorageKey: null,
  });
  assert.equal(result.allGone, true, 'NULL keys mean nothing to delete; row is prunable');
});

test('the test seam auto-disarms after one consumption (does not poison the next call)', async () => {
  setForceStorageDeleteFail(true);
  assert.equal(isForceStorageDeleteFailEnabled(), true, 'seam should be armed after enabling');
  // Consume the seam via a delete call.
  const first = await tryDeleteBackupRowObjects({
    id: 999_004,
    dbStorageKey: 'orphan-test-fs2/db/consume.sql.gz',
    manifestStorageKey: null,
  });
  assert.equal(first.allGone, false, 'first call sees the synthetic failure');
  assert.equal(
    isForceStorageDeleteFailEnabled(),
    false,
    'seam must auto-disarm after consumption so a parallel/follow-up call is not poisoned'
  );
});
