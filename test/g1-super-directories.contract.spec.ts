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
    // Repointed from `api/admin/directory/tenants` to `api/super/tenants`. Both proxied the
    // same backend `GET /admin/tenants`; the directory copy had no in-app caller, and its
    // existence was only ever asserted by this test, which is how it survived. The assertion
    // now pins the route the UI actually reads, and the absence of the duplicate, so a second
    // proxy for one payload cannot reappear unnoticed.
    const route = read('apps/admin-web/app/api/super/tenants/route.ts');
    expect(route).toContain("client.request('/admin/tenants')");
    expect(route).toContain('proxyBackend');
    expect(() =>
      read('apps/admin-web/app/api/admin/directory/tenants/route.ts'),
    ).toThrow();
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
    // The predecessor of this route was `api/super/users`, proxying `GET /admin/users`. Nothing
    // called it once platform-users shipped, and only this test still referenced it, so the
    // stale assertion was the last thing holding a dead HTTP surface open. Now the live route
    // is pinned instead, and the duplicate is asserted gone.
    const route = read('apps/admin-web/app/api/super/platform-users/route.ts');
    // The target path is asserted without the closing paren: this route forwards an `init`
    // argument, so `toContain("...')")` would fail on a correct implementation.
    expect(route).toContain("client.request('/admin/platform-users'");
    expect(route).toContain('AdminSessionBackendClient');
    // The predecessor proxied `GET /admin/users`; this route is the one the UI reads, and the
    // duplicate is asserted gone so a second proxy for one payload cannot reappear unnoticed.
    expect(() => read('apps/admin-web/app/api/super/users/route.ts')).toThrow();
  });
});
