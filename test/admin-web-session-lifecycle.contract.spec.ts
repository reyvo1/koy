import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Admin Web BFF session lifecycle and error semantics', () => {
  it('persists rotated tokens and clears cookies only after a final 401', () => {
    const session = read('apps/admin-web/lib/session.ts');
    expect(session).toContain('finalizeAdminSessionResponse');
    expect(session).toMatch(/if \(backendStatus === 401\)/);
    expect(session).toContain('clearSessionCookies(response)');
    expect(session).toContain('client.applySessionUpdate(response)');
  });

  it('shared proxy finalizes every backend response through the session helper', () => {
    const proxy = read('apps/admin-web/lib/proxy.ts');
    expect(proxy).toContain('finalizeAdminSessionResponse(client, next, response.status)');
    expect(proxy).not.toMatch(/status === 401 \|\| status === 403/);
  });

  it('no Admin Web route collapses 403 authorization into 401 session invalidation', () => {
    const routePaths = [
      'apps/admin-web/app/api/admin/analytics-findings/route.ts',
      'apps/admin-web/app/api/admin/device-capabilities/route.ts',
      'apps/admin-web/app/api/admin/device-detail/route.ts',
      'apps/admin-web/app/api/admin/device-health/route.ts',
      'apps/admin-web/app/api/admin/device-log/route.ts',
      'apps/admin-web/app/api/admin/device-maintenance/[maintenanceId]/route.ts',
      'apps/admin-web/app/api/admin/device-maintenance/route.ts',
      'apps/admin-web/app/api/admin/devices/route.ts',
      'apps/admin-web/app/api/admin/operational-summary/route.ts',
      'apps/admin-web/app/api/admin/telemetry-chart/route.ts',
      'apps/admin-web/app/api/admin/telemetry-stream/route.ts',
      'apps/admin-web/app/api/admin/tenant-users/route.ts',
      'apps/admin-web/app/api/cameras/route.ts',
      'apps/admin-web/app/api/devices/[deviceId]/commands/route.ts',
      'apps/admin-web/app/api/super/audit-logs/route.ts',
      'apps/admin-web/app/api/super/firmware/route.ts',
      'apps/admin-web/app/api/super/platform-users/route.ts',
      'apps/admin-web/app/api/super/subscriptions/route.ts',
      'apps/admin-web/app/api/super/telemetry-chart/route.ts',
      'apps/admin-web/app/api/tenant/commands/route.ts',
      'apps/admin-web/app/api/tenant/scenes/[sceneId]/run/route.ts',
    ];
    for (const path of routePaths) {
      expect(read(path)).not.toMatch(/status === 401 \|\| status === 403/);
    }
  });

  it('does not turn capability or telemetry backend failures into fake empty success', () => {
    const capabilities = read('apps/admin-web/app/api/admin/device-capabilities/route.ts');
    expect(capabilities).toContain('if (!response.ok)');
    expect(capabilities).toContain('status: response.status');
    expect(capabilities).toContain('finalizeAdminSessionResponse(client, next, response.status)');

    const chart = read('apps/admin-web/app/api/admin/telemetry-chart/route.ts');
    expect(chart).toContain('if (!listResponse.ok)');
    expect(chart).toContain('if (!response.ok)');
    expect(chart).not.toContain('// Numeric capability may not exist on chosen device — empty chart.');
  });

  it('tenant command aggregation only suppresses expected visibility races', () => {
    const commands = read('apps/admin-web/app/api/tenant/commands/route.ts');
    expect(commands).toContain('response.status === 403 || response.status === 404');
    expect(commands).toContain('throw cause');
    expect(commands).not.toContain('} catch {\n          return [];');
  });

  it('scene execution preserves 403 and persists refreshed Admin Web session tokens', () => {
    const route = read('apps/admin-web/app/api/tenant/scenes/[sceneId]/run/route.ts');
    expect(route).toContain('finalizeAdminSessionResponse(client, next, response.status)');
    expect(route).not.toMatch(/status === 401 \|\| status === 403/);
  });
});
