import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mobile offline surfaces contract', () => {
  const root = resolve(__dirname, '..');
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
  const store = read('apps/user-mobile/src/offline/mobile-snapshot-cache.ts');
  const surfaces = read('apps/user-mobile/src/offline/mobile-offline-surfaces.ts');
  const shell = read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx');
  const app = read('apps/user-mobile/App.tsx');

  it('namespaces surface snapshots by server origin and tenant', () => {
    expect(store).toContain(
      '`surface|${apiOrigin}|${tenantId}|${surface}`',
    );
    expect(surfaces).toContain('surfaceSnapshotKey');
  });

  it('bounds both cached payloads and re-checks them on read', () => {
    expect(surfaces).toContain('CACHED_MAX_DEVICES = 500');
    expect(surfaces).toContain('CACHED_MAX_ALERT_ITEMS = 200');
    expect(surfaces).toContain('isCachedDeviceList');
    expect(surfaces).toContain('isCachedAlertsPayload');
  });

  it('serves cached directory surfaces only for connectivity outages', () => {
    expect(shell).toContain('isMobileOfflineError(cause)');
    expect(shell).toContain('await offline.readDevices(tenantId)');
    expect(shell).toContain('await offline.readAlerts(tenantId)');
    const reads = shell.match(/isMobileOfflineError\(cause\)/g) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(2);
  });

  it('remembers validated payloads and marks cached renders', () => {
    expect(shell).toContain('offline.rememberDevices(tenantId, rows)');
    expect(shell).toContain('offline.rememberAlerts(tenantId, payload)');
    expect(shell).toContain('setInventoryCachedAt(cached.cachedAt)');
    expect(shell).toContain('setAlertsCachedAt(cached.cachedAt)');
    expect(shell).toContain('CachedSurfaceBanner');
  });

  it('owns both bridges in the app and hands the shell a stable gateway', () => {
    expect(app).toContain('connectMobileOfflineDevices');
    expect(app).toContain('connectMobileOfflineAlerts');
    expect(app).toContain('offline={offlineGateway}');
    expect(app).toContain('connectivityProvenRef');
    expect(shell).toContain('offline.onConnectivityProven()');
  });

  it('drains the offline queue when connectivity is proven by a load or a send', () => {
    expect(app).toContain('offlineOutbox.flush(authenticatedTenantId)');
    expect(app).toContain('connectivityProvenRef.current()');
  });

  it('adds no web or insecure storage', () => {
    expect(surfaces).not.toMatch(/AsyncStorage|localStorage|sessionStorage/);
  });
});
