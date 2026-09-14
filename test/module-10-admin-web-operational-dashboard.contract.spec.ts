import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Module 10 Slice 10.8 Backend Operational Summary Foundation contract', () => {
  it('preserves the completed backend foundation while Module 10 lifecycle advances', () => {
    const decision = read('docs/module-10-admin-web-operational-dashboard.md');
    expect(decision).toContain('29716215821');
    expect(decision).toContain('8450706871');
    expect(decision).toContain(
      'd5b166ac738908823d305d1266c55a2464e03377213c82b22cfed2adda1ef4ad',
    );
    expect(decision).toContain('implementation commit `4097356`');
    expect(decision).toContain('audit-fix commit `53ec5c1`');
  });

  it('exposes one read-only endpoint behind JWT, tenant, then ADMIN guards', () => {
    const controller = read(
      'src/admin-operations/admin-operations.controller.ts',
    );
    const guard = read('src/admin-operations/admin-role.guard.ts');
    const appModule = read('src/app.module.ts');

    expect(controller).toContain("@Controller('admin')");
    expect(controller).toContain("@Get('operational-summary')");
    expect(controller).toContain(
      '@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)',
    );
    expect(guard).toContain("role !== 'ADMIN'");
    expect(guard).toContain('ERROR_CODES.AdminOperationalSummaryAdminRequired');
    expect(appModule).toContain('AdminOperationsModule');
  });

  it('derives every aggregate query from trusted tenant context', () => {
    const controller = read(
      'src/admin-operations/admin-operations.controller.ts',
    );
    const service = read(
      'src/admin-operations/admin-operational-summary.service.ts',
    );

    expect(controller).toContain('request.user.tenantContext.tenantId');
    expect(service).toContain('where: { tenantId }');
    expect(service).toContain('where: { device: { tenantId }');
    expect(service).toContain('status: { not: DeviceStatus.REVOKED }');
    expect(service).not.toContain('x-tenant-id');
  });

  it('returns bounded normalized summaries without raw resources or secrets', () => {
    const types = read(
      'src/admin-operations/admin-operational-summary.types.ts',
    );
    const service = read(
      'src/admin-operations/admin-operational-summary.service.ts',
    );
    const module = read('src/admin-operations/admin-operations.module.ts');

    expect(types).toContain('staleThresholdSeconds');
    expect(types).toContain('Record<DeviceStatus, number>');
    expect(types).toContain('Record<CommandStatus, number>');
    expect(types).toContain('latestObservedAt: string | null');
    expect(service).toContain('select: { createdAt: true }');
    expect(service).not.toContain('payload');
    expect(module).not.toContain('MetricsModule');
    expect(module).not.toContain('MqttModule');
    expect(module).not.toContain('RedisModule');
  });

  it('keeps the backend contract unchanged while the read-only Admin Web consumes it', () => {
    const page = read('apps/admin-web/app/page.tsx');
    const decision = read('docs/module-10-admin-web-operational-dashboard.md');
    const foundation = read(
      'docs/module-10-admin-web-operational-dashboard-ui-foundation.md',
    );

    expect(page).toContain('OperationalSummaryExperience');
    expect(page).toContain('Read-only operations');
    expect(decision).toContain('device commands or acknowledgement controls');
    expect(decision).toContain('provisioning, ownership assignment');
    expect(decision).toContain('realtime SSE or WebSocket delivery');
    expect(decision).toContain('mobile, CCTV, or barcode runtime');
    expect(foundation).toContain('The backend remains authoritative');
  });

  it('keeps remote-green closure evidence in immutable slice records', () => {
    const userWebDecision = read(
      'docs/module-10-user-web-dynamic-dashboard.md',
    );
    const decision = read('docs/module-10-admin-web-operational-dashboard.md');

    expect(decision).toContain('## Remote-Green Closure Evidence');
    expect(decision).toContain('53ec5c168fe85c27586fe0e90792d04f51b62091');
    expect(decision).toContain('29716215821');
    expect(decision).toContain('8450706871');
    expect(userWebDecision).toContain(
      'historical activation state was superseded by the remote-green backend operational-summary foundation',
    );
  });

  it('requires actual HTTP and PostgreSQL tenant-isolation evidence', () => {
    const integration = read(
      'test/integration/admin-operational-summary.integration-spec.ts',
    );

    expect(integration).toContain('createTestApplication');
    expect(integration).toContain("url: '/admin/operational-summary'");
    expect(integration).toContain('TenantMembershipInvalid');
    expect(integration).toContain('AdminOperationalSummaryAdminRequired');
    expect(integration).toContain('rejects unauthenticated requests');
    expect(integration).toContain('keeps the other tenant aggregates isolated');
  });

  it('keeps Prometheus and infrastructure boundaries outside the endpoint', () => {
    const decision = read('docs/module-10-admin-web-operational-dashboard.md');
    const controller = read(
      'src/admin-operations/admin-operations.controller.ts',
    );
    const service = read(
      'src/admin-operations/admin-operational-summary.service.ts',
    );

    expect(decision).toContain('Prometheus text or the metrics service token');
    expect(decision).toContain('raw MQTT topics');
    expect(decision).toContain('vendor secrets');
    expect(controller).not.toContain('MetricsService');
    expect(service).not.toContain('MetricsService');
  });
});
