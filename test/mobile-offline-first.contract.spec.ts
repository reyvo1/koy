import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mobile offline-first contract', () => {
  const root = resolve(__dirname, '..');
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
  const mobilePackage = JSON.parse(
    read('apps/user-mobile/package.json'),
  ) as {
    dependencies?: Record<string, string>;
  };
  const store = read('apps/user-mobile/src/offline/mobile-snapshot-cache.ts');
  const sqlitePort = read(
    'apps/user-mobile/src/offline/expo-sqlite-snapshot-cache.ts',
  );
  const bridge = read('apps/user-mobile/src/offline/mobile-offline-dashboard.ts');
  const app = read('apps/user-mobile/App.tsx');
  const screen = read('apps/user-mobile/src/ui/mobile-dashboard-screen.tsx');
  const messages = read('apps/user-mobile/src/localization/messages.ts');
  const controller = read('apps/user-mobile/src/dashboard/mobile-dashboard-controller.ts');

  it('pins the approved offline storage dependency', () => {
    expect(mobilePackage.dependencies?.['expo-sqlite']).toBe('~57.0.4');
  });

  it('keeps the sqlite native import in exactly one module', () => {
    const database = read('apps/user-mobile/src/offline/expo-sqlite-database.ts');
    expect(database).toContain("from 'expo-sqlite'");
    expect(sqlitePort).toContain("from './expo-sqlite-database'");
    expect(sqlitePort).not.toContain("from 'expo-sqlite'");
    expect(store).not.toContain('expo-sqlite');
    expect(bridge).not.toContain('expo-sqlite');
  });

  it('bounds the cache by entry count and payload size', () => {
    expect(store).toContain('MAX_CACHED_ENTRIES = 24');
    expect(store).toContain('MAX_CACHED_PAYLOAD_BYTES = 262_144');
    expect(store).toContain('utf8ByteLength');
  });

  it('namespaces every key by server origin, tenant, and dashboard', () => {
    expect(store).toContain('|${apiOrigin}|${tenantId}|');
  });

  it('serves cached data only for connectivity outages', () => {
    expect(bridge).toContain(
      "state.kind === 'unavailable' && state.notice.tone === 'offline'",
    );
    expect(app).toContain('shouldServeCachedDashboard');
  });

  it('wires fallback, refresh, and logout clearing', () => {
    expect(app).toContain('connectMobileOfflineDashboard');
    expect(app).toContain('offlineDashboard.read(');
    expect(app).toContain('offlineDashboard.remember(');
    expect(app).toContain('offlineDashboard.forget()');
    expect(app).toContain('mobileSessionClient.origin');
  });

  it('marks cached renders and localizes the banner', () => {
    expect(controller).toContain('cachedAt?: string');
    expect(screen).toContain('state.cachedAt');
    expect(screen).toContain('offlineCachedPrefix');
    expect(messages).toContain('offlineCachedTitle');
    expect(messages).toContain('Mode offline');
    expect(messages).toContain('Offline mode');
  });

  it('adds no web or insecure storage', () => {
    for (const source of [store, sqlitePort, bridge, app]) {
      expect(source).not.toMatch(/AsyncStorage|localStorage|sessionStorage/);
    }
  });
});
