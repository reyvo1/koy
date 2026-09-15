import { DomainBadRequestException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { CommandService } from '../device/command.service';
import {
  AUTOMATION_COMMAND_DISPATCH_ERROR_CODES,
  AutomationCommandDispatcher,
} from './automation-command-dispatcher';
import {
  AutomationExecutionTransitionAction,
  AutomationExecutionTransitionRecord,
  AutomationExecutionTransitionRepository,
} from './automation-execution-transition.repository';

const identity = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  executionId: '22222222-2222-4222-8222-222222222222',
};

const action = (
  actionId: string,
  position = 0,
): AutomationExecutionTransitionAction =>
  ({
    id: `row-${actionId}`,
    tenantId: identity.tenantId,
    executionId: identity.executionId,
    actionId,
    position,
    kind: 'DEVICE_COMMAND',
    deviceId: `device-${position}`,
    capabilityId: `capability-${position}`,
    capabilityKey: 'enabled',
    value: position % 2 === 0,
    status: 'DISPATCHING',
    commandId: null,
    errorCode: null,
    dispatchAttemptCount: 1,
    retryNextEligibleAt: null,
    dispatchStartedAt: new Date('2026-08-05T00:00:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
  }) as unknown as AutomationExecutionTransitionAction;

const execution = (
  status: 'DISPATCHING' | 'SUCCEEDED' | 'FAILED' | 'PARTIALLY_FAILED',
): AutomationExecutionTransitionRecord =>
  ({
    id: identity.executionId,
    tenantId: identity.tenantId,
    status,
    actions: [],
  }) as unknown as AutomationExecutionTransitionRecord;

describe('AutomationCommandDispatcher', () => {
  let transitions: {
    claimNextPendingAction: jest.Mock;
    recordActionSucceeded: jest.Mock;
    recordActionFailed: jest.Mock;
  };
  let commands: {
    publish: jest.Mock;
    retryPublish: jest.Mock;
    findTenantDeviceCommandByIdempotencyKey: jest.Mock;
  };
  let dispatcher: AutomationCommandDispatcher;

  beforeEach(() => {
    transitions = {
      claimNextPendingAction: jest.fn(),
      recordActionSucceeded: jest.fn(),
      recordActionFailed: jest.fn(),
    };
    commands = {
      publish: jest.fn(),
      retryPublish: jest.fn(),
      findTenantDeviceCommandByIdempotencyKey: jest.fn(),
    };
    dispatcher = new AutomationCommandDispatcher(
      transitions as unknown as AutomationExecutionTransitionRepository,
      commands as unknown as CommandService,
    );
  });

  it('dispatches one action through CommandService with deterministic idempotency', async () => {
    const claimed = action('first-action');
    transitions.claimNextPendingAction.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('DISPATCHING'),
      action: claimed,
    });
    commands.publish.mockResolvedValue({ id: 'command-1', status: 'SENT' });
    transitions.recordActionSucceeded.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('SUCCEEDED'),
      action: claimed,
    });

    await expect(dispatcher.dispatchExecution(identity)).resolves.toMatchObject(
      {
        execution: { status: 'SUCCEEDED' },
        processedActionCount: 1,
      },
    );
    expect(commands.publish).toHaveBeenCalledWith(
      identity.tenantId,
      claimed.deviceId,
      { enabled: true },
      `automation:${identity.executionId}:first-action`,
    );
    expect(transitions.recordActionSucceeded).toHaveBeenCalledWith({
      ...identity,
      actionId: 'first-action',
      commandId: 'command-1',
    });
  });

  it('re-publishes the same durable command identity on a claimed retry attempt', async () => {
    const claimed = action('first-action') as AutomationExecutionTransitionAction & { dispatchAttemptCount: number };
    claimed.dispatchAttemptCount = 2;
    transitions.claimNextPendingAction.mockResolvedValue({
      disposition: 'REPLAYED',
      execution: execution('DISPATCHING'),
      action: claimed,
    });
    commands.retryPublish.mockResolvedValue({ id: 'command-1', status: 'SENT' });
    transitions.recordActionSucceeded.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('SUCCEEDED'),
      action: claimed,
    });

    await dispatcher.dispatchExecution(identity);

    expect(commands.publish).not.toHaveBeenCalled();
    expect(commands.retryPublish).toHaveBeenCalledWith(
      identity.tenantId,
      claimed.deviceId,
      { enabled: true },
      `automation:${identity.executionId}:first-action`,
    );
  });

  it('completes an idempotent replay without publishing a second command', async () => {
    const claimed = action('first-action');
    transitions.claimNextPendingAction.mockResolvedValue({
      disposition: 'REPLAYED',
      execution: execution('DISPATCHING'),
      action: claimed,
    });
    commands.publish.mockResolvedValue({ id: 'command-1', status: 'SENT' });
    transitions.recordActionSucceeded.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('SUCCEEDED'),
      action: claimed,
    });

    await dispatcher.dispatchExecution(identity);

    expect(commands.publish).toHaveBeenCalledTimes(1);
    expect(commands.publish).toHaveBeenCalledWith(
      identity.tenantId,
      claimed.deviceId,
      { enabled: true },
      `automation:${identity.executionId}:first-action`,
    );
  });

  it('recovers a failed command identity after CommandService publish failure', async () => {
    const claimed = action('first-action');
    transitions.claimNextPendingAction.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('DISPATCHING'),
      action: claimed,
    });
    commands.publish.mockRejectedValue(
      new DomainBadRequestException(
        ERROR_CODES.CommandPublishFailed,
        'Failed to publish command',
      ),
    );
    commands.findTenantDeviceCommandByIdempotencyKey.mockResolvedValue({
      id: 'command-failed',
      status: 'FAILED',
    });
    transitions.recordActionFailed.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('FAILED'),
      action: claimed,
    });

    await dispatcher.dispatchExecution(identity);

    expect(
      commands.findTenantDeviceCommandByIdempotencyKey,
    ).toHaveBeenCalledWith(
      identity.tenantId,
      claimed.deviceId,
      `automation:${identity.executionId}:first-action`,
    );
    expect(transitions.recordActionFailed).toHaveBeenCalledWith({
      ...identity,
      actionId: 'first-action',
      commandId: 'command-failed',
      errorCode: ERROR_CODES.CommandPublishFailed,
    });
  });

  it('records a bounded domain rejection without inventing a command identity', async () => {
    const claimed = action('first-action');
    transitions.claimNextPendingAction.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('DISPATCHING'),
      action: claimed,
    });
    commands.publish.mockRejectedValue(
      new DomainBadRequestException(
        ERROR_CODES.CommandCapabilityNotWritable,
        'Capability is not writable',
      ),
    );
    commands.findTenantDeviceCommandByIdempotencyKey.mockResolvedValue(null);
    transitions.recordActionFailed.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('FAILED'),
      action: claimed,
    });

    await dispatcher.dispatchExecution(identity);

    expect(transitions.recordActionFailed).toHaveBeenCalledWith({
      ...identity,
      actionId: 'first-action',
      errorCode: ERROR_CODES.CommandCapabilityNotWritable,
    });
  });

  it('normalizes unexpected failures and stops after the first failed action', async () => {
    const first = action('first-action', 0);
    transitions.claimNextPendingAction.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('DISPATCHING'),
      action: first,
    });
    commands.publish.mockRejectedValue(new Error('unexpected'));
    commands.findTenantDeviceCommandByIdempotencyKey.mockResolvedValue(null);
    transitions.recordActionFailed.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('FAILED'),
      action: first,
    });

    await dispatcher.dispatchExecution(identity);

    expect(transitions.claimNextPendingAction).toHaveBeenCalledTimes(1);
    expect(commands.publish).toHaveBeenCalledTimes(1);
    expect(transitions.recordActionFailed).toHaveBeenCalledWith({
      ...identity,
      actionId: 'first-action',
      errorCode: AUTOMATION_COMMAND_DISPATCH_ERROR_CODES.Unexpected,
    });
  });

  it('continues in persisted order and stops on a later failure', async () => {
    const first = action('first-action', 0);
    const second = action('second-action', 1);
    transitions.claimNextPendingAction
      .mockResolvedValueOnce({
        disposition: 'APPLIED',
        execution: execution('DISPATCHING'),
        action: first,
      })
      .mockResolvedValueOnce({
        disposition: 'APPLIED',
        execution: execution('DISPATCHING'),
        action: second,
      });
    commands.publish
      .mockResolvedValueOnce({ id: 'command-1', status: 'SENT' })
      .mockRejectedValueOnce(
        new DomainBadRequestException(
          ERROR_CODES.CommandPublishFailed,
          'Failed to publish command',
        ),
      );
    commands.findTenantDeviceCommandByIdempotencyKey.mockResolvedValue({
      id: 'command-2',
      status: 'FAILED',
    });
    transitions.recordActionSucceeded.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('DISPATCHING'),
      action: first,
    });
    transitions.recordActionFailed.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('PARTIALLY_FAILED'),
      action: second,
    });

    await expect(dispatcher.dispatchExecution(identity)).resolves.toMatchObject(
      {
        execution: { status: 'PARTIALLY_FAILED' },
        processedActionCount: 2,
      },
    );
    expect(commands.publish.mock.calls.map((call) => call[3])).toEqual([
      `automation:${identity.executionId}:first-action`,
      `automation:${identity.executionId}:second-action`,
    ]);
    expect(transitions.claimNextPendingAction).toHaveBeenCalledTimes(2);
  });

  it('fails closed when CommandService returns a non-terminal command', async () => {
    const claimed = action('first-action');
    transitions.claimNextPendingAction.mockResolvedValue({
      disposition: 'REPLAYED',
      execution: execution('DISPATCHING'),
      action: claimed,
    });
    commands.publish.mockResolvedValue({
      id: 'command-pending',
      status: 'PENDING',
    });
    transitions.recordActionFailed.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('FAILED'),
      action: claimed,
    });

    await dispatcher.dispatchExecution(identity);

    expect(transitions.recordActionFailed).toHaveBeenCalledWith({
      ...identity,
      actionId: 'first-action',
      errorCode: AUTOMATION_COMMAND_DISPATCH_ERROR_CODES.NonTerminalCommand,
    });
  });

  it('binds timed-out terminal commands to the failed action', async () => {
    const claimed = action('first-action');
    transitions.claimNextPendingAction.mockResolvedValue({
      disposition: 'REPLAYED',
      execution: execution('DISPATCHING'),
      action: claimed,
    });
    commands.publish.mockResolvedValue({
      id: 'command-timed-out',
      status: 'TIMED_OUT',
    });
    transitions.recordActionFailed.mockResolvedValue({
      disposition: 'APPLIED',
      execution: execution('FAILED'),
      action: claimed,
    });

    await dispatcher.dispatchExecution(identity);

    expect(transitions.recordActionFailed).toHaveBeenCalledWith({
      ...identity,
      actionId: 'first-action',
      commandId: 'command-timed-out',
      errorCode: AUTOMATION_COMMAND_DISPATCH_ERROR_CODES.CommandTimedOut,
    });
  });
});
