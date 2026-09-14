import { randomUUID } from 'node:crypto';
import { CommandStatus, PrismaClient } from '@prisma/client';
import {
  automationActionCommandIdempotencyKey,
  AutomationExecutionTransitionRepository,
} from '../../src/automation/automation-execution-transition.repository';
import { AutomationExecutionRepository } from '../../src/automation/automation-execution.repository';
import { ReserveMatchedAutomationExecutionInput } from '../../src/automation/automation-execution.persistence.types';
import { AutomationPersistenceInput } from '../../src/automation/automation.persistence.types';
import { AutomationRepository } from '../../src/automation/automation.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('PostgreSQL automation action-state transition foundation', () => {
  const prisma = new PrismaClient();
  const automationRepository = new AutomationRepository(
    prisma as unknown as PrismaService,
  );
  const executionRepository = new AutomationExecutionRepository(
    prisma as unknown as PrismaService,
  );
  const transitionRepository = new AutomationExecutionTransitionRepository(
    prisma as unknown as PrismaService,
  );

  let tenantId: string;
  let membershipId: string;
  let triggerDeviceId: string;
  let triggerCapabilityId: string;
  let firstActionDeviceId: string;
  let secondActionDeviceId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const tenant = await prisma.tenant.create({
      data: { name: `automation-transition-${randomUUID()}` },
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
        data: { name: 'Transition trigger', tenantId, status: 'ACTIVE' },
      })
    ).id;
    firstActionDeviceId = (
      await prisma.device.create({
        data: { name: 'Transition action one', tenantId, status: 'ACTIVE' },
      })
    ).id;
    secondActionDeviceId = (
      await prisma.device.create({
        data: { name: 'Transition action two', tenantId, status: 'ACTIVE' },
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
    for (const deviceId of [firstActionDeviceId, secondActionDeviceId]) {
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
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('serializes concurrent claims and returns one replay of the same active action', async () => {
    const execution = await reserveTwoActionExecution('Concurrent claim');

    const results = await Promise.all([
      transitionRepository.claimNextPendingAction({
        tenantId,
        executionId: execution.id,
      }),
      transitionRepository.claimNextPendingAction({
        tenantId,
        executionId: execution.id,
      }),
    ]);

    expect(results.map((result) => result.disposition).sort()).toEqual([
      'APPLIED',
      'REPLAYED',
    ]);
    expect(new Set(results.map((result) => result.action.id)).size).toBe(1);
    expect(results[0].action.actionId).toBe('first-action');
  });

  it('persists sequential success and finalizes the execution only after the last action', async () => {
    const execution = await reserveTwoActionExecution('Sequential success');
    const first = await transitionRepository.claimNextPendingAction({
      tenantId,
      executionId: execution.id,
    });
    const firstCommand = await createCommand(
      execution.id,
      first.action.actionId,
      first.action.deviceId,
      CommandStatus.SENT,
    );
    const firstCompleted = await transitionRepository.recordActionSucceeded({
      tenantId,
      executionId: execution.id,
      actionId: first.action.actionId,
      commandId: firstCommand.id,
    });

    expect(firstCompleted.execution.status).toBe('DISPATCHING');
    expect(firstCompleted.action.status).toBe('SUCCEEDED');
    expect(firstCompleted.action.completedAt).toBeInstanceOf(Date);

    const second = await transitionRepository.claimNextPendingAction({
      tenantId,
      executionId: execution.id,
    });
    expect(second.action.actionId).toBe('second-action');
    const secondCommand = await createCommand(
      execution.id,
      second.action.actionId,
      second.action.deviceId,
      CommandStatus.ACKNOWLEDGED,
    );
    const completed = await transitionRepository.recordActionSucceeded({
      tenantId,
      executionId: execution.id,
      actionId: second.action.actionId,
      commandId: secondCommand.id,
    });

    expect(completed.execution.status).toBe('SUCCEEDED');
    expect(completed.execution.dispatchStartedAt).toBeInstanceOf(Date);
    expect(completed.execution.completedAt).toBeInstanceOf(Date);
    expect(completed.execution.actions.map((action) => action.status)).toEqual([
      'SUCCEEDED',
      'SUCCEEDED',
    ]);
  });

  it('records the first dispatch failure, skips later actions, and replays equivalent terminal evidence', async () => {
    const execution = await reserveTwoActionExecution('First failure');
    const claimed = await transitionRepository.claimNextPendingAction({
      tenantId,
      executionId: execution.id,
    });
    const command = await createCommand(
      execution.id,
      claimed.action.actionId,
      claimed.action.deviceId,
      CommandStatus.FAILED,
    );
    const failed = await transitionRepository.recordActionFailed({
      tenantId,
      executionId: execution.id,
      actionId: claimed.action.actionId,
      commandId: command.id,
      errorCode: 'COMMAND_PUBLISH_FAILED',
    });

    expect(failed.execution.status).toBe('FAILED');
    expect(failed.execution.actions).toEqual([
      expect.objectContaining({
        status: 'FAILED',
        errorCode: 'COMMAND_PUBLISH_FAILED',
        commandId: command.id,
      }),
      expect.objectContaining({
        status: 'SKIPPED',
        errorCode: 'PRIOR_ACTION_FAILED',
        commandId: null,
      }),
    ]);

    await expect(
      transitionRepository.recordActionFailed({
        tenantId,
        executionId: execution.id,
        actionId: claimed.action.actionId,
        commandId: command.id,
        errorCode: 'COMMAND_PUBLISH_FAILED',
      }),
    ).resolves.toMatchObject({ disposition: 'REPLAYED' });
  });

  it('records PARTIALLY_FAILED after a successful earlier action and rejects suppressed execution claims', async () => {
    const execution = await reserveTwoActionExecution('Partial failure');
    const first = await transitionRepository.claimNextPendingAction({
      tenantId,
      executionId: execution.id,
    });
    const firstCommand = await createCommand(
      execution.id,
      first.action.actionId,
      first.action.deviceId,
      CommandStatus.SENT,
    );
    await transitionRepository.recordActionSucceeded({
      tenantId,
      executionId: execution.id,
      actionId: first.action.actionId,
      commandId: firstCommand.id,
    });
    const second = await transitionRepository.claimNextPendingAction({
      tenantId,
      executionId: execution.id,
    });
    const partial = await transitionRepository.recordActionFailed({
      tenantId,
      executionId: execution.id,
      actionId: second.action.actionId,
      errorCode: 'CAPABILITY_REJECTED',
    });

    expect(partial.execution.status).toBe('PARTIALLY_FAILED');
    await prisma.deviceCommand.update({
      where: { id: firstCommand.id },
      data: { status: CommandStatus.TIMED_OUT },
    });
    await expect(
      transitionRepository.recordActionSucceeded({
        tenantId,
        executionId: execution.id,
        actionId: first.action.actionId,
        commandId: firstCommand.id,
      }),
    ).resolves.toMatchObject({
      disposition: 'REPLAYED',
      execution: { status: 'PARTIALLY_FAILED' },
      action: { status: 'SUCCEEDED' },
    });

    const suppressedAutomation = await createApprovedAutomation(
      'Suppressed transition',
      60,
    );
    await reserveExecution(suppressedAutomation, 51);
    const suppressed = await reserveExecution(suppressedAutomation, 52);
    expect(suppressed.status).toBe('SUPPRESSED_COOLDOWN');
    expect(suppressed.completedAt).toBeInstanceOf(Date);
    expect(suppressed.actions).toEqual([
      expect.objectContaining({
        status: 'SKIPPED',
        errorCode: 'EXECUTION_SUPPRESSED_COOLDOWN',
        completedAt: expect.any(Date),
      }),
      expect.objectContaining({
        status: 'SKIPPED',
        errorCode: 'EXECUTION_SUPPRESSED_COOLDOWN',
        completedAt: expect.any(Date),
      }),
    ]);
    for (const action of suppressed.actions) {
      expect(action.completedAt!.getTime()).toBeGreaterThanOrEqual(
        action.createdAt.getTime(),
      );
    }
    await expect(
      transitionRepository.claimNextPendingAction({
        tenantId,
        executionId: suppressed.id,
      }),
    ).rejects.toMatchObject({
      code: 'AUTOMATION_EXECUTION_TRANSITION_CONFLICT',
    });
  });

  async function reserveTwoActionExecution(name: string) {
    const automation = await createApprovedAutomation(name, 0);
    return reserveExecution(automation, 40);
  }

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

  async function reserveExecution(
    automation: { id: string; revision: number },
    value: number,
  ) {
    const telemetry = await prisma.telemetry.create({
      data: {
        tenantId,
        deviceId: triggerDeviceId,
        eventId: `evt-${randomUUID()}`,
        payload: { temperature: value },
      },
    });
    return (
      await executionRepository.reserveMatchedExecution(
        reservationInput(automation, telemetry, value),
      )
    ).execution;
  }

  function reservationInput(
    automation: { id: string; revision: number },
    telemetry: { id: string; eventId: string; createdAt: Date },
    value: number,
  ): ReserveMatchedAutomationExecutionInput {
    return {
      tenantId,
      automationId: automation.id,
      automationRevision: automation.revision,
      triggerTelemetryId: telemetry.id,
      triggerEventId: telemetry.eventId,
      triggerDeviceId,
      triggerCapabilityId,
      triggerCapabilityKey: 'temperature',
      triggerValue: value,
      triggerOccurredAt: telemetry.createdAt,
      ancestry: [],
      actionIntents: [
        {
          actionId: 'first-action',
          kind: 'DEVICE_COMMAND',
          deviceId: firstActionDeviceId,
          capabilityKey: 'enabled',
          value: true,
        },
        {
          actionId: 'second-action',
          kind: 'DEVICE_COMMAND',
          deviceId: secondActionDeviceId,
          capabilityKey: 'enabled',
          value: false,
        },
      ],
    };
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
            actionId: 'first-action',
            kind: 'DEVICE_COMMAND',
            deviceId: firstActionDeviceId,
            capabilityKey: 'enabled',
            value: true,
          },
          {
            actionId: 'second-action',
            kind: 'DEVICE_COMMAND',
            deviceId: secondActionDeviceId,
            capabilityKey: 'enabled',
            value: false,
          },
        ],
      },
    };
  }

  function createCommand(
    executionId: string,
    actionId: string,
    deviceId: string,
    status: CommandStatus,
  ) {
    return prisma.deviceCommand.create({
      data: {
        tenantId,
        deviceId,
        payload: { enabled: actionId === 'first-action' },
        idempotencyKey: automationActionCommandIdempotencyKey(
          executionId,
          actionId,
        ),
        status,
        ...(status === CommandStatus.SENT ||
        status === CommandStatus.ACKNOWLEDGED
          ? { sentAt: new Date() }
          : {}),
        ...(status === CommandStatus.ACKNOWLEDGED
          ? { acknowledgedAt: new Date() }
          : {}),
      },
    });
  }
});
