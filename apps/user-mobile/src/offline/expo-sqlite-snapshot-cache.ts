import {
  OFFLINE_SNAPSHOT_TABLE,
  openMobileOfflineDatabase,
} from './expo-sqlite-database';

import {
  createMobileSnapshotCache,
  type MobileSnapshotCachePort,
} from './mobile-snapshot-cache';

/**
 * The Expo-backed snapshot cache port.
 *
 * The shared database module is the only expo-sqlite importer; this adapter only translates the
 * bounded store's reads and writes into one table, mirroring the secure-store pattern.
 */
const port: MobileSnapshotCachePort = {
  async read(key) {
    const row = await (
      await openMobileOfflineDatabase()
    ).getFirstAsync<{ cached_at: string; payload: string }>(
      `SELECT payload, cached_at FROM ${OFFLINE_SNAPSHOT_TABLE} WHERE cache_key = ?`,
      key,
    );
    return row ? { cachedAt: row.cached_at, key, payload: row.payload } : null;
  },
  async readIndex() {
    const rows = await (
      await openMobileOfflineDatabase()
    ).getAllAsync<{ cached_at: string; cache_key: string }>(
      `SELECT cache_key, cached_at FROM ${OFFLINE_SNAPSHOT_TABLE}`,
    );
    return rows.map((row) => ({ cachedAt: row.cached_at, key: row.cache_key }));
  },
  async remove(keys) {
    const opened = await openMobileOfflineDatabase();
    for (const key of keys) {
      await opened.runAsync(
        `DELETE FROM ${OFFLINE_SNAPSHOT_TABLE} WHERE cache_key = ?`,
        key,
      );
    }
  },
  async removeAll() {
    await (
      await openMobileOfflineDatabase()
    ).runAsync(`DELETE FROM ${OFFLINE_SNAPSHOT_TABLE}`);
  },
  async upsert(snapshot) {
    await (
      await openMobileOfflineDatabase()
    ).runAsync(
      `INSERT OR REPLACE INTO ${OFFLINE_SNAPSHOT_TABLE} (cache_key, payload, cached_at) VALUES (?, ?, ?)`,
      snapshot.key,
      snapshot.payload,
      snapshot.cachedAt,
    );
  },
};

export const mobileSnapshotCache = createMobileSnapshotCache(port);
