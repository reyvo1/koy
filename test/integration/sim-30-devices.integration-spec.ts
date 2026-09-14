import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  AdminOperationalSummaryService,
} from '../../src/admin-operations/admin-operational-summary.service';

jest.setTimeout(60000);

/**
 * G2.2 — multi-device simulation: 30 virtual devices with telemetry and
 * commands. Verifies the bounded operational summary stays responsive
 * (< 2s) and correct under load.
 */
describe('PostgreSQL simulation: 30 virtual devices, dashboard responsiveness', () => {
  const prisma = new PrismaClient();
  const summary = new AdminOperationalSummaryService(
    prisma as unknown as PrismaService,
  );

  let tenantId: string;
  const DEVICE_COUNT = 30;

  beforeAll(async () => {
    await prisma.$connect();

    const tenant = await prisma.tenant.create({
      data: { name: `sim-30-${randomUUID()}` },
    });
    tenantId = tenant.id;

    const devices = Array.from({ length: DEVICE_COUNT }, (_, index) => ({
      name: `Virtual device ${index + 1}`,
      tenantId,
      status: index % 5 === 0 ? ('INACTIVE' as const) : ('ACTIVE' as const),
    }));

    await prisma.device.createMany({ data: devices });
    const created = await prisma.device.findMany({
      where: { tenantId },
      select: { id: true },
    });

    // Telemetry: 24 readings per device (hourly over a day) = 720 rows.
    const now = Date.now();
    const readings = created.flatMap((device, deviceIndex) =>
      Array.from({ length: 24 }, (_, hour) => ({
        eventId: randomUUID(),
        tenantId,
        deviceId: device.id,
        payload: { temperature: 20 + ((deviceIndex + hour) % 10) },
        createdAt: new Date(now - hour * 3600_000),
      })),
    );
    await prisma.telemetry.createMany({ data: readings });

    // Commands: 3 per device, mixed statuses.
    await prisma.deviceCommand.createMany({
      data: created.flatMap((device, index) => [
        {
          correlationId: randomUUID(),
          tenantId,
          deviceId: device.id,
          payload: { enabled: true },
          status: 'ACKNOWLEDGED' as const,
          sentAt: new Date(),
          acknowledgedAt: new Date(),
        },
        {
          correlationId: randomUUID(),
          tenantId,
          deviceId: device.id,
          payload: { enabled: false },
          status: 'SENT' as const,
          sentAt: new Date(),
        },
        {
          correlationId: randomUUID(),
          tenantId,
          deviceId: device.id,
          payload: { enabled: index % 2 === 0 },
          status: 'PENDING' as const,
        },
      ]),
    });
  });

  afterAll(async () => {
    // FK-order cleanup.
    await prisma.deviceCommand.deleteMany({ where: { tenantId } });
    await prisma.telemetry.deleteMany({ where: { tenantId } });
    await prisma.device.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it(`seeds ${DEVICE_COUNT} devices with telemetry and commands`, async () => {
    expect(await prisma.device.count({ where: { tenantId } })).toBe(
      DEVICE_COUNT,
    );
    expect(await prisma.telemetry.count({ where: { tenantId } })).toBe(
      DEVICE_COUNT * 24,
    );
  });

  it('operational summary stays bounded-responsive (< 2s) under load', async () => {
    const started = Date.now();
    const result = await summary.summarize(tenantId);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(2000);
    expect(result.devices.total).toBe(DEVICE_COUNT);
    // 6 of 30 devices are OFFLINE (index % 5 === 0).
    expect(result.devices.byStatus.INACTIVE).toBe(6);
    expect(result.commands.total).toBe(DEVICE_COUNT * 3);
  });

  it('summary remains stable on repeat reads (no unbounded growth)', async () => {
    const first = await summary.summarize(tenantId);
    const second = await summary.summarize(tenantId);
    expect(first.devices.total).toBe(second.devices.total);
    expect(first.commands.total).toBe(second.commands.total);
  });
});
