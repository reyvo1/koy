import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AutomationCommandDispatcher } from '../../src/automation/automation-command-dispatcher';
import { AutomationExecutionRepository } from '../../src/automation/automation-execution.repository';
import { ReserveMatchedAutomationExecutionInput } from '../../src/automation/automation-execution.persistence.types';
import { AutomationExecutionTransitionRepository } from '../../src/automation/automation-execution-transition.repository';
import { AutomationPersistenceInput } from '../../src/automation/automation.persistence.types';
import { AutomationRepository } from '../../src/automation/automation.repository';
import { CapabilityValidator } from '../../src/device/capability.validator';
import { CommandService } from '../../src/device/command.service';
import { MqttService } from '../../src/mqtt/mqtt.service';
import { PrismaService } from '../../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('PostgreSQL automation command dispatch foundation', () => {
  const prisma = new PrismaClient();
  const mqttPublish = jest.fn();
  const automationRepository = new AutomationRepository(
    prisma as unknown as PrismaService,
  );
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

  let tenantId: string;
  let membershipId: string;
  let triggerDeviceId: string;
  let triggerCapabilityId: string;
  let firstActionDeviceId: string;
  let secondActionDeviceId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const tenant = await prisma.tenant.create({
      data: { name: `automation-dispatch-${randomUUID()}` },
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
        data: { name: 'Dispatch trigger', tenantId, status: 'ACTIVE' },
      })
    ).id;
    firstActionDeviceId = (
      await prisma.device.create({
        data: { name: 'Dispatch action one', tenantId, status: 'ACTIVE' },
      })
    ).id;
    secondActionDeviceId = (
      await prisma.device.create({
        data: { name: 'Dispatch action two', tenantId, status: 'ACTIVE' },
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

  beforeEach(() => {
    mqttPublish.mockReset();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('dispatches ordered actions through CommandService and binds exact command identities', async () => {
    mqttPublish.mockResolvedValue(undefined);
    const execution = await reserveTwoActionExecution('Dispatch success');

    const result = await dispatcher.dispatchExecution({
      tenantId,
      executionId: execution.id,
    });

    expect(result.execution.status).toBe('SUCCEEDED');
    expect(result.processedActionCount).toBe(2);
    expect(mqttPublish).toHaveBeenCalledTimes(2);

    const commands = await prisma.deviceCommand.findMany({
      where: {
        tenantId,
        id: { in: result.execution.actions.map((action) => action.commandId!) },
      },
    });
    expect(commands).toHaveLength(2);
    const commandsById = new Map(
      commands.map((command) => [command.id, command]),
    );
    expect(
      result.execution.actions.map((action) => {
        const command = commandsById.get(action.commandId!);
        return {
          actionId: action.actionId,
          actionStatus: action.status,
          commandId: action.commandId,
          idempotencyKey: command?.idempotencyKey,
          payload: command?.payload,
          commandStatus: command?.status,
        };
      }),
    ).toEqual([
      {
        actionId: 'first-action',
        actionStatus: 'SUCCEEDED',
        commandId: expect.any(String),
        idempotencyKey: `automation:${execution.id}:first-action`,
        payload: { enabled: true },
        commandStatus: 'SENT',
      },
      {
        actionId: 'second-action',
        actionStatus: 'SUCCEEDED',
        commandId: expect.any(String),
        idempotencyKey: `automation:${execution.id}:second-action`,
        payload: { enabled: false },
        commandStatus: 'SENT',
      },
    ]);
    expect(result.execution.actions.map((action) => action.commandId)).toEqual(
      expect.arrayContaining(commands.map((command) => command.id)),
    );
  });

  it('replays an already-created command without publishing it a second time', async () => {
    mqttPublish.mockResolvedValue(undefined);
    const execution = await reserveTwoActionExecution('Dispatch replay');
    const claimed = await transitionRepository.claimNextPendingAction({
      tenantId,
      executionId: execution.id,
    });
    const firstCommand = await commandService.publish(
      tenantId,
      claimed.action.deviceId,
      { enabled: true },
      `automation:${execution.id}:first-action`,
    );
    expect(mqttPublish).toHaveBeenCalledTimes(1);
    mqttPublish.mockClear();

    const result = await dispatcher.dispatchExecution({
      tenantId,
      executionId: execution.id,
    });

    expect(result.execution.status).toBe('SUCCEEDED');
    expect(result.execution.actions[0]).toMatchObject({
      actionId: 'first-action',
      status: 'SUCCEEDED',
      commandId: firstCommand.id,
    });
    expect(mqttPublish).toHaveBeenCalledTimes(1);
    expect(mqttPublish).toHaveBeenCalledWith(
      `tenants/${tenantId}/devices/${secondActionDeviceId}/commands`,
      expect.objectContaining({ payload: { enabled: false } }),
    );
  });

  it('recovers a failed command identity and stops after the first failed action', async () => {
    mqttPublish
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('broker unavailable'));
    const execution = await reserveTwoActionExecution('Dispatch failure');

    const result = await dispatcher.dispatchExecution({
      tenantId,
      executionId: execution.id,
    });

    expect(result.execution.status).toBe('PARTIALLY_FAILED');
    expect(result.processedActionCount).toBe(2);
    expect(mqttPublish).toHaveBeenCalledTimes(2);
    expect(result.execution.actions).toEqual([
      expect.objectContaining({
        actionId: 'first-action',
        status: 'SUCCEEDED',
        commandId: expect.any(String),
      }),
      expect.objectContaining({
        actionId: 'second-action',
        status: 'FAILED',
        commandId: expect.any(String),
        errorCode: 'COMMAND_PUBLISH_FAILED',
      }),
    ]);

    const failedCommand = await prisma.deviceCommand.findUniqueOrThrow({
      where: { id: result.execution.actions[1].commandId! },
    });
    expect(failedCommand).toMatchObject({
      tenantId,
      deviceId: secondActionDeviceId,
      idempotencyKey: `automation:${execution.id}:second-action`,
      payload: { enabled: false },
      status: 'FAILED',
    });
  });

  async function reserveTwoActionExecution(name: string) {
    const created = await automationRepository.createOwnedAutomation(
      automationInput(name),
    );
    const automation = await prisma.automation.update({
      where: { id: created.id },
      data: { enabled: true },
    });
    const telemetry = await prisma.telemetry.create({
      data: {
        tenantId,
        deviceId: triggerDeviceId,
        eventId: `evt-${randomUUID()}`,
        payload: { temperature: 42 },
      },
    });

    return (
      await executionRepository.reserveMatchedExecution(
        reservationInput(automation, telemetry),
      )
    ).execution;
  }

  function reservationInput(
    automation: { id: string; revision: number },
    telemetry: { id: string; eventId: string; createdAt: Date },
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
      triggerValue: 42,
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
});
