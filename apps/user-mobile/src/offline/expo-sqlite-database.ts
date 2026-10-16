import * as SQLite from 'expo-sqlite';

/**
 * The single expo-sqlite owner of the mobile offline layer.
 *
 * The snapshot cache and the command outbox are plain node stores behind ports; this module is the
 * only place that knows a native database exists, so every other offline file stays testable without
 * Expo and the native import cannot spread one adapter at a time.
 */
export const OFFLINE_CACHE_DATABASE = 'iot-platform.offline-snapshots.v1.db';
export const OFFLINE_SNAPSHOT_TABLE = 'mobile_snapshots';
export const OFFLINE_OUTBOX_TABLE = 'mobile_outbox';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function openMobileOfflineDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync(OFFLINE_CACHE_DATABASE).then(
    async (opened) => {
      await opened.execAsync(
        `CREATE TABLE IF NOT EXISTS ${OFFLINE_SNAPSHOT_TABLE} (` +
          'cache_key TEXT PRIMARY KEY NOT NULL, ' +
          'payload TEXT NOT NULL, ' +
          'cached_at TEXT NOT NULL);' +
          `CREATE TABLE IF NOT EXISTS ${OFFLINE_OUTBOX_TABLE} (` +
          'outbox_key TEXT PRIMARY KEY NOT NULL, ' +
          'payload TEXT NOT NULL, ' +
          'enqueued_at TEXT NOT NULL);',
      );
      return opened;
    },
  );
  return databasePromise;
}
