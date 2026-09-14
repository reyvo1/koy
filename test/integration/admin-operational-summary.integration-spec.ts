import { randomUUID } from 'node:crypto';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { CommandStatus, DeviceStatus, PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import { AdminOperationsModule } from '../../src/admin-operations/admin-operations.module';
import { AuthModule } from '../../src/auth/auth.module';
import { ERROR_CODES } from '../../src/common/errors/error-code';
import { createTestApplication } from '../support/create-test-application';
import { RedisModule } from '../../src/redis/redis.module';

const JWT_SECRET = 'admin-operational-summary-integration-secret';

describe('Admin operational summary HTTP and PostgreSQL integration', () => {
  const prisma = new PrismaClient();
  const previousJwtSecret = process.env.JWT_SECRET;

  let app: NestFastifyApplication;
  let tenantId: string;
  let otherTenantId: string;
  let adminUserId: string;
  let memberUserId: string;
  let revokedAdminUserId: string;
  let otherTenantAdminUserId: string;
  let latestTenantTelemetryAt: Date;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    await prisma.$connect();

    const tenant = await prisma.tenant.create({
      data: { name: `admin-summary-${randomUUID()}` },
    });
    const otherTenant = await prisma.tenant.create({
      data: { name: `admin-summary-other-${randomUUID()}` },
    });
    tenantId = tenant.id;
    otherTenantId = otherTenant.id;

    adminUserId = await createUserWithMembership(tenantId, 'ADMIN', 'ACTIVE');
    memberUserId = await createUserWithMembership(tenantId, 'MEMBER', 'ACTIVE');
    revokedAdminUserId = await createUserWithMembership(
      tenantId,
      'ADMIN',
      'REVOKED',
    );
    otherTenantAdminUserId = await createUserWithMembership(
      otherTenantId,
      'ADMIN',
      'ACTIVE',
    );

    const freshDevice = await prisma.device.create({
      data: {
        name: 'Tenant fresh device',
        tenantId,
        status: DeviceStatus.ACTIVE,
        lastHeartbeatAt: new Date(),
      },
    });
    await prisma.device.createMany({
      data: [
        {
          name: 'Tenant stale device',
          tenantId,
          status: DeviceStatus.INACTIVE,
          lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000),
        },
        {
          name: 'Tenant never-reported device',
          tenantId,
          status: DeviceStatus.PROVISIONING,
        },
        {
          name: 'Tenant revoked device',
          tenantId,
          status: DeviceStatus.REVOKED,
        },
      ],
    });
    const otherDevice = await prisma.device.create({
      data: {
        name: 'Other tenant device',
        tenantId: otherTenantId,
        status: DeviceStatus.ACTIVE,
        lastHeartbeatAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    });

    await prisma.capability.createMany({
      data: [
        {
          deviceId: freshDevice.id,
          key: 'temperature',
          semanticType: 'temperature',
          dataType: 'number',
          isReadable: true,
          isReportable: true,
          isWritable: false,
        },
        {
          deviceId: freshDevice.id,
          key: 'enabled',
          semanticType: 'enabled',
          dataType: 'boolean',
          isReadable: true,
          isReportable: false,
          isWritable: true,
        },
        {
          deviceId: otherDevice.id,
          key: 'other-temperature',
          semanticType: 'temperature',
          dataType: 'number',
          isReadable: true,
          isReportable: true,
          isWritable: true,
        },
      ],
    });

    latestTenantTelemetryAt = new Date('2026-07-19T02:00:00.000Z');
    await prisma.telemetry.createMany({
      data: [
        {
          eventId: randomUUID(),
          tenantId,
          deviceId: freshDevice.id,
          payload: { temperature: 21.5 },
          createdAt: latestTenantTelemetryAt,
        },
        {
          eventId: randomUUID(),
          tenantId: otherTenantId,
          deviceId: otherDevice.id,
          payload: { temperature: 99 },
          createdAt: new Date('2026-07-20T02:00:00.000Z'),
        },
      ],
    });

    await prisma.deviceCommand.createMany({
      data: [
        {
          tenantId,
          deviceId: freshDevice.id,
          payload: { enabled: true },
          status: CommandStatus.PENDING,
        },
        {
          tenantId,
          deviceId: freshDevice.id,
          payload: { enabled: false },
          status: CommandStatus.ACKNOWLEDGED,
        },
        {
          tenantId: otherTenantId,
          deviceId: otherDevice.id,
          payload: { enabled: true },
          status: CommandStatus.FAILED,
        },
      ],
    });

    app = await createTestApplication({
      moduleMetadata: {
        imports: [AuthModule, AdminOperationsModule, RedisModule],
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();

    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  });

  it('returns only the authenticated ADMIN tenant aggregates', async () => {
    const response = await requestSummary(adminUserId, tenantId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      staleThresholdSeconds: 300,
      devices: {
        total: 4,
        byStatus: {
          PROVISIONING: 1,
          PAIRED: 0,
          ACTIVE: 1,
          INACTIVE: 1,
          REVOKED: 1,
        },
        staleHeartbeat: 1,
        neverReportedHeartbeat: 1,
      },
      capabilities: { readable: 2, reportable: 1, writable: 1 },
      telemetry: { latestObservedAt: latestTenantTelemetryAt.toISOString() },
      commands: {
        total: 2,
        byStatus: {
          PENDING: 1,
          SENT: 0,
          ACKNOWLEDGED: 1,
          FAILED: 0,
          TIMED_OUT: 0,
        },
      },
    });
  });

  it('keeps the other tenant aggregates isolated', async () => {
    const response = await requestSummary(
      otherTenantAdminUserId,
      otherTenantId,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      devices: { total: 1, staleHeartbeat: 1, neverReportedHeartbeat: 0 },
      capabilities: { readable: 1, reportable: 1, writable: 1 },
      telemetry: { latestObservedAt: '2026-07-20T02:00:00.000Z' },
      commands: { total: 1, byStatus: { FAILED: 1 } },
    });
  });

  it('rejects an ADMIN selecting a tenant without an active membership', async () => {
    const response = await requestSummary(adminUserId, otherTenantId);
    expectForbidden(response, ERROR_CODES.TenantMembershipInvalid);
  });

  it('rejects MEMBER access with the stable ADMIN-required domain code', async () => {
    const response = await requestSummary(memberUserId, tenantId);
    expectForbidden(response, ERROR_CODES.AdminOperationalSummaryAdminRequired);
  });

  it('rejects inactive ADMIN membership before role authorization', async () => {
    const response = await requestSummary(revokedAdminUserId, tenantId);
    expectForbidden(response, ERROR_CODES.TenantMembershipInvalid);
  });

  it('rejects unauthenticated requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/operational-summary',
      headers: { 'x-tenant-id': tenantId },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: ERROR_CODES.Unauthorized },
      path: '/admin/operational-summary',
    });
  });

  async function createUserWithMembership(
    selectedTenantId: string,
    role: 'ADMIN' | 'MEMBER',
    status: 'ACTIVE' | 'REVOKED',
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        tenantId: selectedTenantId,
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId: selectedTenantId, role, status },
    });
    return user.id;
  }

  function accessToken(userId: string): string {
    return sign({ sub: userId }, JWT_SECRET, { expiresIn: '5m' });
  }

  function requestSummary(userId: string, selectedTenantId: string) {
    return app.inject({
      method: 'GET',
      url: '/admin/operational-summary',
      headers: {
        authorization: `Bearer ${accessToken(userId)}`,
        'x-tenant-id': selectedTenantId,
      },
    });
  }

  function expectForbidden(
    response: Awaited<ReturnType<typeof requestSummary>>,
    code: string,
  ): void {
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code },
      path: '/admin/operational-summary',
    });
  }
});
