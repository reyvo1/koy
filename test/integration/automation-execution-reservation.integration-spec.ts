import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES,
  AutomationExecutionPersistenceError,
} from '../../src/automation/automation-execution.persistence.error';
import { AutomationExecutionRepository } from '../../src/automation/automation-execution.repository';
import { ReserveMatchedAutomationExecutionInput } from '../../src/automation/automation-execution.persistence.types';
import { AutomationPersistenceInput } from '../../src/automation/automation.persistence.types';
import { AutomationRepository } from '../../src/automation/automation.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PostgreSQL automation execution reservation foundation', () => {
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
  let actionCapabilityId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const tenant = await prisma.tenant.create({
      data: { name: `automation-execution-${randomUUID()}` },
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
        data: { name: 'Execution trigger', tenantId, status: 'ACTIVE' },
      })
    ).id;
    actionDeviceId = (
      await prisma.device.create({
        data: { name: 'Execution action', tenantId, status: 'ACTIVE' },
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
    actionCapabilityId = (
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
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('atomically creates one canonical reservation under concurrent replay', async () => {
    const automation = await createApprovedAutomation('Concurrent reservation');
    const telemetry = await createTelemetry(31);
    const reservation = input(
      automation.id,
      automation.revision,
      telemetry,
      31,
    );

    const results = await Promise.all([
      executionRepository.reserveMatchedExecution(reservation),
      executionRepository.reserveMatchedExecution(reservation),
    ]);

    expect(results.map((result) => result.disposition).sort()).toEqual([
      'CREATED',
      'REPLAYED',
    ]);
    expect(new Set(results.map((result) => result.execution.id)).size).toBe(1);
    expect(results[0].execution).toMatchObject({
      tenantId,
      automationId: automation.id,
      automationRevision: automation.revision,
      triggerTelemetryId: telemetry.id,
      status: 'RESERVED',
      decisionReason: 'CONDITION_MATCHED',
    });
    expect(results[0].execution.actions).toEqual([
      expect.objectContaining({
        actionId: 'set-enabled',
        position: 0,
        deviceId: actionDeviceId,
        capabilityId: actionCapabilityId,
        capabilityKey: 'enabled',
        value: true,
        status: 'PENDING',
      }),
    ]);
    await expect(
      prisma.automationExecution.count({
        where: {
          tenantId,
          automationId: automation.id,
          automationRevision: automation.revision,
          triggerTelemetryId: telemetry.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('fails closed when a replay changes immutable trigger or action evidence', async () => {
    const automation = await createApprovedAutomation(
      'Conflicting reservation',
    );
    const telemetry = await createTelemetry(32);
    const reservation = input(
      automation.id,
      automation.revision,
      telemetry,
      32,
    );
    await executionRepository.reserveMatchedExecution(reservation);

    await expect(
      executionRepository.reserveMatchedExecution({
        ...reservation,
        triggerValue: 99,
      }),
    ).rejects.toMatchObject<Partial<AutomationExecutionPersistenceError>>({
      code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.IdempotencyConflict,
    });
    await expect(
      executionRepository.reserveMatchedExecution({
        ...reservation,
        actionIntents: [{ ...reservation.actionIntents[0], value: false }],
      }),
    ).rejects.toMatchObject<Partial<AutomationExecutionPersistenceError>>({
      code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.IdempotencyConflict,
    });
  });

  it('replays immutable evidence even after the current automation is disabled', async () => {
    const automation = await createApprovedAutomation('Historical replay');
    const telemetry = await createTelemetry(37);
    const reservation = input(
      automation.id,
      automation.revision,
      telemetry,
      37,
    );
    const created =
      await executionRepository.reserveMatchedExecution(reservation);

    await prisma.automation.update({
      where: { id: automation.id },
      data: { enabled: false },
    });

    await expect(
      executionRepository.reserveMatchedExecution(reservation),
    ).resolves.toMatchObject({
      disposition: 'REPLAYED',
      execution: { id: created.execution.id },
    });
  });

  it('persists a same-automation ancestry cycle as a terminal loop suppression', async () => {
    const automation = await createApprovedAutomation('Loop reservation');
    const firstTelemetry = await createTelemetry(33);
    const first = await executionRepository.reserveMatchedExecution(
      input(automation.id, automation.revision, firstTelemetry, 33),
    );
    const secondTelemetry = await createTelemetry(34);

    const suppressed = await executionRepository.reserveMatchedExecution(
      input(automation.id, automation.revision, secondTelemetry, 34, [
        { executionId: first.execution.id, automationId: automation.id },
      ]),
    );

    expect(suppressed.execution).toMatchObject({
      status: 'SUPPRESSED_LOOP',
      decisionReason: 'ANCESTRY_CONTAINS_AUTOMATION',
    });
    expect(suppressed.execution.actions).toEqual([
      expect.objectContaining({ status: 'SKIPPED' }),
    ]);
  });

  it('rejects disabled revisions and mismatched accepted telemetry identity', async () => {
    const automation = await createApprovedAutomation(
      'Fail closed reservation',
    );
    const telemetry = await createTelemetry(35);
    const reservation = input(
      automation.id,
      automation.revision,
      telemetry,
      35,
    );

    await prisma.automation.update({
      where: { id: automation.id },
      data: { enabled: false },
    });
    await expect(
      executionRepository.reserveMatchedExecution(reservation),
    ).rejects.toMatchObject<Partial<AutomationExecutionPersistenceError>>({
      code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.AutomationUnavailable,
    });

    await prisma.automation.update({
      where: { id: automation.id },
      data: { enabled: true },
    });
    await expect(
      executionRepository.reserveMatchedExecution({
        ...reservation,
        triggerEventId: `${telemetry.eventId}-conflict`,
      }),
    ).rejects.toMatchObject<Partial<AutomationExecutionPersistenceError>>({
      code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.TelemetryMismatch,
    });
  });

  it('keeps telemetry, automation, device, and capability evidence restrictive', async () => {
    const automation = await createApprovedAutomation('Restrictive evidence');
    const telemetry = await createTelemetry(36);
    await executionRepository.reserveMatchedExecution(
      input(automation.id, automation.revision, telemetry, 36),
    );

    await expect(
      prisma.telemetry.delete({ where: { id: telemetry.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.automation.delete({ where: { id: automation.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.capability.delete({ where: { id: actionCapabilityId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  async function createApprovedAutomation(name: string) {
    const created = await automationRepository.createOwnedAutomation(
      automationInput(name),
    );
    return prisma.automation.update({
      where: { id: created.id },
      data: { enabled: true },
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
    ancestry: ReserveMatchedAutomationExecutionInput['ancestry'] = [],
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
      ancestry,
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
