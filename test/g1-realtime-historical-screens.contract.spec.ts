import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.2 Realtime Monitoring + Historical Data screens (blueprint §2)', () => {
  it('realtime page wires the live SSE content component', () => {
    const page = read('apps/admin-web/app/tenant/realtime/page.tsx');
    expect(page).toContain('TenantRealtimeContent');
    expect(page).toContain('TenantShell');
  });

  it('realtime content uses SSE stream + aggregate chart, fail-closed', () => {
    const content = read('apps/admin-web/components/tenant-realtime-content.tsx');
    expect(content).toContain('useTelemetryStream');
    expect(content).toContain('/api/admin/telemetry-chart?deviceId=');
    expect(content).toContain('Data realtime tidak tersedia');
    expect(content).not.toContain("name: 'Ruang Tamu'");
  });

  it('historical explorer supports device + range selection over bounded API', () => {
    const content = read(
      'apps/admin-web/components/tenant-historical-content.tsx',
    );
    expect(content).toContain('/api/admin/telemetry-chart?deviceId=${deviceId}&hours=${hours}');
    expect(content).toContain('Data historis tidak tersedia');
  });

  it('grafik and historis pages render through tenant shell', () => {
    for (const file of [
      'apps/admin-web/app/tenant/grafik/page.tsx',
      'apps/admin-web/app/tenant/historis/page.tsx',
    ]) {
      const page = read(file);
      expect(page).toContain('TenantHistoricalContent');
    }
  });

  it('nav exposes realtime + charts + historical entries', () => {
    const shell = read('apps/admin-web/components/tenant-shell.tsx');
    expect(shell).toContain('/tenant/historis');
  });
});
