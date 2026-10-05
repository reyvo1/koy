import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.3 Commands screen (blueprint §2)', () => {
  it('commands page wires the tenant commands content', () => {
    const page = read('apps/admin-web/app/tenant/perintah/page.tsx');
    expect(page).toContain('TenantCommandsContent');
    expect(page).toContain('TenantShell');
  });

  it('content sends commands via the authenticated proxy and shows ACK status', () => {
    const content = read('apps/admin-web/components/tenant-commands-content.tsx');
    expect(content).toContain('/api/devices/${encodeURIComponent(targetId)}/commands');
    expect(content).toContain("fetch('/api/tenant/commands')");
    expect(content).toContain('ACKNOWLEDGED');
  });

  it('bounded commands proxy aggregates device histories fail-closed', () => {
    const route = read('apps/admin-web/app/api/tenant/commands/route.ts');
    expect(route).toContain('/commands`');
    expect(route).toContain('clearSessionCookies');
    expect(route).toContain('.slice(0, 50)');
  });

  it('nav exposes the commands entry', () => {
    const shell = read('apps/admin-web/lib/tenant-navigation.ts');
    expect(shell).toContain('/tenant/perintah');
  });
});
