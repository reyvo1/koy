import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Module 09 read-time telemetry aggregation query contract', () => {
  it('keeps the endpoint authenticated, tenant isolated, and device scoped', () => {
    const controller = read(
      'src/telemetry/telemetry-aggregation.controller.ts',
    );
    const service = read('src/telemetry/telemetry-aggregation.service.ts');

    expect(controller).toContain("@Controller('devices/:deviceId/telemetry')");
    expect(controller).toContain("@Get('aggregate')");
    expect(controller).toContain("@RequireDeviceAccess('VIEW')");
    expect(controller).toContain(
      '@UseGuards(JwtAuthGuard, TenantContextGuard, DeviceAccessGuard)',
    );
    expect(controller).toContain('request.user.tenantContext.tenantId');
    expect(service).toContain('id: deviceId');
    expect(service).toContain('tenantId');
    expect(service).toContain('ERROR_CODES.DeviceNotFound');
  });

  it('supports only bounded numeric capability aggregation', () => {
    const service = read('src/telemetry/telemetry-aggregation.service.ts');

    expect(service).toContain("'15m':");
    expect(service).toContain("'1h':");
    expect(service).toContain("'1d':");
    expect(service).toContain('MAX_AGGREGATION_RANGE_MS');
    expect(service).toContain('MAX_AGGREGATION_BUCKETS = 744');
    expect(service).toContain("capability.dataType !== 'integer'");
    expect(service).toContain("capability.dataType !== 'number'");
    expect(service).toContain('isReportable: true');
    expect(service).not.toContain('SUM(value)');
  });

  it('uses parameterized PostgreSQL read-time aggregation without unsafe raw SQL', () => {
    const service = read('src/telemetry/telemetry-aggregation.service.ts');

    expect(service).toContain('Prisma.sql`');
    expect(service).toContain('this.prisma.$queryRaw<AggregationRow[]>(sql)');
    expect(service).toContain('date_bin(');
    expect(service).toContain(
      'jsonb_typeof(payload -> (${query.capabilityKey}::text))',
    );
    expect(service).toContain('"tenantId" = ${tenantId}');
    expect(service).toContain('"deviceId" = ${deviceId}');
    expect(service).toContain("AT TIME ZONE 'UTC'");
    expect(service).not.toContain('$queryRawUnsafe');
    expect(service).not.toContain('$executeRawUnsafe');
  });

  it('keeps aggregation read-time with no schema migration or persisted rollup', () => {
    const schema = read('prisma/schema.prisma');
    const strategy = read('docs/telemetry-storage-strategy.md');
    const aggregation = read('docs/telemetry-aggregation.md');

    expect(schema).toContain('@@index([tenantId, deviceId, createdAt, id])');
    expect(schema).not.toContain('model TelemetryAggregate');
    expect(strategy).toContain('Aggregation remains read-time');
    expect(aggregation).toContain('No schema migration');
    expect(aggregation).toContain('Persisted rollups remain deferred');
  });

  it('adds observable and isolated PostgreSQL validation coverage', () => {
    const service = read('src/telemetry/telemetry-aggregation.service.ts');
    const metrics = read('src/metrics/metrics.service.ts');
    const integration = read(
      'test/integration/telemetry-aggregation.integration-spec.ts',
    );

    expect(service).toContain("event: 'telemetry.aggregate.succeeded'");
    expect(service).toContain("event: 'telemetry.aggregate.failed'");
    expect(metrics).toContain('recordTelemetryAggregation(');
    expect(metrics).not.toContain('recordTelemetryAggregation(tenantId');
    expect(integration).toContain('telemetry_aggregation_probe');
    expect(integration).toContain('date_bin(');
    expect(integration).toContain('jsonb_typeof');
  });
});
