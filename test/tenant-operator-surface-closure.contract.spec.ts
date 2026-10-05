import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('tenant operator surface closure', () => {
  it('makes tenant audit and integration registry reachable from the governed menu', () => {
    const shell = read('apps/admin-web/components/tenant-shell.tsx');
    expect(shell).toContain("href: '/tenant/audit-log'");
    expect(shell).toContain("href: '/tenant/integrasi'");
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
});
