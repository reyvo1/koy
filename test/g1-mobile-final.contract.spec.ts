import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.14 mobile app finalization (blueprint §5)', () => {
  const APP = 'apps/user-mobile/App.tsx';
  const SHELL = 'apps/user-mobile/src/ui/mobile-authenticated-shell.tsx';

  it('keeps one canonical Expo root and the five mandatory mobile tabs', () => {
    const app = read(APP);
    const shell = read(SHELL);
    expect(app).toContain('MobileAuthenticatedShell');
    for (const tab of ['home', 'devices', 'realtime', 'alerts', 'profile']) {
      expect(shell).toContain(`'${tab}'`);
    }
    expect(shell).toContain('NAV_ITEMS');
  });

  it('devices and realtime surfaces use authenticated API clients, never hardcoded readings', () => {
    const shell = read(SHELL);
    expect(shell).toContain('loadMobileDevices(mobileSessionClient)');
    expect(shell).toContain('loadLatestTelemetry(mobileSessionClient, deviceId)');
    expect(shell).not.toContain('27,5°C');
  });

  it('alerts use the authorized analytics contract without claiming delivery or global all-clear', () => {
    const shell = read(SHELL);
    const client = read('apps/user-mobile/src/device-control/mobile-device-client.ts');
    const panel = read('apps/user-mobile/src/ui/mobile-alerts-panel.tsx');
    expect(shell).toContain('loadMobileAlerts');
    expect(shell).toContain('MobileAlertsPanel');
    expect(client).toContain("'/analytics/alerts/accessible?limit=50'");
    expect(panel).toContain('bukan jaminan all-clear');
    expect(panel).not.toContain('notifikasi berhasil dikirim');
  });
});
