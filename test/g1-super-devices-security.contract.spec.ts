import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.9/G1.12 super devices + security audit screens', () => {
  it('backend exposes bounded merged audit endpoint', () => {
    const controller = read(
      'src/admin-operations/admin-billing-directory.controller.ts',
    );
    expect(controller).toContain("@Get('audit-logs')");
    expect(controller).toContain('rbacAuditLog.findMany');
    expect(controller).toContain('shareAuditLog.findMany');
  });

  it('security page renders live audit content via proxy', () => {
    const page = read('apps/admin-web/app/super/security/page.tsx');
    expect(page).toContain('SuperSecurityContent');
    const route = read('apps/admin-web/app/api/super/audit-logs/route.ts');
    expect(route).toContain("client.request('/admin/audit-logs')");
    // Demo log rows must be gone.
    const content = read('apps/admin-web/components/super-security-content.tsx');
    expect(content).not.toContain("id: 'log-1'");
  });

  it('super devices page renders the live device list', () => {
    const page = read('apps/admin-web/app/super/devices/page.tsx');
    expect(page).toContain('SuperDevicesContent');
    const content = read('apps/admin-web/components/super-devices-content.tsx');
    expect(content).toContain("fetch('/api/super/platform-devices')");
  });
});
