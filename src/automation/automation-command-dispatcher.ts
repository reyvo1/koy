import { HttpException, Injectable, Logger } from '@nestjs/common';
import {
  AutomationActionKind,
  AutomationExecutionStatus,
  CommandStatus,
  DeviceCommand,
} from '@prisma/client';
import { ERROR_CODES } from '../common/errors/error-code';
import { CommandService } from '../device/command.service';
import {
  AUTOMATION_DOMAIN_LIMITS,
  AutomationPrimitive,
} from './automation-domain.types';
import {
  automationActionCommandIdempotencyKey,
  AutomationExecutionTransitionAction,
  AutomationExecutionTransitionRecord,
  AutomationExecutionTransitionRepository,
} from './automation-execution-transition.repository';
import {
  AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES,
  AutomationExecutionPersistenceError,
} from './automation-execution.persistence.error';
import { AutomationExecutionIdentityInput } from './automation-execution.persistence.types';

export const AUTOMATION_COMMAND_DISPATCH_ERROR_CODES = {
  Unexpected: 'AUTOMATION_COMMAND_DISPATCH_UNEXPECTED',
  InvalidActionKind: 'AUTOMATION_COMMAND_DISPATCH_ACTION_KIND_INVALID',
  InvalidActionValue: 'AUTOMATION_COMMAND_DISPATCH_ACTION_VALUE_INVALID',
  NonTerminalCommand: 'AUTOMATION_COMMAND_DISPATCH_COMMAND_NOT_TERMINAL',
  CommandTimedOut: 'AUTOMATION_COMMAND_DISPATCH_COMMAND_TIMED_OUT',
} as const;

export interface AutomationCommandDispatchResult {
  readonly execution: AutomationExecutionTransitionRecord;
  readonly processedActionCount: number;
}

@Injectable()
export class AutomationCommandDispatcher {
  private readonly logger = new Logger(AutomationCommandDispatcher.name);

  constructor(
    private readonly transitions: AutomationExecutionTransitionRepository,
    private readonly commands: CommandService,
  ) {}

  async dispatchExecution(
    input: AutomationExecutionIdentityInput,
  ): Promise<AutomationCommandDispatchResult> {
    let processedActionCount = 0;

    for (
      let attempt = 0;
      attempt < AUTOMATION_DOMAIN_LIMITS.maxActions;
      attempt += 1
    ) {
      const claim = await this.transitions.claimNextPendingAction(input);
      const completion = await this.dispatchClaimedAction(input, claim.action);
      processedActionCount += 1;

      if (
        completion.status === AutomationExecutionStatus.SUCCEEDED ||
        completion.status === AutomationExecutionStatus.FAILED ||
        completion.status === AutomationExecutionStatus.PARTIALLY_FAILED
      ) {
        this.logger.log({
          event: 'automation.command_dispatch.completed',
          outcome:
            completion.status === AutomationExecutionStatus.SUCCEEDED
              ? 'succeeded'
              : 'failed',
          executionId: completion.id,
          status: completion.status,
          processedActionCount,
        });

        return {
          execution: completion,
          processedActionCount,
        };
      }
    }

    throw new AutomationExecutionPersistenceError(
      AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.TransitionConflict,
      'Automation command dispatch exceeded the bounded action count',
    );
  }

  private async dispatchClaimedAction(
    input: AutomationExecutionIdentityInput,
    action: AutomationExecutionTransitionAction,
  ): Promise<AutomationExecutionTransitionRecord> {
    if (action.kind !== AutomationActionKind.DEVICE_COMMAND) {
      return this.recordFailure(
        input,
        action,
        AUTOMATION_COMMAND_DISPATCH_ERROR_CODES.InvalidActionKind,
      );
    }

    if (!this.isPrimitive(action.value)) {
      return this.recordFailure(
        input,
        action,
        AUTOMATION_COMMAND_DISPATCH_ERROR_CODES.InvalidActionValue,
      );
    }

    const idempotencyKey = automationActionCommandIdempotencyKey(
      input.executionId,
      action.actionId,
    );
    const payload: Record<string, AutomationPrimitive> = {
      [action.capabilityKey]: action.value,
    };

    try {
      const command = await this.commands.publish(
        input.tenantId,
        action.deviceId,
        payload,
        idempotencyKey,
      );

      return this.recordCommandOutcome(input, action, command);
    } catch (error) {
      const recovered = await this.recoverCommand(
        input.tenantId,
        action.deviceId,
        idempotencyKey,
      );
      const commandId = this.isFailureCommand(recovered)
        ? recovered.id
        : undefined;

      return this.recordFailure(
        input,
        action,
        this.errorCode(error),
        commandId,
      );
    }
  }

  private async recordCommandOutcome(
    input: AutomationExecutionIdentityInput,
    action: AutomationExecutionTransitionAction,
    command: DeviceCommand,
  ): Promise<AutomationExecutionTransitionRecord> {
    if (
      command.status === CommandStatus.SENT ||
      command.status === CommandStatus.ACKNOWLEDGED
    ) {
      const completed = await this.transitions.recordActionSucceeded({
        ...input,
        actionId: action.actionId,
        commandId: command.id,
      });

      this.logger.log({
        event: 'automation.command_dispatch.action_succeeded',
        outcome: 'succeeded',
        executionId: input.executionId,
        actionId: action.actionId,
        commandId: command.id,
        transitionDisposition: completed.disposition,
      });

      return completed.execution;
    }

    if (command.status === CommandStatus.FAILED) {
      return this.recordFailure(
        input,
        action,
        ERROR_CODES.CommandPublishFailed,
        command.id,
      );
    }

    if (command.status === CommandStatus.TIMED_OUT) {
      return this.recordFailure(
        input,
        action,
        AUTOMATION_COMMAND_DISPATCH_ERROR_CODES.CommandTimedOut,
        command.id,
      );
    }

    return this.recordFailure(
      input,
      action,
      AUTOMATION_COMMAND_DISPATCH_ERROR_CODES.NonTerminalCommand,
    );
  }

  private async recordFailure(
    input: AutomationExecutionIdentityInput,
    action: AutomationExecutionTransitionAction,
    errorCode: string,
    commandId?: string,
  ): Promise<AutomationExecutionTransitionRecord> {
    const completed = await this.transitions.recordActionFailed({
      ...input,
      actionId: action.actionId,
      errorCode,
      ...(commandId ? { commandId } : {}),
    });

    this.logger.warn({
      event: 'automation.command_dispatch.action_failed',
      outcome: 'failed',
      executionId: input.executionId,
      actionId: action.actionId,
      commandId: commandId ?? null,
      errorCode,
      transitionDisposition: completed.disposition,
    });

    return completed.execution;
  }

  private async recoverCommand(
    tenantId: string,
    deviceId: string,
    idempotencyKey: string,
  ): Promise<DeviceCommand | null> {
    try {
      return await this.commands.findTenantDeviceCommandByIdempotencyKey(
        tenantId,
        deviceId,
        idempotencyKey,
      );
    } catch {
      return null;
    }
  }

  private isFailureCommand(
    command: DeviceCommand | null,
  ): command is DeviceCommand {
    return (
      command !== null &&
      (command.status === CommandStatus.FAILED ||
        command.status === CommandStatus.TIMED_OUT)
    );
  }

  private errorCode(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === 'object' && 'code' in response) {
        const code = (response as { code?: unknown }).code;
        if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(code)) {
          return code;
        }
      }
    }

    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(code)) {
        return code;
      }
    }

    return AUTOMATION_COMMAND_DISPATCH_ERROR_CODES.Unexpected;
  }

  private isPrimitive(value: unknown): value is AutomationPrimitive {
    return (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    );
  }
}
