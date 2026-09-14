import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.7/G1.8 Super Admin Tenant + User directories (blueprint §1)', () => {
  it('tenants page renders live directory content', () => {
    const page = read('apps/admin-web/app/super/tenants/page.tsx');
    expect(page).toContain('SuperTenantsContent');
  });

  it('tenants content reads platform tenants proxy, fail-closed', () => {
    const content = read('apps/admin-web/components/super-tenants-content.tsx');
    expect(content).toContain("fetch('/api/super/tenants')");
    expect(content).toContain('Direktori tenant tidak tersedia');
    expect(content).not.toContain("'Demo Home'");
  });

  it('tenant directory proxy route is session-guarded', () => {
    const route = read(
      'apps/admin-web/app/api/admin/directory/tenants/route.ts',
    );
    expect(route).toContain("client.request('/admin/tenants')");
    expect(route).toContain('clearSessionCookies');
  });

  it('users page renders live directory content', () => {
    const page = read('apps/admin-web/app/super/users/page.tsx');
    expect(page).toContain('SuperUsersContent');
  });

  it('users content reads platform users proxy, fail-closed, no demo rows', () => {
    const content = read('apps/admin-web/components/super-users-content.tsx');
    // Provisioning upgrade: platform-users supports list + create (Modul 25).
    expect(content).toContain("fetch('/api/super/platform-users')");
    expect(content).not.toContain("id: 'u1'");
    const route = read('apps/admin-web/app/api/super/users/route.ts');
    expect(route).toContain("client.request('/admin/users')");
  });
});
