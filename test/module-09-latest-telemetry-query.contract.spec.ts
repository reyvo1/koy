import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Module 09 latest telemetry query foundation contract', () => {
  it('keeps the query boundary authenticated and tenant isolated', () => {
    const controller = read('src/telemetry/telemetry.controller.ts');
    const service = read('src/telemetry/telemetry.service.ts');

    expect(controller).toContain("@Controller('devices/:deviceId/telemetry')");
    expect(controller).toContain(
      '@UseGuards(JwtAuthGuard, TenantContextGuard, DeviceAccessGuard)',
    );
    expect(controller).toContain("@Get('latest')");
    expect(controller).toContain("@RequireDeviceAccess('VIEW')");
    expect(controller).toContain('request.user.tenantContext.tenantId');
    expect(service).toContain(
      'async getLatest(tenantId: string, deviceId: string)',
    );
    expect(service).toContain(
      'await this.ensureDeviceInTenant(tenantId, deviceId)',
    );
    expect(service).toContain(
      "orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]",
    );
  });

  it('keeps the completed telemetry and active dashboard boundaries', () => {
    const schema = read('prisma/schema.prisma');

    expect(schema).toContain('model Telemetry');
    expect(schema).not.toContain('latestTelemetry');
  });
});
