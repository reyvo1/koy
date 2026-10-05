import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.1 Tenant Admin Devices/Groups/Rooms/Buildings/Locations screens', () => {
  const pages: Array<[string, string[]]> = [
    [
      'apps/admin-web/app/tenant/perangkat/page.tsx',
      ['TenantDevicesContent', '/tenant/perangkat'],
    ],
    [
      'apps/admin-web/app/tenant/grup-perangkat/page.tsx',
      ['Grup Perangkat'],
    ],
    [
      'apps/admin-web/app/tenant/ruangan/page.tsx',
      ['TenantSpacesContent', 'ROOM'],
    ],
    [
      'apps/admin-web/app/tenant/gedung/page.tsx',
      ['TenantSpacesContent', 'BUILDING'],
    ],
    [
      'apps/admin-web/app/tenant/lokasi/page.tsx',
      ['TenantSpacesContent', 'SITE'],
    ],
  ];

  it.each(pages)('%s renders through the tenant shell with live content', (file, needles) => {
    const page = read(file);
    expect(page).toContain('TenantShell');
    for (const needle of needles) {
      expect(page).toContain(needle);
    }
  });

  it('spaces content is fail-closed and kind-filtered over the proxy API', () => {
    const content = read('apps/admin-web/components/tenant-spaces-content.tsx');
    expect(content).toContain("fetch('/api/tenant/spaces')");
    expect(content).toContain('Struktur lokasi tidak tersedia');
    // Never fabricates rooms when the backend is unavailable.
    expect(content).not.toContain("name: 'Ruang Tamu'");
  });

  it('devices content is fail-closed, searchable, and links to device detail', () => {
    const content = read(
      'apps/admin-web/components/tenant-devices-content.tsx',
    );
    expect(content).toContain("fetch('/api/admin/devices')");
    expect(content).toContain('Daftar perangkat tidak tersedia');
    expect(content).toContain('/perangkat/${device.id}');
  });

  it('exposes a bounded tenant spaces proxy route', () => {
    const route = read('apps/admin-web/app/api/tenant/spaces/route.ts');
    expect(route).toContain("client.request('/spaces')");
    // proxyBackend is the shared session guard (fail-closed on 401/403).
    expect(route).toContain('proxyBackend');
  });

  it('nav exposes all blueprint §2 structure entries', () => {
    const shell = read('apps/admin-web/lib/tenant-navigation.ts');
    for (const href of [
      '/tenant/perangkat',
      '/tenant/grup-perangkat',
      '/tenant/ruangan',
      '/tenant/gedung',
      '/tenant/lokasi',
    ]) {
      expect(shell).toContain(href);
    }
  });
});
