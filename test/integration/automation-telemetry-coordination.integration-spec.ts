import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AutomationCommandDispatcher } from '../../src/automation/automation-command-dispatcher';
import { AutomationEvaluator } from '../../src/automation/automation-evaluator';
import { AutomationExecutionRepository } from '../../src/automation/automation-execution.repository';
import { AutomationExecutionTransitionRepository } from '../../src/automation/automation-execution-transition.repository';
import { AutomationRuntimeReadRepository } from '../../src/automation/automation-runtime-read.repository';
import { AutomationRetryReservationService } from '../../src/automation/automation-retry-reservation.service';
import { AutomationTelemetryCoordinator } from '../../src/automation/automation-telemetry-coordinator';
import { AutomationPersistenceInput } from '../../src/automation/automation.persistence.types';
import { AutomationRepository } from '../../src/automation/automation.repository';
import { CapabilityValidator } from '../../src/device/capability.validator';
import { CommandService } from '../../src/device/command.service';
import { MqttService } from '../../src/mqtt/mqtt.service';
import { PrismaService } from '../../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('PostgreSQL automation telemetry coordination foundation', () => {
  const prisma = new PrismaClient();
  const mqttPublish = jest.fn();
  const automationRepository = new AutomationRepository(
    prisma as unknown as PrismaService,
  );
  const runtimeReads = new AutomationRuntimeReadRepository(
    prisma as unknown as PrismaService,
  );
  const evaluator = new AutomationEvaluator();
  const executionRepository = new AutomationExecutionRepository(
    prisma as unknown as PrismaService,
  );
  const transitionRepository = new AutomationExecutionTransitionRepository(
    prisma as unknown as PrismaService,
  );
  const commandService = new CommandService(
    prisma as unknown as PrismaService,
    { publish: mqttPublish } as unknown as MqttService,
    new CapabilityValidator(),
  );
  const dispatcher = new AutomationCommandDispatcher(
    transitionRepository,
    commandService,
  );
  const retryReservation = new AutomationRetryReservationService(
    prisma as unknown as PrismaService,
  );
  const coordinator = new AutomationTelemetryCoordinator(
    runtimeReads,
    evaluator,
    executionRepository,
    dispatcher,
    retryReservation,
  );

  let tenantId: string;
  let otherTenantId: string;
  let membershipId: string;
  let triggerDeviceId: string;
  let triggerCapabilityId: string;
  let conditionDeviceId: string;
  let actionDeviceId: string;
  let automationId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const tenant = await prisma.tenant.create({
      data: { name: `automation-coordinate-${randomUUID()}` },
    });
    const otherTenant = await prisma.tenant.create({
      data: { name: `automation-coordinate-other-${randomUUID()}` },
    });
    tenantId = tenant.id;
    otherTenantId = otherTenant.id;
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@example.test`, tenantId },
    });
    membershipId = (
      await prisma.membership.create({
        data: { userId: user.id, tenantId, status: 'ACTIVE' },
      })
    ).id;
    triggerDeviceId = (
      await prisma.device.create({
        data: { name: 'Coordination trigger', tenantId, status: 'ACTIVE' },
      })
    ).id;
    conditionDeviceId = (
      await prisma.device.create({
        data: { name: 'Coordination condition', tenantId, status: 'ACTIVE' },
      })
    ).id;
    actionDeviceId = (
      await prisma.device.create({
        data: { name: 'Coordination action', tenantId, status: 'ACTIVE' },
      })
    ).id;
    triggerCapabilityId = (
      await prisma.capability.create({
        data: {
          deviceId: triggerDeviceId,
          key: 'temperature',
          semanticType: 'temperature',
          dataType: 'number',
          isReadable: true,
          isWritable: false,
          isReportable: true,
        },
      })
    ).id;
    await prisma.capability.create({
      data: {
        deviceId: conditionDeviceId,
        key: 'humidity',
        semanticType: 'humidity',
        dataType: 'number',
        isReadable: true,
        isWritable: false,
        isReportable: true,
      },
    });
    await prisma.capability.create({
      data: {
        deviceId: actionDeviceId,
        key: 'fan',
        semanticType: 'fan',
        dataType: 'boolean',
        isReadable: true,
        isWritable: true,
        isReportable: false,
      },
    });

    const created =
      await automationRepository.createOwnedAutomation(automationInput());
    automationId = created.id;
    await prisma.automation.update({
      where: { id: automationId },
      data: { enabled: true },
    });
  });

  beforeEach(() => {
    mqttPublish.mockReset();
    mqttPublish.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('coordinates exact tenant telemetry, latest values, dispatch, and replay', async () => {
    await prisma.telemetry.create({
      data: {
        tenantId,
        deviceId: conditionDeviceId,
        eventId: `humidity-${randomUUID()}`,
        payload: { humidity: 55 },
      },
    });
    const telemetry = await createTriggerTelemetry(31);

    const first = await coordinator.coordinate(envelope(telemetry));
    const replay = await coordinator.coordinate(envelope(telemetry));

    expect(first).toMatchObject({
      reportCount: 1,
      candidateCount: 1,
      matchedCount: 1,
      reservationCreatedCount: 1,
      dispatchedCount: 1,
      failedCount: 0,
    });
    expect(replay).toMatchObject({
      candidateCount: 1,
      matchedCount: 1,
      reservationReplayedCount: 1,
      dispatchedCount: 0,
      failedCount: 0,
    });
    expect(mqttPublish).toHaveBeenCalledTimes(1);

    const executions = await prisma.automationExecution.findMany({
      where: { tenantId, automationId, triggerTelemetryId: telemetry.id },
      include: { actions: true },
    });
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({ status: 'SUCCEEDED' });
    expect(executions[0].actions).toEqual([
      expect.objectContaining({
        actionId: 'fan-on',
        status: 'SUCCEEDED',
        commandId: expect.any(String),
      }),
    ]);
  });

  it('uses only the latest required value and skips a non-match without reservation', async () => {
    await prisma.telemetry.create({
      data: {
        tenantId,
        deviceId: conditionDeviceId,
        eventId: `humidity-low-${randomUUID()}`,
        payload: { humidity: 20 },
      },
    });
    const telemetry = await createTriggerTelemetry(32);

    const result = await coordinator.coordinate(envelope(telemetry));

    expect(result).toMatchObject({
      candidateCount: 1,
      matchedCount: 0,
      reservationCreatedCount: 0,
      dispatchedCount: 0,
    });
    expect(mqttPublish).not.toHaveBeenCalled();
    await expect(
      prisma.automationExecution.count({
        where: { tenantId, automationId, triggerTelemetryId: telemetry.id },
      }),
    ).resolves.toBe(0);
  });

  it('persists cooldown and ancestry suppression without command dispatch', async () => {
    await prisma.telemetry.create({
      data: {
        tenantId,
        deviceId: conditionDeviceId,
        eventId: `humidity-high-${randomUUID()}`,
        payload: { humidity: 60 },
      },
    });
    await prisma.automation.update({
      where: { id: automationId },
      data: { cooldownSeconds: 0 },
    });
    const baselineTelemetry = await createTriggerTelemetry(30);
    const baseline = await coordinator.coordinate(envelope(baselineTelemetry));
    expect(baseline).toMatchObject({
      matchedCount: 1,
      dispatchedCount: 1,
      failedCount: 0,
    });
    mqttPublish.mockClear();

    await prisma.automation.update({
      where: { id: automationId },
      data: { cooldownSeconds: 60 },
    });
    const cooldownTelemetry = await createTriggerTelemetry(33);
    const cooldown = await coordinator.coordinate(envelope(cooldownTelemetry));
    expect(cooldown).toMatchObject({
      matchedCount: 1,
      suppressedCount: 1,
      dispatchedCount: 0,
    });

    const prior = await prisma.automationExecution.findFirstOrThrow({
      where: {
        tenantId,
        automationId,
        triggerTelemetryId: baselineTelemetry.id,
        status: 'SUCCEEDED',
      },
    });
    await prisma.automation.update({
      where: { id: automationId },
      data: { cooldownSeconds: 0 },
    });
    const loopTelemetry = await createTriggerTelemetry(34);
    const loop = await coordinator.coordinate({
      ...envelope(loopTelemetry),
      origin: 'AUTOMATION_DERIVED',
      ancestry: [{ executionId: prior.id, automationId: prior.automationId }],
    });
    expect(loop).toMatchObject({
      matchedCount: 1,
      suppressedCount: 1,
      dispatchedCount: 0,
    });

    const suppressed = await prisma.automationExecution.findMany({
      where: {
        tenantId,
        automationId,
        triggerTelemetryId: { in: [cooldownTelemetry.id, loopTelemetry.id] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(suppressed.map((item) => item.status)).toEqual([
      'SUPPRESSED_COOLDOWN',
      'SUPPRESSED_LOOP',
    ]);
    expect(mqttPublish).not.toHaveBeenCalled();
  });

  it('rejects a cross-tenant envelope before candidate lookup or execution', async () => {
    const telemetry = await createTriggerTelemetry(35);
    await expect(
      coordinator.coordinate({
        ...envelope(telemetry),
        tenantId: otherTenantId,
      }),
    ).rejects.toMatchObject({
      code: 'AUTOMATION_RUNTIME_READ_TELEMETRY_MISMATCH',
    });
    await expect(
      prisma.automationExecution.count({
        where: { triggerTelemetryId: telemetry.id },
      }),
    ).resolves.toBe(0);
  });

  function createTriggerTelemetry(value: number) {
    return prisma.telemetry.create({
      data: {
        tenantId,
        deviceId: triggerDeviceId,
        eventId: `temperature-${randomUUID()}`,
        payload: { temperature: value },
      },
    });
  }

  function envelope(telemetry: {
    id: string;
    eventId: string;
    createdAt: Date;
    payload: unknown;
  }) {
    return {
      tenantId,
      telemetryId: telemetry.id,
      deviceId: triggerDeviceId,
      eventId: telemetry.eventId,
      occurredAt: telemetry.createdAt,
      origin: 'EXTERNAL_ACCEPTED' as const,
      ancestry: [],
      reports: [
        {
          capabilityId: triggerCapabilityId,
          capabilityKey: 'temperature',
          value: (telemetry.payload as { temperature: number }).temperature,
        },
      ],
    };
  }

  function automationInput(): AutomationPersistenceInput {
    return {
      tenantId,
      ownerMembershipId: membershipId,
      definition: {
        schemaVersion: '1.0.0',
        name: 'Telemetry coordination integration',
        trigger: {
          kind: 'CAPABILITY_REPORTED',
          deviceId: triggerDeviceId,
          capabilityKey: 'temperature',
        },
        condition: {
          kind: 'COMPARE',
          left: {
            source: 'LATEST_CAPABILITY_VALUE',
            deviceId: conditionDeviceId,
            capabilityKey: 'humidity',
          },
          operator: 'GREATER_THAN',
          right: 40,
        },
        actions: [
          {
            actionId: 'fan-on',
            kind: 'DEVICE_COMMAND',
            deviceId: actionDeviceId,
            capabilityKey: 'fan',
            value: true,
          },
        ],
      },
    };
  }
});
