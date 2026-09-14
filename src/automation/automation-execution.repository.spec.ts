import {
  AutomationActionKind,
  AutomationExecutionActionStatus,
  AutomationExecutionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES,
  AutomationExecutionPersistenceError,
} from './automation-execution.persistence.error';
import { AutomationExecutionRepository } from './automation-execution.repository';
import { ReserveMatchedAutomationExecutionInput } from './automation-execution.persistence.types';

describe('AutomationExecutionRepository', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const automationId = '00000000-0000-4000-8000-000000000002';
  const telemetryId = '00000000-0000-4000-8000-000000000003';
  const triggerDeviceId = '00000000-0000-4000-8000-000000000004';
  const triggerCapabilityId = '00000000-0000-4000-8000-000000000005';
  const actionDeviceId = '00000000-0000-4000-8000-000000000006';
  const actionCapabilityId = '00000000-0000-4000-8000-000000000007';
  const executionId = '00000000-0000-4000-8000-000000000008';
  const priorExecutionId = '00000000-0000-4000-8000-000000000011';
  const occurredAt = new Date('2026-08-03T12:00:00.000Z');
  const databaseNow = new Date('2026-08-03T12:00:01.000Z');

  let transaction: Record<string, any>;
  let prisma: Record<string, any>;
  let repository: AutomationExecutionRepository;
  let cooldownReference: { id: string } | null;

  beforeEach(() => {
    cooldownReference = null;
    transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn((strings: TemplateStringsArray) => {
        const sql = strings.join(' ');
        if (sql.includes('clock_timestamp')) {
          return Promise.resolve([{ databaseNow }]);
        }
        return Promise.resolve([]);
      }),
      automation: {
        findFirst: jest.fn().mockResolvedValue(automationRecord()),
      },
      telemetry: {
        findFirst: jest.fn().mockResolvedValue({
          eventId: 'evt-001',
          payload: { temperature: 31 },
          createdAt: occurredAt,
        }),
      },
      automationExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: executionId }),
        findFirst: jest.fn((args: Record<string, any>) => {
          if (args.select?.id === true && args.include === undefined) {
            return Promise.resolve(cooldownReference);
          }
          return Promise.resolve(executionRecord());
        }),
      },
      automationExecutionAction: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
      automationExecution: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    repository = new AutomationExecutionRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('atomically reserves a matched execution using PostgreSQL time and a zero cooldown snapshot', async () => {
    const result = await repository.reserveMatchedExecution(input());

    expect(result).toMatchObject({
      disposition: 'CREATED',
      execution: {
        id: executionId,
        status: AutomationExecutionStatus.RESERVED,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.automationExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          automationId,
          automationRevision: 3,
          triggerTelemetryId: telemetryId,
          cooldownSeconds: 0,
          cooldownEvaluatedAt: databaseNow,
          cooldownReferenceExecutionId: null,
          status: AutomationExecutionStatus.RESERVED,
          decisionReason: 'CONDITION_MATCHED',
          createdAt: databaseNow,
        }),
      }),
    );
    expect(
      transaction.automationExecutionAction.createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          actionId: 'set-enabled',
          position: 0,
          capabilityId: actionCapabilityId,
          capabilityKey: 'enabled',
          status: AutomationExecutionActionStatus.PENDING,
          createdAt: databaseNow,
          completedAt: null,
        }),
      ],
    });
  });

  it('suppresses a reservation inside the database-authoritative cooldown window', async () => {
    transaction.automation.findFirst.mockResolvedValue(
      automationRecord({ cooldownSeconds: 60 }),
    );
    cooldownReference = { id: priorExecutionId };
    transaction.automationExecution.findFirst.mockImplementation(
      (args: Record<string, any>) => {
        if (args.select?.id === true && args.include === undefined) {
          return Promise.resolve(cooldownReference);
        }
        return Promise.resolve(
          executionRecord({
            status: AutomationExecutionStatus.SUPPRESSED_COOLDOWN,
            decisionReason: 'COOLDOWN_ACTIVE',
            completedAt: databaseNow,
            actionStatus: AutomationExecutionActionStatus.SKIPPED,
            actionErrorCode: 'EXECUTION_SUPPRESSED_COOLDOWN',
            actionCompletedAt: databaseNow,
            cooldownSeconds: 60,
            cooldownEvaluatedAt: databaseNow,
            cooldownReferenceExecutionId: priorExecutionId,
          }),
        );
      },
    );

    const result = await repository.reserveMatchedExecution(input());

    expect(result.execution).toMatchObject({
      status: AutomationExecutionStatus.SUPPRESSED_COOLDOWN,
      decisionReason: 'COOLDOWN_ACTIVE',
      cooldownSeconds: 60,
      cooldownEvaluatedAt: databaseNow,
      cooldownReferenceExecutionId: priorExecutionId,
      completedAt: databaseNow,
    });
    expect(transaction.automationExecution.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          automationId,
          status: {
            in: [
              AutomationExecutionStatus.RESERVED,
              AutomationExecutionStatus.DISPATCHING,
              AutomationExecutionStatus.SUCCEEDED,
              AutomationExecutionStatus.FAILED,
              AutomationExecutionStatus.PARTIALLY_FAILED,
            ],
          },
        }),
        select: { id: true },
      }),
    );
    expect(
      transaction.automationExecutionAction.createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          status: AutomationExecutionActionStatus.SKIPPED,
          errorCode: 'EXECUTION_SUPPRESSED_COOLDOWN',
          createdAt: databaseNow,
          completedAt: databaseNow,
        }),
      ],
    });
  });

  it('persists a valid same-automation ancestry cycle before cooldown evaluation', async () => {
    const cyclicInput = input({
      ancestry: [{ executionId, automationId }],
    });
    transaction.automation.findFirst.mockResolvedValue(
      automationRecord({ cooldownSeconds: 60 }),
    );
    transaction.automationExecution.findFirst.mockResolvedValue(
      executionRecord({
        status: AutomationExecutionStatus.SUPPRESSED_LOOP,
        decisionReason: 'ANCESTRY_CONTAINS_AUTOMATION',
        completedAt: databaseNow,
        ancestry: cyclicInput.ancestry,
        actionStatus: AutomationExecutionActionStatus.SKIPPED,
        actionErrorCode: 'EXECUTION_SUPPRESSED_LOOP',
        actionCompletedAt: databaseNow,
        cooldownSeconds: 60,
        cooldownEvaluatedAt: null,
      }),
    );

    const result = await repository.reserveMatchedExecution(cyclicInput);

    expect(result.execution.status).toBe(
      AutomationExecutionStatus.SUPPRESSED_LOOP,
    );
    expect(transaction.automationExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cooldownSeconds: 60,
          cooldownEvaluatedAt: null,
          cooldownReferenceExecutionId: null,
          status: AutomationExecutionStatus.SUPPRESSED_LOOP,
          decisionReason: 'ANCESTRY_CONTAINS_AUTOMATION',
          completedAt: databaseNow,
        }),
      }),
    );
    expect(
      transaction.automationExecutionAction.createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          status: AutomationExecutionActionStatus.SKIPPED,
          errorCode: 'EXECUTION_SUPPRESSED_LOOP',
          createdAt: databaseNow,
          completedAt: databaseNow,
        }),
      ],
    });
  });

  it('fails closed when persisted cooldown configuration is outside the approved bound', async () => {
    transaction.automation.findFirst.mockResolvedValue(
      automationRecord({ cooldownSeconds: 86401 }),
    );

    await expect(
      repository.reserveMatchedExecution(input()),
    ).rejects.toMatchObject<Partial<AutomationExecutionPersistenceError>>({
      code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.CooldownInvalid,
    });
    expect(transaction.automationExecution.create).not.toHaveBeenCalled();
  });

  it('fails closed when evaluator action intents differ from the approved revision', async () => {
    const mismatch = input({
      actionIntents: [
        {
          actionId: 'set-enabled',
          kind: 'DEVICE_COMMAND',
          deviceId: actionDeviceId,
          capabilityKey: 'enabled',
          value: false,
        },
      ],
    });

    await expect(
      repository.reserveMatchedExecution(mismatch),
    ).rejects.toMatchObject<Partial<AutomationExecutionPersistenceError>>({
      code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.ActionSnapshotMismatch,
    });
    expect(transaction.automationExecution.create).not.toHaveBeenCalled();
  });

  it('returns a previously reserved canonical execution without rereading mutable automation state', async () => {
    prisma.automationExecution.findUnique.mockResolvedValue(executionRecord());

    await expect(
      repository.reserveMatchedExecution(input()),
    ).resolves.toMatchObject({
      disposition: 'REPLAYED',
      execution: { id: executionId },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechecks the canonical identity after taking the database lock', async () => {
    transaction.automationExecution.findUnique.mockResolvedValue(
      executionRecord(),
    );

    await expect(
      repository.reserveMatchedExecution(input()),
    ).resolves.toMatchObject({
      disposition: 'REPLAYED',
      execution: { id: executionId },
    });
    expect(transaction.automation.findFirst).not.toHaveBeenCalled();
    expect(transaction.automationExecution.create).not.toHaveBeenCalled();
  });

  it('returns an equivalent canonical execution as an idempotent replay', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.22.0' },
    );
    prisma.$transaction.mockRejectedValue(uniqueError);
    prisma.automationExecution.findUnique.mockResolvedValue(executionRecord());

    await expect(
      repository.reserveMatchedExecution(input()),
    ).resolves.toMatchObject({
      disposition: 'REPLAYED',
      execution: { id: executionId },
    });
  });

  it('rejects a conflicting replay under the same canonical identity', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.22.0' },
    );
    prisma.$transaction.mockRejectedValue(uniqueError);
    prisma.automationExecution.findUnique.mockResolvedValue(
      executionRecord({ triggerValue: 99 }),
    );

    await expect(
      repository.reserveMatchedExecution(input()),
    ).rejects.toMatchObject<Partial<AutomationExecutionPersistenceError>>({
      code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.IdempotencyConflict,
    });
  });

  function input(
    overrides: Partial<ReserveMatchedAutomationExecutionInput> = {},
  ): ReserveMatchedAutomationExecutionInput {
    return {
      tenantId,
      automationId,
      automationRevision: 3,
      triggerTelemetryId: telemetryId,
      triggerEventId: 'evt-001',
      triggerDeviceId,
      triggerCapabilityId,
      triggerCapabilityKey: 'temperature',
      triggerValue: 31,
      triggerOccurredAt: occurredAt,
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
      ...overrides,
    };
  }

  function automationRecord(overrides: { cooldownSeconds?: number } = {}) {
    return {
      id: automationId,
      tenantId,
      revision: 3,
      enabled: true,
      cooldownSeconds: overrides.cooldownSeconds ?? 0,
      triggerDeviceId,
      triggerCapabilityId,
      triggerCapability: { id: triggerCapabilityId, key: 'temperature' },
      actions: [
        {
          id: '00000000-0000-4000-8000-000000000009',
          actionId: 'set-enabled',
          position: 0,
          kind: AutomationActionKind.DEVICE_COMMAND,
          deviceId: actionDeviceId,
          capabilityId: actionCapabilityId,
          capability: { id: actionCapabilityId, key: 'enabled' },
          value: true,
        },
      ],
    };
  }

  function executionRecord(
    overrides: {
      status?: AutomationExecutionStatus;
      decisionReason?: string;
      ancestry?: readonly unknown[];
      actionStatus?: AutomationExecutionActionStatus;
      actionErrorCode?: string | null;
      actionCompletedAt?: Date | null;
      completedAt?: Date | null;
      triggerValue?: number;
      cooldownSeconds?: number;
      cooldownEvaluatedAt?: Date | null;
      cooldownReferenceExecutionId?: string | null;
    } = {},
  ) {
    return {
      id: executionId,
      tenantId,
      automationId,
      automationRevision: 3,
      triggerTelemetryId: telemetryId,
      triggerEventId: 'evt-001',
      triggerDeviceId,
      triggerCapabilityId,
      triggerCapabilityKey: 'temperature',
      triggerValue: overrides.triggerValue ?? 31,
      triggerOccurredAt: occurredAt,
      ancestry: overrides.ancestry ?? [],
      cooldownSeconds: overrides.cooldownSeconds ?? 0,
      cooldownEvaluatedAt:
        overrides.cooldownEvaluatedAt === undefined
          ? databaseNow
          : overrides.cooldownEvaluatedAt,
      cooldownReferenceExecutionId:
        overrides.cooldownReferenceExecutionId ?? null,
      status: overrides.status ?? AutomationExecutionStatus.RESERVED,
      decisionReason: overrides.decisionReason ?? 'CONDITION_MATCHED',
      dispatchStartedAt: null,
      completedAt: overrides.completedAt ?? null,
      createdAt: databaseNow,
      actions: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          tenantId,
          executionId,
          actionId: 'set-enabled',
          position: 0,
          kind: AutomationActionKind.DEVICE_COMMAND,
          deviceId: actionDeviceId,
          capabilityId: actionCapabilityId,
          capabilityKey: 'enabled',
          value: true,
          status:
            overrides.actionStatus ?? AutomationExecutionActionStatus.PENDING,
          commandId: null,
          errorCode: overrides.actionErrorCode ?? null,
          dispatchStartedAt: null,
          completedAt: overrides.actionCompletedAt ?? null,
          createdAt: databaseNow,
        },
      ],
    };
  }
});
