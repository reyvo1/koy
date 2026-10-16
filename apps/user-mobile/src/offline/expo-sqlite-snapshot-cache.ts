import * as SQLite from 'expo-sqlite';

import {
  createMobileSnapshotCache,
  type MobileSnapshotCachePort,
} from './mobile-snapshot-cache';

/**
 * The Expo-backed snapshot cache port.
 *
 * Exactly one module in this folder imports `expo-sqlite`, mirroring the secure-store pattern: the
 * bounded store logic stays plain node code, and the native module stays out of every component
 * that only wants to read a cached dashboard.
 */
export const OFFLINE_CACHE_DATABASE = 'iot-platform.offline-snapshots.v1.db';
export const OFFLINE_CACHE_TABLE = 'mobile_snapshots';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync(OFFLINE_CACHE_DATABASE).then(
    async (opened) => {
      await opened.execAsync(
        `CREATE TABLE IF NOT EXISTS ${OFFLINE_CACHE_TABLE} (` +
          'cache_key TEXT PRIMARY KEY NOT NULL, ' +
          'payload TEXT NOT NULL, ' +
          'cached_at TEXT NOT NULL);',
      );
      return opened;
    },
  );
  return databasePromise;
}

const port: MobileSnapshotCachePort = {
  async read(key) {
    const row = await (
      await database()
    ).getFirstAsync<{ cached_at: string; payload: string }>(
      `SELECT payload, cached_at FROM ${OFFLINE_CACHE_TABLE} WHERE cache_key = ?`,
      key,
    );
    return row ? { cachedAt: row.cached_at, key, payload: row.payload } : null;
  },
  async readIndex() {
    const rows = await (
      await database()
    ).getAllAsync<{ cached_at: string; cache_key: string }>(
      `SELECT cache_key, cached_at FROM ${OFFLINE_CACHE_TABLE}`,
    );
    return rows.map((row) => ({ cachedAt: row.cached_at, key: row.cache_key }));
  },
  async remove(keys) {
    const opened = await database();
    for (const key of keys) {
      await opened.runAsync(
        `DELETE FROM ${OFFLINE_CACHE_TABLE} WHERE cache_key = ?`,
        key,
      );
    }
  },
  async removeAll() {
    await (
      await database()
    ).runAsync(`DELETE FROM ${OFFLINE_CACHE_TABLE}`);
  },
  async upsert(snapshot) {
    await (
      await database()
    ).runAsync(
      `INSERT OR REPLACE INTO ${OFFLINE_CACHE_TABLE} (cache_key, payload, cached_at) VALUES (?, ?, ?)`,
      snapshot.key,
      snapshot.payload,
      snapshot.cachedAt,
    );
  },
};

export const mobileSnapshotCache = createMobileSnapshotCache(port);
