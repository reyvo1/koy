import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { MaintenancePlanService } from '../../src/device-maintenance/maintenance-plan.service';
import { AdminPlatformObservabilityService } from '../../src/admin-operations/admin-platform-observability.service';
import { DeviceMaintenanceService } from '../../src/device-maintenance/device-maintenance.service';

describe('product completion on migrated PostgreSQL', () => {
  const prisma = new PrismaClient();
  const audit: any = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  const old = process.env.MAINTENANCE_SCHEDULER_ENABLED;
  let tenantId: string,
    foreignTenantId: string,
    userId: string,
    memberId: string,
    deviceId: string;
  beforeAll(async () => {
    await prisma.$connect();
    process.env.MAINTENANCE_SCHEDULER_ENABLED = 'true';
  });
  beforeEach(async () => {
    tenantId = (
      await prisma.tenant.create({ data: { name: `product-${randomUUID()}` } })
    ).id;
    foreignTenantId = (
      await prisma.tenant.create({ data: { name: `foreign-${randomUUID()}` } })
    ).id;
    userId = (
      await prisma.user.create({
        data: { email: `${randomUUID()}@product.test`, tenantId },
      })
    ).id;
    memberId = (
      await prisma.membership.create({
        data: { userId, tenantId, role: 'ADMIN', status: 'ACTIVE' },
      })
    ).id;
    deviceId = (
      await prisma.device.create({
        data: { name: 'fixture', tenantId, status: 'ACTIVE' },
      })
    ).id;
  });
  afterEach(async () => {
    await prisma.deviceMaintenance.deleteMany({ where: { tenantId } });
    await prisma.maintenancePlan.deleteMany({ where: { tenantId } });
    await prisma.device.deleteMany({ where: { tenantId } });
    await prisma.membership.deleteMany({
      where: { tenantId: { in: [tenantId, foreignTenantId] } },
    });
    await prisma.user.deleteMany({
      where: { tenantId: { in: [tenantId, foreignTenantId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantId, foreignTenantId] } },
    });
  });
  afterAll(async () => {
    if (old === undefined) delete process.env.MAINTENANCE_SCHEDULER_ENABLED;
    else process.env.MAINTENANCE_SCHEDULER_ENABLED = old;
    await prisma.$disconnect();
  });
  const now = new Date('2026-10-07T00:00:00Z');
  async function createPlan(reason = 'recurring fixture') {
    return new MaintenancePlanService(prisma as any, audit).create(
      {
        user: {
          userId,
          tenantContext: { tenantId, membershipId: memberId, role: 'ADMIN' },
        },
      } as any,
      {
        deviceId,
        reason,
        intervalHours: 24,
        nextDueAt: new Date(now.getTime() - 86400000).toISOString(),
      },
    );
  }
  it('claims a due occurrence exactly once across simultaneous workers', async () => {
    const plan = await createPlan();
    const [one, two] = await Promise.all([
      new MaintenancePlanService(prisma as any, audit).tick(now),
      new MaintenancePlanService(prisma as any, audit).tick(now),
    ]);
    expect(one.opened + two.opened).toBe(1);
    expect(
      await prisma.deviceMaintenance.count({ where: { planId: plan.id } }),
    ).toBe(1);
    expect(
      await prisma.maintenancePlan.findUnique({ where: { id: plan.id } }),
    ).toMatchObject({ nextDueAt: new Date('2026-10-08T00:00:00Z') });
  });
  it('keeps different plans and concurrent manual requests to one OPEN window per device', async () => {
    await createPlan('one');
    await createPlan('two');
    await Promise.all([
      new MaintenancePlanService(prisma as any, audit).tick(now),
      new MaintenancePlanService(prisma as any, audit).tick(now),
    ]);
    expect(
      await prisma.deviceMaintenance.count({
        where: { tenantId, deviceId, status: 'OPEN' },
      }),
    ).toBe(1);
    await prisma.deviceMaintenance.deleteMany({ where: { tenantId } });
    const manual = new DeviceMaintenanceService(prisma as any, audit);
    const results = await Promise.allSettled([
      manual.openForDevice(
        { tenantId, deviceId, reason: 'one', userId },
        memberId,
      ),
      manual.openForDevice(
        { tenantId, deviceId, reason: 'two', userId },
        memberId,
      ),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
  });
  it('blocks revoked admin recurrence and safely retains plans when membership is deleted', async () => {
    const plan = await createPlan();
    await prisma.membership.delete({ where: { id: memberId } });
    expect(
      await prisma.maintenancePlan.findUnique({ where: { id: plan.id } }),
    ).toMatchObject({ actorMembershipId: null });
    await new MaintenancePlanService(prisma as any, audit).tick(now);
    expect(
      await prisma.maintenancePlan.findUnique({ where: { id: plan.id } }),
    ).toMatchObject({ enabled: false });
    expect(
      await prisma.deviceMaintenance.count({ where: { planId: plan.id } }),
    ).toBe(0);
  });
  it('refuses a recurrence whose actor belongs to another tenant', async () => {
    const foreignUser = await prisma.user.create({
      data: {
        email: `${randomUUID()}@foreign.test`,
        tenantId: foreignTenantId,
      },
    });
    const foreignMember = await prisma.membership.create({
      data: {
        userId: foreignUser.id,
        tenantId: foreignTenantId,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    const plan = await createPlan();
    // The nullable actor relation retains history; worker authority must still be tenant-specific.
    await prisma.maintenancePlan.update({
      where: { id: plan.id },
      data: { actorMembershipId: foreignMember.id },
    });
    await new MaintenancePlanService(prisma as any, audit).tick(now);
    expect(
      await prisma.maintenancePlan.findUnique({ where: { id: plan.id } }),
    ).toMatchObject({ enabled: false });
    expect(
      await prisma.deviceMaintenance.count({ where: { planId: plan.id } }),
    ).toBe(0);
  });
  it('rejects cross-tenant GPS and maintenance writes at the database boundary', async () => {
    await expect(
      prisma.deviceLocation.create({
        data: {
          tenantId: foreignTenantId,
          deviceId,
          latitude: 0,
          longitude: 0,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.deviceMaintenance.create({
        data: {
          tenantId: foreignTenantId,
          deviceId,
          reason: 'foreign',
          openedByUserId: userId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(
      await prisma.deviceLocation.create({
        data: { tenantId, deviceId, latitude: 0, longitude: 0 },
      }),
    ).toMatchObject({ latitude: 0, longitude: 0 });
  });
  it('deduplicates NOC locations before limiting and preserves the latest fix', async () => {
    const second = await prisma.device.create({
      data: { tenantId, name: 'second fixture' },
    });
    await prisma.deviceLocation.createMany({
      data: Array.from({ length: 220 }, (_, index) => ({
        tenantId,
        deviceId,
        latitude: 0,
        longitude: 0,
        recordedAt: new Date(now.getTime() + index * 1000),
      })),
    });
    await prisma.deviceLocation.create({
      data: {
        tenantId,
        deviceId: second.id,
        latitude: -6,
        longitude: 106,
        recordedAt: now,
      },
    });
    const result = await new AdminPlatformObservabilityService(
      prisma as any,
    ).deviceLocations();
    expect(result.truncated).toBe(false);
    expect(result.items).toHaveLength(2);
    expect(
      result.items.find((row) => row.deviceId === deviceId)?.recordedAt,
    ).toEqual(new Date(now.getTime() + 219000));
  });

  it('allows device lifecycle deletion to cascade its plan and planned windows', async () => {
    const plan = await createPlan();
    await new MaintenancePlanService(prisma as any, audit).tick(now);
    await prisma.device.delete({ where: { id: deviceId } });
    expect(await prisma.maintenancePlan.count({ where: { id: plan.id } })).toBe(
      0,
    );
    expect(
      await prisma.deviceMaintenance.count({ where: { planId: plan.id } }),
    ).toBe(0);
  });

  it('preserves device report fields independently from rollout metadata', async () => {
    const report = {
      reportedFirmwareVersion: 'fixture-1.2.3',
      reportedProtocol: 'MQTT_TLS',
      runtimeReportedAt: now,
    };
    await prisma.device.update({ where: { id: deviceId }, data: report });
    expect(
      await prisma.device.findUnique({ where: { id: deviceId } }),
    ).toMatchObject(report);
  });
});
