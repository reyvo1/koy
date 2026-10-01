import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Module 10 Slice 10.4 capability-driven widget resolution contract', () => {
  const resolver = read('src/dashboard/dashboard-widget.resolver.ts');
  const repository = read('src/dashboard/dashboard.repository.ts');
  const controller = read('src/dashboard/dashboard.controller.ts');
  const service = read('src/dashboard/dashboard.service.ts');
  const moduleFile = read('src/dashboard/dashboard.module.ts');
  const errors = read('src/common/errors/error-code.ts');
  const documentation = read(
    'docs/module-10-capability-driven-widget-resolution.md',
  );

  it('preserves Slice 10.4 evidence while lifecycle advances within Module 10', () => {
    expect(read('AI-Development-Kit/prompts/MODULE-11.md')).not.toContain(
      'Lifecycle state: active',
    );
  });

  it('defines explicit compatibility for all approved widget kinds', () => {
    for (const kind of [
      'CARD',
      'SWITCH',
      'GAUGE',
      'CHART',
      'MAP',
      'TABLE',
      'STATUS',
    ]) {
      expect(resolver).toContain(`DashboardWidgetKind.${kind}`);
    }
    expect(resolver).toContain('MAP_SEMANTICS_NOT_APPROVED');
    expect(resolver).toContain('MAX_AGGREGATION_BUCKETS = 744');
    expect(resolver).toContain('MAX_AGGREGATION_RANGE_HOURS = 31 * 24');
    expect(resolver).toContain('MAX_HISTORY_LIMIT = 100');
  });

  it('validates widget semantics before persistence using tenant-scoped metadata', () => {
    expect(repository).toContain('this.widgetResolver.assertPersistable');
    expect(repository).toContain('semanticType: true');
    expect(repository).toContain('isReadable: true');
    expect(repository).toContain('isWritable: true');
    expect(repository).toContain('isReportable: true');
    expect(repository).toContain('status: true');
    expect(repository).toContain('findAuthorizedDashboardResolution');
  });

  it('exposes an authenticated tenant-isolated resolution endpoint', () => {
    expect(controller).toContain("@Get(':dashboardId/resolution')");
    // Assert the guard list by membership, not as a pinned string. Pinning
    // `JwtAuthGuard, TenantContextGuard)` meant that adding a third guard failed the test even
    // though the extra guard only strengthens the boundary this assertion exists to protect.
    // The intent is "authenticated and tenant-scoped"; that stays true as guards are added.
    const guardList = controller.match(/@UseGuards\(([^)]*)\)/)?.[1] ?? '';
    expect(guardList).toContain('JwtAuthGuard');
    expect(guardList).toContain('TenantContextGuard');
    expect(controller).toContain("name: 'X-Tenant-Id'");
    expect(service).toContain("event: 'dashboard.api.resolved'");
    expect(moduleFile).toContain('DashboardWidgetResolver');
  });

  it('returns bounded per-widget states and stable invalid-resolution errors', () => {
    for (const state of ['READY', 'INVALID', 'UNSUPPORTED']) {
      expect(
        read('src/dashboard/dashboard-widget-resolution.types.ts'),
      ).toContain(`'${state}'`);
    }
    expect(errors).toContain(
      "DashboardWidgetResolutionInvalid: 'DASHBOARD_WIDGET_RESOLUTION_INVALID'",
    );
    expect(documentation).toContain(
      'A failed widget does not make the whole authorized dashboard unreadable.',
    );
  });

  it('does not execute telemetry, commands, MQTT, camera, or frontend work', () => {
    expect(resolver).not.toContain('TelemetryService');
    expect(resolver).not.toContain('TelemetryAggregationService');
    expect(resolver).not.toContain('CommandService');
    expect(resolver).not.toContain('MqttService');
    expect(documentation).toContain(
      'It does not execute telemetry queries, publish commands, create frontend workspaces, introduce camera or barcode runtime, activate Module 11, or approve production deployment.',
    );
  });

});
