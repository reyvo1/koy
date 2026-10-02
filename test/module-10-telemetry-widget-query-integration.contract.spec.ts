import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Module 10 Slice 10.5 telemetry widget query integration contract', () => {
  const controller = read('src/dashboard/dashboard.controller.ts');
  const service = read('src/dashboard/dashboard.service.ts');
  const queryService = read('src/dashboard/dashboard-widget-query.service.ts');
  const queryTypes = read('src/dashboard/dashboard-widget-query.types.ts');
  const dashboardModule = read('src/dashboard/dashboard.module.ts');
  const telemetryModule = read('src/telemetry/telemetry.module.ts');
  const documentation = read(
    'docs/module-10-telemetry-widget-query-integration.md',
  );

  it('preserves Slice 10.5 evidence while lifecycle advances within Module 10', () => {
    expect(read('AI-Development-Kit/prompts/MODULE-11.md')).not.toContain(
      'Lifecycle state: active',
    );
  });

  it('exposes a tenant-isolated per-widget data endpoint', () => {
    expect(controller).toContain("@Get(':dashboardId/widgets/:widgetId/data')");
    // Assert the guard list by membership, not as a pinned string. Pinning
    // `JwtAuthGuard, TenantContextGuard)` meant that adding a third guard failed the test even
    // though the extra guard only strengthens the boundary this assertion exists to protect.
    // The intent is "authenticated and tenant-scoped"; that stays true as guards are added.
    const guardList = controller.match(/@UseGuards\(([^)]*)\)/)?.[1] ?? '';
    expect(guardList).toContain('JwtAuthGuard');
    expect(guardList).toContain('TenantContextGuard');
    expect(service).toContain('findAuthorizedDashboardResolution');
    expect(service).toContain("event: 'dashboard.widget_query.completed'");
    expect(service).not.toContain('tenantId: dashboard.tenantId');
  });

  it('reuses existing bounded telemetry APIs without raw query access', () => {
    expect(queryService).toContain('this.telemetryService.getLatest');
    expect(queryService).toContain('this.telemetryService.getHistory');
    expect(queryService).toContain('this.aggregationService.getAggregate');
    expect(queryService).not.toContain('PrismaService');
    expect(queryService).not.toContain('$queryRaw');
    expect(queryService).not.toContain('CommandService');
    expect(queryService).not.toContain('MqttService');
  });

  it('keeps query execution bounded and fail-closed per widget', () => {
    for (const state of [
      'READY',
      'EMPTY',
      'STALE',
      'INVALID',
      'UNSUPPORTED',
      'ERROR',
    ]) {
      expect(queryTypes).toContain(`'${state}'`);
    }
    expect(queryService).toContain('COMMAND_QUERY_DEFERRED');
    expect(queryService).toContain('TELEMETRY_QUERY_FAILED');
    expect(queryService).toContain('Promise.all');
    expect(documentation).toContain(
      'At most the persisted sixteen bindings of the selected widget are executed in one request.',
    );
  });

  it('wires existing telemetry services through module exports only', () => {
    // Asserted per service rather than as one literal array. The literal broke the moment a third
    // telemetry provider was added, and the failure said nothing about whether the two services this
    // test is about were still exported -- which is the thing it is actually checking.
    const exportsLine = telemetryModule
      .split('\n')
      .find((line: string) => line.includes('exports:') && line.includes('TelemetryService'));
    expect(exportsLine).toBeDefined();
    expect(exportsLine).toContain('TelemetryService');
    expect(exportsLine).toContain('TelemetryAggregationService');
    expect(dashboardModule).toContain(
      'imports: [PrismaModule, TelemetryModule, DeviceModule]',
    );
    expect(dashboardModule).toContain('DashboardWidgetQueryService');
  });

  it('keeps commands, realtime, frontends, camera, and Module 11 deferred', () => {
    expect(documentation).toContain(
      'It does not publish commands, add SSE or WebSocket delivery, create frontend workspaces, implement camera or barcode runtime, activate Module 11, or approve production deployment.',
    );
  });

});
