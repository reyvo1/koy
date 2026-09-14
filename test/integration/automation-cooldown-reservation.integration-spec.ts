import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AutomationExecutionRepository } from '../../src/automation/automation-execution.repository';
import { ReserveMatchedAutomationExecutionInput } from '../../src/automation/automation-execution.persistence.types';
import { AutomationPersistenceInput } from '../../src/automation/automation.persistence.types';
import { AutomationRepository } from '../../src/automation/automation.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('PostgreSQL automation cooldown reservation foundation', () => {
  const prisma = new PrismaClient();
  const automationRepository = new AutomationRepository(
    prisma as unknown as PrismaService,
  );
  const executionRepository = new AutomationExecutionRepository(
    prisma as unknown as PrismaService,
  );

  let tenantId: string;
  let membershipId: string;
  let triggerDeviceId: string;
  let actionDeviceId: string;
  let triggerCapabilityId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const tenant = await prisma.tenant.create({
      data: { name: `automation-cooldown-${randomUUID()}` },
    });
    tenantId = tenant.id;
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
        data: { name: 'Cooldown trigger', tenantId, status: 'ACTIVE' },
      })
    ).id;
    actionDeviceId = (
      await prisma.device.create({
        data: { name: 'Cooldown action', tenantId, status: 'ACTIVE' },
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
        deviceId: actionDeviceId,
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

  it('keeps owner writes fail-closed at zero cooldown until a later configuration contract exists', async () => {
    const created = await automationRepository.createOwnedAutomation(
      automationInput('Normal write cooldown'),
    );

    expect(created.cooldownSeconds).toBe(0);

    await prisma.automation.update({
      where: { id: created.id },
      data: { cooldownSeconds: 60 },
    });
    const replaced = await automationRepository.replaceOwnedAutomation({
      ...automationInput('Normal write cooldown replaced'),
      automationId: created.id,
      expectedRevision: created.revision,
    });

    expect(replaced.cooldownSeconds).toBe(0);
    expect(replaced.enabled).toBe(false);
  });

  it('serializes concurrent events and suppresses one inside the cooldown window', async () => {
    const automation = await createApprovedAutomation(
      'Concurrent cooldown',
      60,
    );
    const firstTelemetry = await createTelemetry(31);
    const secondTelemetry = await createTelemetry(32);

    const results = await Promise.all([
      executionRepository.reserveMatchedExecution(
        input(automation.id, automation.revision, firstTelemetry, 31),
      ),
      executionRepository.reserveMatchedExecution(
        input(automation.id, automation.revision, secondTelemetry, 32),
      ),
    ]);

    const reserved = results.find(
      (result) => result.execution.status === 'RESERVED',
    );
    const suppressed = results.find(
      (result) => result.execution.status === 'SUPPRESSED_COOLDOWN',
    );

    expect(reserved).toBeDefined();
    expect(suppressed?.execution).toMatchObject({
      cooldownSeconds: 60,
      cooldownReferenceExecutionId: reserved?.execution.id,
      decisionReason: 'COOLDOWN_ACTIVE',
      status: 'SUPPRESSED_COOLDOWN',
      completedAt: expect.any(Date),
    });
    expect(suppressed?.execution.cooldownEvaluatedAt).toBeInstanceOf(Date);
    expect(suppressed?.execution.actions).toEqual([
      expect.objectContaining({
        status: 'SKIPPED',
        errorCode: 'EXECUTION_SUPPRESSED_COOLDOWN',
        completedAt: expect.any(Date),
      }),
    ]);
  });

  it('allows independent reservations when the internal cooldown is zero', async () => {
    const automation = await createApprovedAutomation('Zero cooldown', 0);
    const firstTelemetry = await createTelemetry(33);
    const secondTelemetry = await createTelemetry(34);

    const results = await Promise.all([
      executionRepository.reserveMatchedExecution(
        input(automation.id, automation.revision, firstTelemetry, 33),
      ),
      executionRepository.reserveMatchedExecution(
        input(automation.id, automation.revision, secondTelemetry, 34),
      ),
    ]);

    expect(results.map((result) => result.execution.status)).toEqual([
      'RESERVED',
      'RESERVED',
    ]);
    expect(
      results.every(
        (result) =>
          result.execution.cooldownSeconds === 0 &&
          result.execution.cooldownReferenceExecutionId === null,
      ),
    ).toBe(true);
  });

  it('does not let suppressed rows extend the cooldown window and keeps the reference restrictive', async () => {
    const automation = await createApprovedAutomation(
      'Suppression is not a reference',
      60,
    );
    const first = await executionRepository.reserveMatchedExecution(
      input(automation.id, automation.revision, await createTelemetry(35), 35),
    );
    const second = await executionRepository.reserveMatchedExecution(
      input(automation.id, automation.revision, await createTelemetry(36), 36),
    );

    expect(second.execution.status).toBe('SUPPRESSED_COOLDOWN');
    await expect(
      prisma.automationExecution.delete({
        where: { id: first.execution.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    const expired = new Date(Date.now() - 120000);
    await prisma.automationExecution.update({
      where: { id: first.execution.id },
      data: { createdAt: expired, cooldownEvaluatedAt: expired },
    });

    const third = await executionRepository.reserveMatchedExecution(
      input(automation.id, automation.revision, await createTelemetry(37), 37),
    );

    expect(third.execution).toMatchObject({
      status: 'RESERVED',
      decisionReason: 'CONDITION_MATCHED',
      cooldownReferenceExecutionId: null,
    });
  });

  it('replays immutable cooldown evidence without rereading current configuration', async () => {
    const automation = await createApprovedAutomation(
      'Historical cooldown replay',
      60,
    );
    const telemetry = await createTelemetry(38);
    const reservation = input(
      automation.id,
      automation.revision,
      telemetry,
      38,
    );
    const created =
      await executionRepository.reserveMatchedExecution(reservation);

    await prisma.automation.update({
      where: { id: automation.id },
      data: { cooldownSeconds: 0, enabled: false },
    });

    await expect(
      executionRepository.reserveMatchedExecution(reservation),
    ).resolves.toMatchObject({
      disposition: 'REPLAYED',
      execution: {
        id: created.execution.id,
        cooldownSeconds: 60,
      },
    });
  });

  async function createApprovedAutomation(
    name: string,
    cooldownSeconds: number,
  ) {
    const created = await automationRepository.createOwnedAutomation(
      automationInput(name),
    );
    return prisma.automation.update({
      where: { id: created.id },
      data: { enabled: true, cooldownSeconds },
    });
  }

  function automationInput(name: string): AutomationPersistenceInput {
    return {
      tenantId,
      ownerMembershipId: membershipId,
      definition: {
        schemaVersion: '1.0.0',
        name,
        trigger: {
          kind: 'CAPABILITY_REPORTED',
          deviceId: triggerDeviceId,
          capabilityKey: 'temperature',
        },
        condition: { kind: 'ALWAYS' },
        actions: [
          {
            actionId: 'set-enabled',
            kind: 'DEVICE_COMMAND',
            deviceId: actionDeviceId,
            capabilityKey: 'enabled',
            value: true,
          },
        ],
      },
    };
  }

  function createTelemetry(value: number) {
    return prisma.telemetry.create({
      data: {
        tenantId,
        deviceId: triggerDeviceId,
        eventId: `evt-${randomUUID()}`,
        payload: { temperature: value },
      },
    });
  }

  function input(
    automationId: string,
    automationRevision: number,
    telemetry: { id: string; eventId: string; createdAt: Date },
    triggerValue: number,
  ): ReserveMatchedAutomationExecutionInput {
    return {
      tenantId,
      automationId,
      automationRevision,
      triggerTelemetryId: telemetry.id,
      triggerEventId: telemetry.eventId,
      triggerDeviceId,
      triggerCapabilityId,
      triggerCapabilityKey: 'temperature',
      triggerValue,
      triggerOccurredAt: telemetry.createdAt,
      ancestry: [],
      actionIntents: [
        {
          actionId: 'set-enabled',
          kind: 'DEVICE_COMMAND',
          deviceId: actionDeviceId,
          capabilityKey: 'enabled',
          value: true,
        },
      ],
    };
  }
});
