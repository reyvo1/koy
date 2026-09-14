import { Injectable, Logger } from '@nestjs/common';
import {
  AutomationActionKind,
  AutomationExecutionActionStatus,
  AutomationExecutionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTOMATION_DOMAIN_LIMITS,
  AutomationPrimitive,
} from './automation-domain.types';
import {
  AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES,
  AutomationExecutionPersistenceError,
} from './automation-execution.persistence.error';
import {
  AUTOMATION_EXECUTION_PERSISTENCE_LIMITS,
  AutomationExecutionAncestryItem,
  AutomationExecutionReservationDisposition,
  ReserveMatchedAutomationExecutionInput,
} from './automation-execution.persistence.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITY_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const COOLDOWN_REFERENCE_STATUSES = [
  AutomationExecutionStatus.RESERVED,
  AutomationExecutionStatus.DISPATCHING,
  AutomationExecutionStatus.SUCCEEDED,
  AutomationExecutionStatus.FAILED,
  AutomationExecutionStatus.PARTIALLY_FAILED,
] as const;

const executionInclude = {
  actions: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.AutomationExecutionInclude;

const runtimeAutomationInclude = {
  triggerCapability: {
    select: { id: true, key: true },
  },
  actions: {
    include: {
      capability: {
        select: { id: true, key: true },
      },
    },
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.AutomationInclude;

export type AutomationExecutionRecord = Prisma.AutomationExecutionGetPayload<{
  include: typeof executionInclude;
}>;

type RuntimeAutomationRecord = Prisma.AutomationGetPayload<{
  include: typeof runtimeAutomationInclude;
}>;

export interface AutomationExecutionReservationResult {
  readonly disposition: AutomationExecutionReservationDisposition;
  readonly execution: AutomationExecutionRecord;
}

type LoopReason =
  'ANCESTRY_CONTAINS_AUTOMATION' | 'ANCESTRY_DUPLICATE' | 'ANCESTRY_UNVERIFIED';

interface CooldownDecision {
  readonly suppressed: boolean;
  readonly referenceExecutionId: string | null;
}

@Injectable()
export class AutomationExecutionRepository {
  private readonly logger = new Logger(AutomationExecutionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async reserveMatchedExecution(
    input: ReserveMatchedAutomationExecutionInput,
  ): Promise<AutomationExecutionReservationResult> {
    const normalized = this.validateInput(input);
    const existing = await this.loadCanonicalExecution(normalized);
    if (existing) {
      const replay = this.replayOrConflict(existing, normalized);
      this.logReservation(replay);
      return replay;
    }

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        await this.acquireAutomationReservationLock(
          transaction,
          normalized.tenantId,
          normalized.automationId,
        );

        const concurrent = await this.loadCanonicalExecutionInTransaction(
          transaction,
          normalized,
        );
        if (concurrent) return this.replayOrConflict(concurrent, normalized);

        const automation = await this.loadApprovedAutomation(
          transaction,
          normalized,
        );
        this.assertActionSnapshot(automation, normalized);
        await this.assertTelemetry(transaction, normalized);
        const loopReason = await this.resolveLoopReason(
          transaction,
          normalized.tenantId,
          normalized.automationId,
          normalized.ancestry,
        );
        const databaseNow = await this.readDatabaseClock(transaction);
        const cooldown = loopReason
          ? null
          : await this.resolveCooldown(
              transaction,
              normalized.tenantId,
              normalized.automationId,
              automation.cooldownSeconds,
              databaseNow,
            );
        const suppressed = loopReason !== null || cooldown?.suppressed === true;
        const status = loopReason
          ? AutomationExecutionStatus.SUPPRESSED_LOOP
          : cooldown?.suppressed
            ? AutomationExecutionStatus.SUPPRESSED_COOLDOWN
            : AutomationExecutionStatus.RESERVED;
        const decisionReason =
          loopReason ??
          (cooldown?.suppressed ? 'COOLDOWN_ACTIVE' : 'CONDITION_MATCHED');
        const suppressedActionErrorCode = loopReason
          ? 'EXECUTION_SUPPRESSED_LOOP'
          : cooldown?.suppressed
            ? 'EXECUTION_SUPPRESSED_COOLDOWN'
            : null;

        const created = await transaction.automationExecution.create({
          data: {
            tenantId: normalized.tenantId,
            automationId: normalized.automationId,
            automationRevision: normalized.automationRevision,
            triggerTelemetryId: normalized.triggerTelemetryId,
            triggerEventId: normalized.triggerEventId,
            triggerDeviceId: normalized.triggerDeviceId,
            triggerCapabilityId: normalized.triggerCapabilityId,
            triggerCapabilityKey: normalized.triggerCapabilityKey,
            triggerValue: this.toInputJson(normalized.triggerValue),
            triggerOccurredAt: normalized.triggerOccurredAt,
            ancestry: this.toInputJson(normalized.ancestry),
            cooldownSeconds: automation.cooldownSeconds,
            cooldownEvaluatedAt: loopReason ? null : databaseNow,
            cooldownReferenceExecutionId:
              cooldown?.referenceExecutionId ?? null,
            status,
            decisionReason,
            completedAt: suppressed ? databaseNow : null,
            createdAt: databaseNow,
          },
          select: { id: true },
        });

        await transaction.automationExecutionAction.createMany({
          data: automation.actions.map((action) => ({
            tenantId: normalized.tenantId,
            executionId: created.id,
            actionId: action.actionId,
            position: action.position,
            kind: AutomationActionKind.DEVICE_COMMAND,
            deviceId: action.deviceId,
            capabilityId: action.capabilityId,
            capabilityKey: action.capability.key,
            value: this.toInputJson(this.requirePrimitive(action.value)),
            status: suppressed
              ? AutomationExecutionActionStatus.SKIPPED
              : AutomationExecutionActionStatus.PENDING,
            errorCode: suppressedActionErrorCode,
            createdAt: databaseNow,
            completedAt: suppressed ? databaseNow : null,
          })),
        });

        const execution = await this.loadExecution(
          transaction,
          normalized.tenantId,
          created.id,
        );
        return { disposition: 'CREATED' as const, execution };
      });

      this.logReservation(result);
      return result;
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;

      const concurrent = await this.loadCanonicalExecution(normalized);
      if (!concurrent) {
        throw new AutomationExecutionPersistenceError(
          AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.IdempotencyConflict,
          'Automation execution canonical identity conflict',
        );
      }
      const replay = this.replayOrConflict(concurrent, normalized);
      this.logReservation(replay);
      return replay;
    }
  }

  async findTenantExecution(
    tenantId: string,
    executionId: string,
  ): Promise<AutomationExecutionRecord> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(executionId, 'executionId');
    const execution = await this.prisma.automationExecution.findFirst({
      where: { id: executionId, tenantId },
      include: executionInclude,
    });
    if (!execution) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.ExecutionNotFound,
        'Automation execution not found',
      );
    }
    return execution;
  }

  private replayOrConflict(
    existing: AutomationExecutionRecord,
    input: ReserveMatchedAutomationExecutionInput,
  ): AutomationExecutionReservationResult {
    if (!this.isEquivalentReservation(existing, input)) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.IdempotencyConflict,
        'Automation execution canonical identity conflict',
      );
    }

    return { disposition: 'REPLAYED', execution: existing };
  }

  private logReservation(result: AutomationExecutionReservationResult): void {
    this.logger.log({
      event: 'automation.execution.reserved',
      outcome: result.disposition === 'CREATED' ? 'created' : 'replayed',
      status: result.execution.status,
      actionCount: result.execution.actions.length,
    });
  }

  private async loadApprovedAutomation(
    transaction: Prisma.TransactionClient,
    input: ReserveMatchedAutomationExecutionInput,
  ): Promise<RuntimeAutomationRecord> {
    const automation = await transaction.automation.findFirst({
      where: {
        id: input.automationId,
        tenantId: input.tenantId,
        revision: input.automationRevision,
        enabled: true,
      },
      include: runtimeAutomationInclude,
    });
    if (!automation) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.AutomationUnavailable,
        'Approved enabled automation revision was not found',
      );
    }
    if (
      automation.triggerDeviceId !== input.triggerDeviceId ||
      automation.triggerCapabilityId !== input.triggerCapabilityId ||
      automation.triggerCapability.key !== input.triggerCapabilityKey
    ) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.AutomationUnavailable,
        'Automation trigger identity does not match the approved revision',
      );
    }
    if (
      !Number.isInteger(automation.cooldownSeconds) ||
      automation.cooldownSeconds < 0 ||
      automation.cooldownSeconds >
        AUTOMATION_EXECUTION_PERSISTENCE_LIMITS.maxCooldownSeconds
    ) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.CooldownInvalid,
        'Persisted automation cooldown is outside the approved bound',
      );
    }
    return automation;
  }

  private async assertTelemetry(
    transaction: Prisma.TransactionClient,
    input: ReserveMatchedAutomationExecutionInput,
  ): Promise<void> {
    const telemetry = await transaction.telemetry.findFirst({
      where: {
        id: input.triggerTelemetryId,
        tenantId: input.tenantId,
        deviceId: input.triggerDeviceId,
      },
      select: { eventId: true, payload: true, createdAt: true },
    });
    const payloadValue =
      telemetry && this.isRecord(telemetry.payload)
        ? telemetry.payload[input.triggerCapabilityKey]
        : undefined;
    if (
      !telemetry ||
      telemetry.eventId !== input.triggerEventId ||
      telemetry.createdAt.getTime() !== input.triggerOccurredAt.getTime() ||
      payloadValue !== input.triggerValue
    ) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.TelemetryMismatch,
        'Accepted telemetry identity does not match the reservation envelope',
      );
    }
  }

  private assertActionSnapshot(
    automation: RuntimeAutomationRecord,
    input: ReserveMatchedAutomationExecutionInput,
  ): void {
    if (automation.actions.length !== input.actionIntents.length) {
      this.actionSnapshotMismatch();
    }
    automation.actions.forEach((persisted, position) => {
      const intent = input.actionIntents[position];
      const persistedValue = this.requirePrimitive(persisted.value);
      if (
        !intent ||
        persisted.position !== position ||
        persisted.actionId !== intent.actionId ||
        persisted.kind !== AutomationActionKind.DEVICE_COMMAND ||
        intent.kind !== 'DEVICE_COMMAND' ||
        persisted.deviceId !== intent.deviceId ||
        persisted.capability.key !== intent.capabilityKey ||
        persistedValue !== intent.value
      ) {
        this.actionSnapshotMismatch();
      }
    });
  }

  private async acquireAutomationReservationLock(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    automationId: string,
  ): Promise<void> {
    const lockKey = `automation-cooldown:${tenantId}:${automationId}`;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `;
  }

  private async readDatabaseClock(
    transaction: Prisma.TransactionClient,
  ): Promise<Date> {
    const rows = await transaction.$queryRaw<Array<{ databaseNow: Date }>>`
      SELECT clock_timestamp() AS "databaseNow"
    `;
    const databaseNow = rows[0]?.databaseNow;
    if (
      !(databaseNow instanceof Date) ||
      !Number.isFinite(databaseNow.getTime())
    ) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.DatabaseClockUnavailable,
        'PostgreSQL database clock did not return a valid timestamp',
      );
    }
    return databaseNow;
  }

  private async resolveCooldown(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    automationId: string,
    cooldownSeconds: number,
    databaseNow: Date,
  ): Promise<CooldownDecision> {
    if (cooldownSeconds === 0) {
      return { suppressed: false, referenceExecutionId: null };
    }

    const threshold = new Date(databaseNow.getTime() - cooldownSeconds * 1000);
    const reference = await transaction.automationExecution.findFirst({
      where: {
        tenantId,
        automationId,
        status: { in: [...COOLDOWN_REFERENCE_STATUSES] },
        createdAt: {
          gt: threshold,
          lte: databaseNow,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });

    return {
      suppressed: reference !== null,
      referenceExecutionId: reference?.id ?? null,
    };
  }

  private async resolveLoopReason(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    automationId: string,
    ancestry: readonly AutomationExecutionAncestryItem[],
  ): Promise<LoopReason | null> {
    if (ancestry.length === 0) return null;

    const executionIds = new Set<string>();
    const automationIds = new Set<string>();
    for (const item of ancestry) {
      if (
        executionIds.has(item.executionId) ||
        automationIds.has(item.automationId)
      ) {
        return 'ANCESTRY_DUPLICATE';
      }
      executionIds.add(item.executionId);
      automationIds.add(item.automationId);
    }
    if (automationIds.has(automationId)) {
      return 'ANCESTRY_CONTAINS_AUTOMATION';
    }

    const records = await transaction.automationExecution.findMany({
      where: { tenantId, id: { in: [...executionIds] } },
      select: { id: true, automationId: true },
    });
    if (records.length !== ancestry.length) return 'ANCESTRY_UNVERIFIED';

    const recordMap = new Map(
      records.map((record) => [record.id, record.automationId]),
    );
    if (
      ancestry.some(
        (item) => recordMap.get(item.executionId) !== item.automationId,
      )
    ) {
      return 'ANCESTRY_UNVERIFIED';
    }
    return null;
  }

  private validateInput(
    input: ReserveMatchedAutomationExecutionInput,
  ): ReserveMatchedAutomationExecutionInput {
    if (!this.isRecord(input)) this.invalid('input must be an object');
    this.assertUuid(input.tenantId, 'tenantId');
    this.assertUuid(input.automationId, 'automationId');
    this.assertUuid(input.triggerTelemetryId, 'triggerTelemetryId');
    this.assertUuid(input.triggerDeviceId, 'triggerDeviceId');
    this.assertUuid(input.triggerCapabilityId, 'triggerCapabilityId');
    if (
      !Number.isInteger(input.automationRevision) ||
      input.automationRevision < 1
    ) {
      this.invalid('automationRevision must be a positive integer');
    }
    if (
      typeof input.triggerEventId !== 'string' ||
      input.triggerEventId.length < 1 ||
      input.triggerEventId.length >
        AUTOMATION_EXECUTION_PERSISTENCE_LIMITS.maxEventIdLength ||
      input.triggerEventId.trim() !== input.triggerEventId
    ) {
      this.invalid('triggerEventId must be normalized and bounded');
    }
    if (
      typeof input.triggerCapabilityKey !== 'string' ||
      !CAPABILITY_KEY_PATTERN.test(input.triggerCapabilityKey)
    ) {
      this.invalid('triggerCapabilityKey is invalid');
    }
    this.assertPrimitive(input.triggerValue, 'triggerValue');
    if (
      !(input.triggerOccurredAt instanceof Date) ||
      !Number.isFinite(input.triggerOccurredAt.getTime())
    ) {
      this.invalid('triggerOccurredAt must be a valid Date');
    }
    if (
      !Array.isArray(input.ancestry) ||
      input.ancestry.length >
        AUTOMATION_EXECUTION_PERSISTENCE_LIMITS.maxAncestryDepth
    ) {
      this.invalid(
        `ancestry must contain at most ${AUTOMATION_EXECUTION_PERSISTENCE_LIMITS.maxAncestryDepth} items`,
      );
    }
    for (const item of input.ancestry) {
      if (
        !this.isRecord(item) ||
        !this.hasExactKeys(item, ['automationId', 'executionId'])
      ) {
        this.invalid('ancestry item must contain exact execution identity');
      }
      this.assertUuid(item.executionId, 'ancestry.executionId');
      this.assertUuid(item.automationId, 'ancestry.automationId');
    }
    if (
      !Array.isArray(input.actionIntents) ||
      input.actionIntents.length < 1 ||
      input.actionIntents.length > AUTOMATION_DOMAIN_LIMITS.maxActions
    ) {
      this.invalid(
        `actionIntents must contain between 1 and ${AUTOMATION_DOMAIN_LIMITS.maxActions} actions`,
      );
    }
    for (const intent of input.actionIntents) {
      if (!this.isRecord(intent))
        this.invalid('action intent must be an object');
      this.assertPrimitive(intent.value, 'actionIntents.value');
    }
    return {
      tenantId: input.tenantId,
      automationId: input.automationId,
      automationRevision: input.automationRevision,
      triggerTelemetryId: input.triggerTelemetryId,
      triggerEventId: input.triggerEventId,
      triggerDeviceId: input.triggerDeviceId,
      triggerCapabilityId: input.triggerCapabilityId,
      triggerCapabilityKey: input.triggerCapabilityKey,
      triggerValue: input.triggerValue,
      triggerOccurredAt: new Date(input.triggerOccurredAt.getTime()),
      ancestry: input.ancestry.map((item) => ({
        executionId: item.executionId,
        automationId: item.automationId,
      })),
      actionIntents: input.actionIntents.map((intent) => ({
        actionId: intent.actionId,
        kind: 'DEVICE_COMMAND',
        deviceId: intent.deviceId,
        capabilityKey: intent.capabilityKey,
        value: intent.value,
      })),
    };
  }

  private async loadExecution(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    executionId: string,
  ): Promise<AutomationExecutionRecord> {
    const execution = await transaction.automationExecution.findFirst({
      where: { id: executionId, tenantId },
      include: executionInclude,
    });
    if (!execution) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.ExecutionNotFound,
        'Created automation execution could not be reloaded',
      );
    }
    return execution;
  }

  private loadCanonicalExecutionInTransaction(
    transaction: Prisma.TransactionClient,
    input: ReserveMatchedAutomationExecutionInput,
  ): Promise<AutomationExecutionRecord | null> {
    return transaction.automationExecution.findUnique({
      where: {
        tenantId_automationId_automationRevision_triggerTelemetryId: {
          tenantId: input.tenantId,
          automationId: input.automationId,
          automationRevision: input.automationRevision,
          triggerTelemetryId: input.triggerTelemetryId,
        },
      },
      include: executionInclude,
    });
  }

  private loadCanonicalExecution(
    input: ReserveMatchedAutomationExecutionInput,
  ): Promise<AutomationExecutionRecord | null> {
    return this.prisma.automationExecution.findUnique({
      where: {
        tenantId_automationId_automationRevision_triggerTelemetryId: {
          tenantId: input.tenantId,
          automationId: input.automationId,
          automationRevision: input.automationRevision,
          triggerTelemetryId: input.triggerTelemetryId,
        },
      },
      include: executionInclude,
    });
  }

  private isEquivalentReservation(
    execution: AutomationExecutionRecord,
    input: ReserveMatchedAutomationExecutionInput,
  ): boolean {
    if (
      execution.tenantId !== input.tenantId ||
      execution.automationId !== input.automationId ||
      execution.automationRevision !== input.automationRevision ||
      execution.triggerTelemetryId !== input.triggerTelemetryId ||
      execution.triggerEventId !== input.triggerEventId ||
      execution.triggerDeviceId !== input.triggerDeviceId ||
      execution.triggerCapabilityId !== input.triggerCapabilityId ||
      execution.triggerCapabilityKey !== input.triggerCapabilityKey ||
      execution.triggerOccurredAt.getTime() !==
        input.triggerOccurredAt.getTime() ||
      this.requirePrimitive(execution.triggerValue) !== input.triggerValue ||
      !this.sameJson(execution.ancestry, input.ancestry) ||
      execution.actions.length !== input.actionIntents.length
    ) {
      return false;
    }

    return execution.actions.every((action, position) => {
      const intent = input.actionIntents[position];
      return (
        intent !== undefined &&
        action.position === position &&
        action.actionId === intent.actionId &&
        action.kind === AutomationActionKind.DEVICE_COMMAND &&
        intent.kind === 'DEVICE_COMMAND' &&
        action.deviceId === intent.deviceId &&
        action.capabilityKey === intent.capabilityKey &&
        this.requirePrimitive(action.value) === intent.value
      );
    });
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private assertPrimitive(
    value: unknown,
    field: string,
  ): asserts value is AutomationPrimitive {
    if (
      !['string', 'number', 'boolean'].includes(typeof value) ||
      (typeof value === 'string' &&
        value.length > AUTOMATION_DOMAIN_LIMITS.maxStringValueLength) ||
      (typeof value === 'number' && !Number.isFinite(value))
    ) {
      this.invalid(`${field} must be a bounded primitive`);
    }
  }

  private requirePrimitive(value: Prisma.JsonValue): AutomationPrimitive {
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.ActionSnapshotMismatch,
        'Persisted automation action value is not a primitive',
      );
    }
    return value;
  }

  private assertUuid(value: unknown, field: string): asserts value is string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      this.invalid(`${field} must be a UUID`);
    }
  }

  private hasExactKeys(
    value: Record<string, unknown>,
    expected: readonly string[],
  ): boolean {
    const actual = Object.keys(value).sort();
    const required = [...expected].sort();
    return (
      actual.length === required.length &&
      actual.every((key, index) => key === required[index])
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private sameJson(left: Prisma.JsonValue, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private toInputJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private actionSnapshotMismatch(): never {
    throw new AutomationExecutionPersistenceError(
      AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.ActionSnapshotMismatch,
      'Evaluation action intents do not match the approved automation revision',
    );
  }

  private invalid(message: string): never {
    throw new AutomationExecutionPersistenceError(
      AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.InvalidInput,
      message,
    );
  }
}
