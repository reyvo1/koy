import type {
  MobileAlertsPayload,
  MobileDeviceSummary,
} from '../device-control/mobile-device-client';
import {
  ALERTS_OFFLINE_SURFACE,
  DEVICES_OFFLINE_SURFACE,
  connectMobileOfflineAlerts,
  connectMobileOfflineDevices,
  isCachedAlertsPayload,
  isCachedDeviceList,
} from './mobile-offline-surfaces';
import {
  createMobileSnapshotCache,
  dashboardSnapshotKey,
  surfaceSnapshotKey,
  type MobileCachedSnapshot,
  type MobileSnapshotCachePort,
} from './mobile-snapshot-cache';

const ORIGIN = 'https://api.example';
const TENANT = 'tenant-1';

class MemoryPort implements MobileSnapshotCachePort {
  rows = new Map<string, MobileCachedSnapshot>();
  failRead = false;

  async read(key: string): Promise<MobileCachedSnapshot | null> {
    if (this.failRead) throw new Error('read failed');
    return this.rows.get(key) ?? null;
  }

  async readIndex(): Promise<Array<{ cachedAt: string; key: string }>> {
    return [...this.rows.values()].map((row) => ({
      cachedAt: row.cachedAt,
      key: row.key,
    }));
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) this.rows.delete(key);
  }

  async removeAll(): Promise<void> {
    this.rows.clear();
  }

  async upsert(snapshot: MobileCachedSnapshot): Promise<void> {
    this.rows.set(snapshot.key, snapshot);
  }
}

function sampleDevice(index: number): MobileDeviceSummary {
  return {
    canControl: true,
    id: `device-${index}`,
    lastHeartbeatAt: '2026-10-16T10:00:00.000Z',
    name: `Device ${index}`,
    roomName: null,
    roomPath: null,
    status: 'ONLINE',
  };
}

function sampleAlerts(): MobileAlertsPayload {
  return {
    deviceScopeTruncated: false,
    items: [
      {
        capabilityKey: 'power',
        confidence: 0.9,
        createdAt: '2026-10-16T09:00:00.000Z',
        detectorVersion: 'v1',
        id: 'finding-1',
        kind: 'ANOMALY',
        severity: 'HIGH',
        summary: 'Power spike',
      },
    ],
    limit: 50,
    maxDeviceScope: 100,
    notificationDeliveryHistory: false,
    source: 'ANALYTICS_FINDINGS',
  };
}

describe('offline device directory cache', () => {
  it('remembers a validated list and reads it back under the surface key', async () => {
    const port = new MemoryPort();
    const cache = createMobileSnapshotCache(port);
    const bridge = connectMobileOfflineDevices({ apiOrigin: ORIGIN, cache });

    expect(await bridge.remember(TENANT, [sampleDevice(1), sampleDevice(2)])).toBe(true);

    const key = surfaceSnapshotKey(ORIGIN, TENANT, DEVICES_OFFLINE_SURFACE);
    expect(port.rows.has(key)).toBe(true);
    expect(key.startsWith('surface|')).toBe(true);
    expect(key).toContain(`|${ORIGIN}|${TENANT}|`);

    const cached = await bridge.read(TENANT);
    expect(cached?.devices.map((device) => device.id)).toEqual([
      'device-1',
      'device-2',
    ]);
    expect(cached?.cachedAt).toBeTruthy();
  });

  it('never serves another origin, another tenant, or a dashboard entry', async () => {
    const port = new MemoryPort();
    const cache = createMobileSnapshotCache(port);
    const bridge = connectMobileOfflineDevices({ apiOrigin: ORIGIN, cache });

    await bridge.remember(TENANT, [sampleDevice(1)]);
    await cache.write(
      dashboardSnapshotKey(ORIGIN, TENANT, null),
      sampleAlerts(),
      '2026-10-16T10:00:00.000Z',
    );

    expect(await bridge.read('tenant-2')).toBeNull();
    expect(
      await connectMobileOfflineDevices({ apiOrigin: 'https://other.example', cache }).read(TENANT),
    ).toBeNull();
  });

  it('rejects invalid and oversized device lists on remember and on read', async () => {
    const port = new MemoryPort();
    const cache = createMobileSnapshotCache(port);
    const bridge = connectMobileOfflineDevices({ apiOrigin: ORIGIN, cache });

    expect(await bridge.remember(TENANT, [{ id: 'missing-fields' } as never])).toBe(false);
    const oversized = Array.from({ length: 501 }, (_, index) => sampleDevice(index));
    expect(await bridge.remember(TENANT, oversized as never)).toBe(false);

    await cache.write(
      surfaceSnapshotKey(ORIGIN, TENANT, DEVICES_OFFLINE_SURFACE),
      { not: 'a list' },
      '2026-10-16T10:00:00.000Z',
    );
    expect(await bridge.read(TENANT)).toBeNull();
  });

  it('treats an unreadable port as no cache', async () => {
    const port = new MemoryPort();
    const cache = createMobileSnapshotCache(port);
    const bridge = connectMobileOfflineDevices({ apiOrigin: ORIGIN, cache });
    await bridge.remember(TENANT, [sampleDevice(1)]);

    port.failRead = true;
    expect(await bridge.read(TENANT)).toBeNull();
  });
});

describe('offline alerts cache', () => {
  it('remembers a validated payload and reads it back', async () => {
    const port = new MemoryPort();
    const cache = createMobileSnapshotCache(port);
    const bridge = connectMobileOfflineAlerts({ apiOrigin: ORIGIN, cache });

    expect(await bridge.remember(TENANT, sampleAlerts())).toBe(true);
    const cached = await bridge.read(TENANT);
    expect(cached?.alerts.items.map((item) => item.id)).toEqual(['finding-1']);
    expect(cached?.cachedAt).toBeTruthy();
  });

  it('rejects payloads whose shape does not match the alerts contract', async () => {
    const port = new MemoryPort();
    const cache = createMobileSnapshotCache(port);
    const bridge = connectMobileOfflineAlerts({ apiOrigin: ORIGIN, cache });

    expect(await bridge.remember(TENANT, { source: 'SOMETHING_ELSE' } as never)).toBe(false);

    await cache.write(
      surfaceSnapshotKey(ORIGIN, TENANT, ALERTS_OFFLINE_SURFACE),
      { ...sampleAlerts(), notificationDeliveryHistory: true },
      '2026-10-16T10:00:00.000Z',
    );
    expect(await bridge.read(TENANT)).toBeNull();

    const oversizedItems = {
      ...sampleAlerts(),
      items: Array.from({ length: 201 }, (_, index) => ({
        ...sampleAlerts().items[0],
        id: `finding-${index}`,
      })),
    };
    await cache.write(
      surfaceSnapshotKey(ORIGIN, TENANT, ALERTS_OFFLINE_SURFACE),
      oversizedItems,
      '2026-10-16T10:00:00.000Z',
    );
    expect(await bridge.read(TENANT)).toBeNull();
  });

  it('clears directory and alerts snapshots together with the shared cache clear', async () => {
    const port = new MemoryPort();
    const cache = createMobileSnapshotCache(port);
    const devices = connectMobileOfflineDevices({ apiOrigin: ORIGIN, cache });
    const alerts = connectMobileOfflineAlerts({ apiOrigin: ORIGIN, cache });

    await devices.remember(TENANT, [sampleDevice(1)]);
    await alerts.remember(TENANT, sampleAlerts());
    await cache.clear();

    expect(await devices.read(TENANT)).toBeNull();
    expect(await alerts.read(TENANT)).toBeNull();
    expect(port.rows.size).toBe(0);
  });
});

describe('cached payload guards', () => {
  it('accept the shapes the network loaders produce and reject the rest', () => {
    expect(isCachedDeviceList([sampleDevice(1)])).toBe(true);
    expect(isCachedDeviceList([])).toBe(true);
    expect(isCachedDeviceList({})).toBe(false);
    expect(isCachedDeviceList([{ ...sampleDevice(1), canControl: 'yes' }])).toBe(false);

    expect(isCachedAlertsPayload(sampleAlerts())).toBe(true);
    expect(isCachedAlertsPayload({ ...sampleAlerts(), items: 'nope' })).toBe(false);
    expect(isCachedAlertsPayload(null)).toBe(false);
  });
});
