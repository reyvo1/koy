import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.4 Automation + Schedules + Scenes screens (blueprint §2)', () => {
  it('automation page wires tenant automation content through the shell', () => {
    const page = read('apps/admin-web/app/tenant/otomatisasi/page.tsx');
    expect(page).toContain('TenantAutomationContent');
    expect(page).toContain('TenantShell');
  });

  it('automation content performs real rule CRUD via the tenant automations proxy', () => {
    const content = read(
      'apps/admin-web/components/tenant-automation-content.tsx',
    );
    expect(content).toContain("fetch('/api/tenant/automations')");
    expect(content).toContain('Otomasi tidak tersedia');
    // rules are created disabled per the persistence approval contract
    expect(content).toContain('NONAKTIF');
  });

  it('automation CRUD proxy routes exist and are session-guarded', () => {
    const route = read('apps/admin-web/app/api/tenant/automations/route.ts');
    expect(route).toContain("client.request('/automations')");
    // proxyBackend helper is the shared session guard (fail-closed on 401/403).
    expect(route).toContain('proxyBackend');
    const itemRoute = read(
      'apps/admin-web/app/api/tenant/automations/[automationId]/route.ts',
    );
    expect(itemRoute).toContain('method');
  });

  it('scenes content is live over the scenes API with run action', () => {
    const content = read('apps/admin-web/components/tenant-scenes-content.tsx');
    expect(content).toContain("fetch('/api/tenant/scenes')");
    expect(content).not.toContain("'Malam Hari'");
    expect(content).toContain('Daftar scene tidak tersedia');
  });

  it('scenes list proxy route exists and is session-guarded', () => {
    const route = read('apps/admin-web/app/api/tenant/scenes/route.ts');
    expect(route).toContain("client.request('/scenes')");
    // proxyBackend helper is the shared session guard (fail-closed on 401/403).
    expect(route).toContain('proxyBackend');
  });

  it('schedules content remains wired to Modul 13 schedules proxy', () => {
    const content = read(
      'apps/admin-web/components/tenant-schedules-content.tsx',
    );
    expect(content).toContain("fetch('/api/tenant/schedules')");
  });
});
