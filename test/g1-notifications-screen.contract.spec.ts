import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.5 Notifications & Alerts center (blueprint §2)', () => {
  it('analytics findings is the canonical live surface and legacy notifications redirect safely', () => {
    const content = read(
      'apps/admin-web/components/tenant-analytics-findings-content.tsx',
    );
    expect(content).toContain("fetch('/api/admin/analytics-findings?limit=50')");
    expect(content).toContain('Temuan analitik tidak tersedia');
    expect(content).toContain('bukan riwayat delivery notifikasi');
    expect(content).not.toContain("id: 'a1'");

    const legacyPage = read('apps/admin-web/app/tenant/notifikasi/page.tsx');
    expect(legacyPage).toContain("redirect('/tenant/temuan')");
  });
});
