import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('tenant operator surface closure', () => {
  it('makes tenant audit and integration registry reachable from the governed menu', () => {
    const navigation = read('apps/admin-web/lib/tenant-navigation.ts');
    expect(navigation).toContain("href: '/tenant/audit-log'");
    expect(navigation).toContain("href: '/tenant/integrasi'");
    expect(read('apps/admin-web/app/tenant/audit-log/page.tsx')).toContain('/api/tenant/audit-logs');
    expect(read('apps/admin-web/app/tenant/integrasi/page.tsx')).toContain('/api/tenant/integrations');
  });

  it('keeps the audit pagination contract opaque and round-trippable', () => {
    const service = read('src/rbac/rbac-audit.service.ts');
    const controller = read('src/rbac/rbac-audit.controller.ts');
    expect(service).toContain(".toString('base64url')");
    expect(controller).toContain("Buffer.from(cursor, 'base64url')");
    expect(controller).toContain('base64url value returned as nextCursor');
  });

  it('never treats a raw integration credential as a credential reference', () => {
    const service = read('src/integrations/integration-registry.service.ts');
    const bff = read('apps/admin-web/app/api/tenant/integrations/route.ts');
    const page = read('apps/admin-web/app/tenant/integrasi/page.tsx');
    expect(service).toContain("INTEGRATION_CREDENTIAL_REF_PREFIX = 'secret://'");
    expect(service).toContain('startsWith(INTEGRATION_CREDENTIAL_REF_PREFIX)');
    expect(bff).toContain("const SECRET_REF_PREFIX = 'secret://'");
    expect(page).toContain('Jangan tempel token/password asli');
  });

  it('exposes notification detail without exposing the persisted message body', () => {
    const service = read('src/notification/notification.service.ts');
    const route = read('apps/admin-web/app/api/tenant/notifications/[notificationId]/route.ts');
    const page = read('apps/admin-web/app/tenant/notifikasi/page.tsx');
    const detailBlock = service.slice(service.indexOf('async findForOperator'));
    expect(detailBlock).toContain('tenantId: true');
    expect(detailBlock).toContain('destination: true');
    expect(detailBlock).not.toContain('body: true');
    expect(detailBlock).not.toContain('idempotencyKey: true');
    expect(route).toContain('/notifications/${encodeURIComponent(notificationId)}');
    expect(page).toContain('EXHAUSTED');
    expect(page).not.toContain('RETRY_SCHEDULED');
    expect(page).toContain('token verifikasi atau reset password');
  });

  it('documents the two new KEEP routes and their truthful boundaries', () => {
    const routeMap = read('docs/UI-ROUTE-MAP.md');
    expect(routeMap).toContain('| `/tenant/audit-log` | KEEP |');
    expect(routeMap).toContain('| `/tenant/integrasi` | KEEP |');
    expect(routeMap).toContain('registry');
    expect(routeMap).toContain('message body');
  });

  it('uses one canonical tenant navigation model across tenant, lab, and quick-access shells', () => {
    const navigation = read('apps/admin-web/lib/tenant-navigation.ts');
    const tenantShell = read('apps/admin-web/components/tenant-shell.tsx');
    const fieldShell = read('apps/admin-web/components/admin-shell-v3.tsx');
    const summary = read('apps/admin-web/components/operational-summary-experience.tsx');

    for (const route of [
      '/tenant/workspace',
      '/tenant/notifikasi',
      '/tenant/audit-log',
      '/tenant/integrasi',
      '/tenant/api-keys',
      '/tenant/webhooks',
      '/tenant/organisasi',
    ]) {
      expect(navigation).toContain(`href: '${route}'`);
    }
    expect(tenantShell).toContain('const NAV_GROUPS = TENANT_NAV_GROUPS');
    expect(fieldShell).toContain('...TENANT_NAV_GROUPS');
    expect(summary).toContain('const NAV_SECTIONS = TENANT_NAV_GROUPS');
  });

  it('preserves revoked user state and sends only operator-changed fields', () => {
    const service = read('src/admin-operations/admin-user-provisioning.service.ts');
    const modal = read('apps/admin-web/components/user-actions-modal.tsx');
    const tenantUsers = read('apps/admin-web/components/tenant-users-content.tsx');
    const superUsers = read('apps/admin-web/components/super-users-content.tsx');

    expect(service).toContain('private directoryMembership');
    expect(service).toContain('item.tenantId === tenantId');
    expect(service).toContain('User directory membership is inconsistent with tenant ownership');
    expect(service).toContain('status: patch.status ?? membership.status');
    expect(modal).toContain("setStatus(user.status ?? 'ACTIVE')");
    expect(modal).toContain("status === 'PENDING'");
    expect(modal).toContain('status !== originalStatus');
    expect(modal).toContain("Object.keys(payload).filter((key) => key !== 'tenantId')");
    expect(tenantUsers).toContain("m.status === 'PENDING' || !m.isVerified");
    expect(superUsers).toContain("user.status === 'PENDING' || !user.isVerified");
  });

  it('surfaces the existing manual maintenance open and resolve lifecycle in technician UI', () => {
    const page = read('apps/admin-web/app/technician/page.tsx');
    const bff = read('apps/admin-web/app/api/admin/device-maintenance/route.ts');
    expect(bff).toContain('export async function POST');
    expect(page).toContain("fetch('/api/admin/device-maintenance'");
    expect(page).toContain("method: 'POST'");
    expect(page).toContain('Buka Maintenance');
    expect(page).toContain("method: 'DELETE'");
  });

});
