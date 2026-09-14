import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Module 09 telemetry history query foundation contract', () => {
  it('keeps history authenticated, tenant isolated, bounded, and cursor based', () => {
    const controller = read('src/telemetry/telemetry.controller.ts');
    const service = read('src/telemetry/telemetry.service.ts');

    expect(controller).toContain(
      '@UseGuards(JwtAuthGuard, TenantContextGuard, DeviceAccessGuard)',
    );
    expect(controller).toContain("@Get('history')");
    expect(controller).toContain("@RequireDeviceAccess('VIEW')");
    expect(controller).toContain('new DefaultValuePipe(50)');
    expect(controller).toContain('ParseIntPipe');
    expect(controller).toContain("@Query('cursor') cursor?: string");
    expect(service).toContain('async getHistory(');
    expect(service).toContain(
      'await this.ensureDeviceInTenant(tenantId, deviceId)',
    );
    expect(service).toContain('take: safeLimit + 1');
    expect(service).toContain(
      "orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]",
    );
    expect(service).not.toContain('skip:');
  });

  it('provides the composite query index and committed migration', () => {
    const schema = read('prisma/schema.prisma');
    const migration = read(
      'prisma/migrations/20260718000000_add_telemetry_history_query_index/migration.sql',
    );

    expect(schema).toContain('@@index([tenantId, deviceId, createdAt, id])');
    expect(migration).toContain(
      '"telemetry_tenantId_deviceId_createdAt_id_idx"',
    );
    expect(migration).toContain(
      'ON "telemetry"("tenantId", "deviceId", "createdAt", "id")',
    );
  });
});
