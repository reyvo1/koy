import { Injectable } from '@nestjs/common';
import { AutomationTriggerKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AutomationCondition,
  AutomationDefinitionContract,
  AutomationPrimitive,
} from './automation-domain.types';
import { AutomationDomainValidator } from './automation-domain.validator';
import {
  AutomationEvaluationCandidate,
  NormalizedLatestCapabilityValue,
} from './automation-evaluation.types';
import {
  AUTOMATION_TELEMETRY_COORDINATION_LIMITS,
  AutomationTelemetryCoordinationEnvelope,
} from './automation-telemetry-coordination.types';

const CAPABILITY_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;

const runtimeCandidateInclude = {
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

type RuntimeCandidateRecord = Prisma.AutomationGetPayload<{
  include: typeof runtimeCandidateInclude;
}>;

export interface AutomationRuntimeCandidate extends AutomationEvaluationCandidate {
  readonly triggerCapabilityId: string;
}

export interface AutomationLatestValueTarget {
  readonly deviceId: string;
  readonly capabilityKey: string;
}

export const AUTOMATION_RUNTIME_READ_ERROR_CODES = {
  InvalidEnvelope: 'AUTOMATION_RUNTIME_READ_INVALID_ENVELOPE',
  TelemetryMismatch: 'AUTOMATION_RUNTIME_READ_TELEMETRY_MISMATCH',
  CandidateLimitExceeded: 'AUTOMATION_RUNTIME_READ_CANDIDATE_LIMIT_EXCEEDED',
  PersistedDefinitionInvalid:
    'AUTOMATION_RUNTIME_READ_PERSISTED_DEFINITION_INVALID',
  CapabilityUnavailable: 'AUTOMATION_RUNTIME_READ_CAPABILITY_UNAVAILABLE',
} as const;

export class AutomationRuntimeReadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AutomationRuntimeReadError';
  }
}

@Injectable()
export class AutomationRuntimeReadRepository {
  private readonly validator = new AutomationDomainValidator();

  constructor(private readonly prisma: PrismaService) {}

  async assertAcceptedTelemetry(
    envelope: AutomationTelemetryCoordinationEnvelope,
  ): Promise<void> {
    const telemetry = await this.prisma.telemetry.findFirst({
      where: {
        id: envelope.telemetryId,
        tenantId: envelope.tenantId,
        deviceId: envelope.deviceId,
      },
      select: {
        eventId: true,
        payload: true,
        createdAt: true,
      },
    });

    if (
      !telemetry ||
      telemetry.eventId !== envelope.eventId ||
      telemetry.createdAt.getTime() !== envelope.occurredAt.getTime() ||
      !this.isRecord(telemetry.payload)
    ) {
      this.telemetryMismatch();
    }

    const payloadKeys = Object.keys(telemetry.payload).sort();
    const reports = [...envelope.reports].sort((left, right) =>
      left.capabilityKey.localeCompare(right.capabilityKey),
    );
    if (
      payloadKeys.length !== reports.length ||
      payloadKeys.some((key, index) => key !== reports[index]?.capabilityKey)
    ) {
      this.telemetryMismatch();
    }

    for (const report of reports) {
      if (telemetry.payload[report.capabilityKey] !== report.value) {
        this.telemetryMismatch();
      }
    }

    const capabilities = await this.prisma.capability.findMany({
      where: {
        deviceId: envelope.deviceId,
        id: { in: reports.map((report) => report.capabilityId) },
      },
      select: {
        id: true,
        key: true,
        isReportable: true,
      },
      orderBy: [{ key: 'asc' }, { id: 'asc' }],
    });
    const capabilityById = new Map<
      string,
      { id: string; key: string; isReportable: boolean }
    >(capabilities.map((capability) => [capability.id, capability]));
    for (const report of reports) {
      const capability = capabilityById.get(report.capabilityId);
      if (
        !capability ||
        capability.key !== report.capabilityKey ||
        !capability.isReportable
      ) {
        this.telemetryMismatch();
      }
    }
  }

  async findEnabledCandidatesForReport(input: {
    readonly tenantId: string;
    readonly deviceId: string;
    readonly capabilityId: string;
  }): Promise<readonly AutomationRuntimeCandidate[]> {
    const records = await this.prisma.automation.findMany({
      where: {
        tenantId: input.tenantId,
        enabled: true,
        triggerKind: AutomationTriggerKind.CAPABILITY_REPORTED,
        triggerDeviceId: input.deviceId,
        triggerCapabilityId: input.capabilityId,
      },
      include: runtimeCandidateInclude,
      orderBy: [{ id: 'asc' }],
      take: AUTOMATION_TELEMETRY_COORDINATION_LIMITS.maxCandidatesPerReport + 1,
    });

    if (
      records.length >
      AUTOMATION_TELEMETRY_COORDINATION_LIMITS.maxCandidatesPerReport
    ) {
      throw new AutomationRuntimeReadError(
        AUTOMATION_RUNTIME_READ_ERROR_CODES.CandidateLimitExceeded,
        'Runtime candidate count exceeded the approved bound',
      );
    }

    return records.map((record) => this.toRuntimeCandidate(record));
  }

  async loadLatestValues(
    tenantId: string,
    targets: readonly AutomationLatestValueTarget[],
  ): Promise<readonly NormalizedLatestCapabilityValue[]> {
    const values: NormalizedLatestCapabilityValue[] = [];
    for (const target of [...targets].sort((left, right) =>
      this.targetKey(left).localeCompare(this.targetKey(right)),
    )) {
      if (!CAPABILITY_KEY_PATTERN.test(target.capabilityKey)) {
        throw new AutomationRuntimeReadError(
          AUTOMATION_RUNTIME_READ_ERROR_CODES.InvalidEnvelope,
          'Latest-value capability key is invalid',
        );
      }

      const capability = await this.prisma.capability.findFirst({
        where: {
          deviceId: target.deviceId,
          key: target.capabilityKey,
          device: { tenantId },
        },
        select: { id: true, isReadable: true, isReportable: true },
      });
      if (!capability || (!capability.isReadable && !capability.isReportable)) {
        throw new AutomationRuntimeReadError(
          AUTOMATION_RUNTIME_READ_ERROR_CODES.CapabilityUnavailable,
          'Latest-value capability is unavailable in the trusted tenant',
        );
      }

      const rows = await this.prisma.$queryRaw<
        Array<{ value: Prisma.JsonValue }>
      >`
        SELECT payload -> (${target.capabilityKey}::text) AS value
        FROM "telemetry"
        WHERE "tenantId" = ${tenantId}
          AND "deviceId" = ${target.deviceId}
          AND jsonb_typeof(payload -> (${target.capabilityKey}::text)) IN ('string', 'number', 'boolean')
        ORDER BY "createdAt" DESC, id DESC
        LIMIT 1
      `;
      const value = rows[0]?.value;
      if (this.isPrimitive(value)) {
        values.push({
          tenantId,
          deviceId: target.deviceId,
          capabilityKey: target.capabilityKey,
          value,
        });
      }
    }
    return values;
  }

  collectLatestValueTargets(
    condition: AutomationCondition,
  ): readonly AutomationLatestValueTarget[] {
    const targets = new Map<string, AutomationLatestValueTarget>();
    const visit = (node: AutomationCondition): void => {
      switch (node.kind) {
        case 'ALWAYS':
          return;
        case 'ALL':
        case 'ANY':
          node.conditions.forEach(visit);
          return;
        case 'NOT':
          visit(node.condition);
          return;
        case 'COMPARE':
          if (node.left.source === 'LATEST_CAPABILITY_VALUE') {
            const target = {
              deviceId: node.left.deviceId,
              capabilityKey: node.left.capabilityKey,
            };
            targets.set(this.targetKey(target), target);
          }
      }
    };
    visit(condition);
    return [...targets.values()].sort((left, right) =>
      this.targetKey(left).localeCompare(this.targetKey(right)),
    );
  }

  private toRuntimeCandidate(
    record: RuntimeCandidateRecord,
  ): AutomationRuntimeCandidate {
    let definition: AutomationDefinitionContract;
    try {
      definition = this.validator.validateDefinition({
        schemaVersion: record.schemaVersion,
        name: record.name,
        trigger: {
          kind: 'CAPABILITY_REPORTED',
          deviceId: record.triggerDeviceId,
          capabilityKey: record.triggerCapability.key,
        },
        condition: record.condition,
        actions: record.actions.map((action) => ({
          actionId: action.actionId,
          kind: 'DEVICE_COMMAND',
          deviceId: action.deviceId,
          capabilityKey: action.capability.key,
          value: this.requirePrimitive(action.value),
        })),
      });
    } catch {
      throw new AutomationRuntimeReadError(
        AUTOMATION_RUNTIME_READ_ERROR_CODES.PersistedDefinitionInvalid,
        'Persisted automation definition failed runtime validation',
      );
    }

    return Object.freeze({
      automationId: record.id,
      tenantId: record.tenantId,
      enabled: record.enabled,
      revision: record.revision,
      definition,
      triggerCapabilityId: record.triggerCapabilityId,
    });
  }

  private targetKey(target: AutomationLatestValueTarget): string {
    return `${target.deviceId}\u0000${target.capabilityKey}`;
  }

  private requirePrimitive(value: Prisma.JsonValue): AutomationPrimitive {
    if (!this.isPrimitive(value)) {
      throw new AutomationRuntimeReadError(
        AUTOMATION_RUNTIME_READ_ERROR_CODES.PersistedDefinitionInvalid,
        'Persisted automation action value is not primitive',
      );
    }
    return value;
  }

  private telemetryMismatch(): never {
    throw new AutomationRuntimeReadError(
      AUTOMATION_RUNTIME_READ_ERROR_CODES.TelemetryMismatch,
      'Accepted telemetry evidence does not match the coordination envelope',
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private isPrimitive(value: unknown): value is AutomationPrimitive {
    return (
      typeof value === 'string' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      typeof value === 'boolean'
    );
  }
}
