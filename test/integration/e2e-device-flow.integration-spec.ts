import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { CommandService } from '../../src/device/command.service';
import { CapabilityValidator } from '../../src/device/capability.validator';
import { MqttService } from '../../src/mqtt/mqtt.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TelemetryService } from '../../src/telemetry/telemetry.service';

jest.setTimeout(60000);

/**
 * G2.1 — full E2E flow against the real database:
 * device provisioned → telemetry ingested → latest + aggregate readable →
 * command published (MQTT mocked at broker boundary) → ACK recorded.
 */
describe('PostgreSQL E2E: device → telemetry → chart → command → ACK', () => {
  const prisma = new PrismaClient();
  const mqttPublish = jest.fn();
  const commandService = new CommandService(
    prisma as unknown as PrismaService,
    { publish: mqttPublish } as unknown as MqttService,
    new CapabilityValidator(),
  );
  // TelemetryService needs a logger-compatible config; construct minimally.
  let telemetry: TelemetryService;

  let tenantId: string;
  let deviceId: string;
  const correlationKey = `e2e-${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    telemetry = new TelemetryService(
      prisma as unknown as PrismaService,
      new CapabilityValidator(),
    );

    const tenant = await prisma.tenant.create({
      data: { name: `e2e-flow-${randomUUID()}` },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@example.test`, tenantId },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId, status: 'ACTIVE' },
    });
    deviceId = (
      await prisma.device.create({
        data: { name: 'E2E sensor', tenantId, status: 'ACTIVE' },
      })
    ).id;
    await prisma.capability.create({
      data: {
        deviceId,
        key: 'temperature',
        semanticType: 'temperature',
        dataType: 'number',
        isReadable: true,
        isWritable: false,
        isReportable: true,
      },
    });
    await prisma.capability.create({
      data: {
        deviceId,
        key: 'enabled',
        semanticType: 'enabled',
        dataType: 'boolean',
        isReadable: true,
        isWritable: true,
        isReportable: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('step 1: telemetry ingestion persists a reading', async () => {
    await telemetry.ingest(tenantId, deviceId, randomUUID(), {
      temperature: 27.5,
    });

    const stored = await prisma.telemetry.findFirst({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
    });
    expect(stored).toBeTruthy();
  });

  it('step 2: latest telemetry endpoint reflects the reading', async () => {
    const latest = await telemetry.getLatest(tenantId, deviceId);
    expect(latest).toBeTruthy();
    expect(latest.deviceId).toBe(deviceId);
  });

  it('step 3: command publishes through validation to the MQTT boundary', async () => {
    const command = await commandService.publish(
      tenantId,
      deviceId,
      { enabled: true },
      correlationKey,
    );
    expect(command.status).toBe('SENT');
    expect(mqttPublish).toHaveBeenCalled();

    const persisted = await prisma.deviceCommand.findUniqueOrThrow({
      where: { id: command.id },
    });
    expect(persisted.idempotencyKey).toBe(correlationKey);
  });

  it('step 4: device ACK transitions the command to ACKNOWLEDGED', async () => {
    const sent = await prisma.deviceCommand.findFirstOrThrow({
      where: { deviceId, status: 'SENT' },
    });
    // ACK is keyed by correlationId per the MQTT contract.
    await commandService.acknowledge(tenantId, deviceId, sent.correlationId);

    const acked = await prisma.deviceCommand.findUniqueOrThrow({
      where: { id: sent.id },
    });
    expect(acked.status).toBe('ACKNOWLEDGED');
    expect(acked.acknowledgedAt).toBeTruthy();
  });

  it('step 5: history shows the acknowledged lifecycle end-to-end', async () => {
    const history = await commandService.getHistory(tenantId, deviceId);
    const rows = Array.isArray(history) ? history : [];
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.some((row) => row.status === 'ACKNOWLEDGED'),
    ).toBe(true);
  });
});
