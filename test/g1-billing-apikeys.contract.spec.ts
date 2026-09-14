import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.7/G1.8 billing subscriptions + quotas + api keys screens', () => {
  it('backend exposes bounded billing + api-key directory endpoints', () => {
    const controller = read(
      'src/admin-operations/admin-billing-directory.controller.ts',
    );
    expect(controller).toContain("@Get('billing/subscriptions')");
    expect(controller).toContain("@Get('api-keys')");
    expect(controller).toContain(
      '@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)',
    );
    // Never leaks hashed secrets.
    expect(controller).not.toContain('keyHash');
    const moduleSource = read('src/admin-operations/admin-operations.module.ts');
    expect(moduleSource).toContain('AdminBillingDirectoryController');
  });

  it('subscriptions & quotas pages render the live content', () => {
    for (const file of [
      'apps/admin-web/app/super/subscriptions/page.tsx',
      'apps/admin-web/app/super/quotas/page.tsx',
    ]) {
      expect(read(file)).toContain('SuperSubscriptionsContent');
    }
  });

  it('api keys page shows metadata only via proxy', () => {
    const page = read('apps/admin-web/app/super/api-keys/page.tsx');
    expect(page).toContain('SuperApiKeysContent');
    const route = read('apps/admin-web/app/api/super/api-keys/route.ts');
    expect(route).toContain("client.request('/admin/platform-api-keys')");
  });
});
