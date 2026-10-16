import {
  OFFLINE_OUTBOX_TABLE,
  openMobileOfflineDatabase,
} from './expo-sqlite-database';

import {
  createMobileOutboxStore,
  type MobileOutboxRow,
  type MobileOutboxStorePort,
} from './mobile-command-outbox';

/**
 * The Expo-backed outbox port. The shared database module is the only expo-sqlite importer; this
 * adapter only translates the bounded store's rows into one table.
 */
const port: MobileOutboxStorePort = {
  async readAll(): Promise<MobileOutboxRow[]> {
    const rows = await (
      await openMobileOfflineDatabase()
    ).getAllAsync<{ enqueued_at: string; outbox_key: string; payload: string }>(
      `SELECT outbox_key, payload, enqueued_at FROM ${OFFLINE_OUTBOX_TABLE}`,
    );
    return rows.map((row) => ({
      enqueuedAt: row.enqueued_at,
      key: row.outbox_key,
      payload: row.payload,
    }));
  },
  async upsert(row) {
    await (
      await openMobileOfflineDatabase()
    ).runAsync(
      `INSERT OR REPLACE INTO ${OFFLINE_OUTBOX_TABLE} (outbox_key, payload, enqueued_at) VALUES (?, ?, ?)`,
      row.key,
      row.payload,
      row.enqueuedAt,
    );
  },
  async remove(keys) {
    const opened = await openMobileOfflineDatabase();
    for (const key of keys) {
      await opened.runAsync(
        `DELETE FROM ${OFFLINE_OUTBOX_TABLE} WHERE outbox_key = ?`,
        key,
      );
    }
  },
  async removeAll() {
    await (
      await openMobileOfflineDatabase()
    ).runAsync(`DELETE FROM ${OFFLINE_OUTBOX_TABLE}`);
  },
};

export const mobileCommandOutboxStore = createMobileOutboxStore(port);
