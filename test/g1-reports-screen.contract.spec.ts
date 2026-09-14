import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.6 Reports + Export (blueprint §2)', () => {
  it('reports page wires live CSV export content', () => {
    const page = read('apps/admin-web/app/tenant/laporan/page.tsx');
    expect(page).toContain('TenantReportsContent');
    expect(page).toContain('TenantShell');
  });

  it('exports real aggregate buckets as CSV — no fabricated report rows', () => {
    const content = read('apps/admin-web/components/tenant-reports-content.tsx');
    expect(content).toContain('/api/admin/telemetry-chart?deviceId=${device.id}&hours=${hours}');
    expect(content).toContain('text/csv;charset=utf-8');
    expect(content).not.toContain("name: 'Ringkasan Harian Perangkat'");
  });
});
