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
    expect(controller).toContain(
      '@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)',
    );
    // Tenant-scoped API-key listing must NOT live behind the platform guard: the create
    // and revoke routes are AdminRoleGuard-only, so a tenant admin could mint and revoke
    // keys but got 403 listing them. It now sits with them in AdminApiKeysController.
    expect(controller).not.toContain("@Get('api-keys')");
    const keysController = read(
      'src/admin-operations/admin-api-keys.controller.ts',
    );
    expect(keysController).toContain("@Get('api-keys')");
    expect(keysController).toContain("request.user.tenantContext.tenantId");
    // Never leaks hashed secrets. Matched as a Prisma field selector (`keyHash: true` or
    // `keyHash,`) rather than a bare substring, so a comment that merely names the field
    // does not read as a leak.
    expect(controller).not.toMatch(/keyHash\s*[:,}]/);
    expect(keysController).not.toMatch(/keyHash\s*[:,}]/);
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
