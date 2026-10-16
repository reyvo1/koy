import {
  MAX_CACHED_ENTRIES,
  MAX_CACHED_PAYLOAD_BYTES,
  createMobileSnapshotCache,
  dashboardSnapshotKey,
  type MobileCachedSnapshot,
  type MobileSnapshotCachePort,
} from './mobile-snapshot-cache';
import {
  connectMobileOfflineDashboard,
  isCachedDashboardExperience,
  shouldServeCachedDashboard,
} from './mobile-offline-dashboard';
import type { MobileDashboardState } from '../dashboard';

class FakeSnapshotPort implements MobileSnapshotCachePort {
  rows = new Map<string, MobileCachedSnapshot>();
  failOnRead = false;
  failOnWrite = false;

  async read(key: string): Promise<MobileCachedSnapshot | null> {
    if (this.failOnRead) throw new Error('read failed');
    return this.rows.get(key) ?? null;
  }

  async readIndex(): Promise<Array<{ cachedAt: string; key: string }>> {
    return [...this.rows.values()].map(({ cachedAt, key }) => ({ cachedAt, key }));
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) this.rows.delete(key);
  }

  async removeAll(): Promise<void> {
    this.rows.clear();
  }

  async upsert(snapshot: MobileCachedSnapshot): Promise<void> {
    if (this.failOnWrite) throw new Error('write failed');
    this.rows.set(snapshot.key, snapshot);
  }
}

const EXPERIENCE = {
  dashboards: [{ id: 'd1', name: 'Utama' }],
  selectedDashboardId: 'd1',
  dashboard: null,
  resolution: null,
  widgetData: {},
};

function unavailable(tone: 'offline' | 'error' | 'warning'): MobileDashboardState {
  return {
    kind: 'unavailable',
    notice: { tone, title: 't', message: 'm', requestId: null },
    selectedDashboardId: null,
  };
}

describe('offline snapshot cache', () => {
  it('namespaces keys by server origin, tenant, and dashboard', () => {
    const first = dashboardSnapshotKey('https://a.example', 'tenant-1', 'd1');
    const second = dashboardSnapshotKey('https://b.example', 'tenant-1', 'd1');
    const third = dashboardSnapshotKey('https://a.example', 'tenant-2', 'd1');
    expect(first).not.toBe(second);
    expect(first).not.toBe(third);
    expect(dashboardSnapshotKey('https://a.example', 'tenant-1', null)).toContain(
      '|default',
    );
  });

  it('round-trips a bounded payload with its timestamp', async () => {
    const port = new FakeSnapshotPort();
    const cache = createMobileSnapshotCache(port);
    const stored = await cache.write('k', EXPERIENCE, '2026-10-16T00:00:00.000Z');
    expect(stored).toBe(true);
    const snapshot = await cache.read('k');
    expect(snapshot?.cachedAt).toBe('2026-10-16T00:00:00.000Z');
    expect(snapshot?.payload).toEqual(EXPERIENCE);
  });

  it('refuses oversize payloads instead of truncating them', async () => {
    const port = new FakeSnapshotPort();
    const cache = createMobileSnapshotCache(port);
    const stored = await cache.write(
      'k',
      'x'.repeat(MAX_CACHED_PAYLOAD_BYTES + 1),
      '2026-10-16T00:00:00.000Z',
    );
    expect(stored).toBe(false);
    expect(port.rows.size).toBe(0);
    expect(await cache.read('k')).toBeNull();
  });

  it('fails closed on unreadable payloads and storage errors', async () => {
    const port = new FakeSnapshotPort();
    const cache = createMobileSnapshotCache(port);
    await port.upsert({ cachedAt: 'now', key: 'k', payload: '{not json' });
    expect(await cache.read('k')).toBeNull();

    port.failOnRead = true;
    expect(await cache.read('k')).toBeNull();

    port.failOnWrite = true;
    expect(await cache.write('k', EXPERIENCE, 'now')).toBe(false);
  });

  it('prunes the oldest entries beyond the bound', async () => {
    const port = new FakeSnapshotPort();
    const cache = createMobileSnapshotCache(port);
    for (let index = 0; index < MAX_CACHED_ENTRIES + 2; index += 1) {
      await cache.write(
        `k-${String(index).padStart(3, '0')}`,
        EXPERIENCE,
        `2026-10-16T00:00:${String(index).padStart(2, '0')}.000Z`,
      );
    }
    const index = await port.readIndex();
    expect(index).toHaveLength(MAX_CACHED_ENTRIES);
    expect(index.map((row) => row.key)).not.toContain('k-000');
    expect(index.map((row) => row.key)).not.toContain('k-001');
  });

  it('clears every entry', async () => {
    const port = new FakeSnapshotPort();
    const cache = createMobileSnapshotCache(port);
    await cache.write('k', EXPERIENCE, 'now');
    await cache.clear();
    expect(port.rows.size).toBe(0);
  });
});

describe('cached experience guard', () => {
  it('accepts the shape written after full validation', () => {
    expect(isCachedDashboardExperience(EXPERIENCE)).toBe(true);
    expect(
      isCachedDashboardExperience({ ...EXPERIENCE, selectedDashboardId: null }),
    ).toBe(true);
  });

  it('rejects anything unexpected', () => {
    expect(isCachedDashboardExperience(null)).toBe(false);
    expect(isCachedDashboardExperience([])).toBe(false);
    expect(isCachedDashboardExperience('cached')).toBe(false);
    expect(
      isCachedDashboardExperience({ ...EXPERIENCE, dashboards: 'none' }),
    ).toBe(false);
    expect(
      isCachedDashboardExperience({
        ...EXPERIENCE,
        dashboards: Array.from({ length: 51 }, (_, index) => ({ id: `d${index}` })),
      }),
    ).toBe(false);
    expect(
      isCachedDashboardExperience({ ...EXPERIENCE, selectedDashboardId: 7 }),
    ).toBe(false);
    expect(
      isCachedDashboardExperience({ ...EXPERIENCE, widgetData: [] }),
    ).toBe(false);
  });
});

describe('offline fallback policy', () => {
  it('serves the cache only for connectivity outages', () => {
    expect(shouldServeCachedDashboard(unavailable('offline'))).toBe(true);
    expect(shouldServeCachedDashboard(unavailable('error'))).toBe(false);
    expect(shouldServeCachedDashboard(unavailable('warning'))).toBe(false);
    expect(
      shouldServeCachedDashboard({
        kind: 'session-expired',
        notice: { tone: 'warning', title: 't', message: 'm', requestId: null },
      }),
    ).toBe(false);
    expect(shouldServeCachedDashboard({ kind: 'idle' })).toBe(false);
    expect(
      shouldServeCachedDashboard({
        kind: 'ready',
        experience: EXPERIENCE as never,
      }),
    ).toBe(false);
  });
});

describe('offline dashboard bridge', () => {
  function bridgeOn(port: FakeSnapshotPort) {
    return connectMobileOfflineDashboard({
      apiOrigin: 'https://api.example',
      cache: createMobileSnapshotCache(port),
    });
  }

  it('remembers only settled network experiences', async () => {
    const port = new FakeSnapshotPort();
    const bridge = bridgeOn(port);
    await bridge.remember('tenant-1', { kind: 'loading', selectedDashboardId: null });
    await bridge.remember('tenant-1', unavailable('offline'));
    expect(port.rows.size).toBe(0);

    await bridge.remember('tenant-1', {
      kind: 'ready',
      experience: EXPERIENCE as never,
    });
    expect(port.rows.size).toBe(1);
    expect([...port.rows.keys()][0]).toContain('https://api.example|tenant-1|d1');
  });

  it('reads back only for the same origin and tenant', async () => {
    const port = new FakeSnapshotPort();
    const bridge = bridgeOn(port);
    await bridge.remember('tenant-1', {
      kind: 'ready',
      experience: EXPERIENCE as never,
    });

    const cached = await bridge.read('tenant-1', 'd1');
    expect(cached?.experience).toEqual(EXPERIENCE);
    expect(await bridge.read('tenant-2', 'd1')).toBeNull();

    const otherOrigin = connectMobileOfflineDashboard({
      apiOrigin: 'https://other.example',
      cache: createMobileSnapshotCache(port),
    });
    expect(await otherOrigin.read('tenant-1', 'd1')).toBeNull();
  });

  it('forgets everything on demand', async () => {
    const port = new FakeSnapshotPort();
    const bridge = bridgeOn(port);
    await bridge.remember('tenant-1', {
      kind: 'ready',
      experience: EXPERIENCE as never,
    });
    await bridge.forget();
    expect(port.rows.size).toBe(0);
  });
});
