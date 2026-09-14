import { Injectable, Logger } from '@nestjs/common';
import {
  AutomationActionKind,
  AutomationTriggerKind,
  DeviceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AutomationAction,
  AutomationCondition,
  AutomationDefinitionContract,
  AutomationPrimitive,
} from './automation-domain.types';
import { AutomationDomainValidator } from './automation-domain.validator';
import {
  AUTOMATION_PERSISTENCE_ERROR_CODES,
  AutomationPersistenceError,
} from './automation.persistence.error';
import {
  AutomationPersistenceInput,
  ReplaceAutomationPersistenceInput,
  SetAutomationEnabledPersistenceInput,
} from './automation.persistence.types';

const AUTOMATION_SCHEMA_VERSION = '1.0.0';
const MAX_DEFINITION_BYTES = 64 * 1024;
const MAX_LIST_LIMIT = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const automationAggregateInclude = {
  triggerCapability: {
    select: {
      id: true,
      key: true,
      dataType: true,
      isReadable: true,
      isWritable: true,
      isReportable: true,
    },
  },
  actions: {
    include: {
      capability: {
        select: {
          id: true,
          key: true,
          dataType: true,
          isWritable: true,
        },
      },
    },
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.AutomationInclude;

export type AutomationAggregateRecord = Prisma.AutomationGetPayload<{
  include: typeof automationAggregateInclude;
}>;

export type AutomationSummaryRecord = Prisma.AutomationGetPayload<{
  select: {
    id: true;
    name: true;
    schemaVersion: true;
    enabled: true;
    revision: true;
    triggerKind: true;
    triggerDeviceId: true;
    triggerCapabilityId: true;
    createdAt: true;
    updatedAt: true;
  };
}>;

interface CapabilityReference {
  deviceId: string;
  capabilityKey: string;
  usage: 'TRIGGER' | 'CONDITION' | 'ACTION';
}

interface ResolvedCapabilityTarget {
  id: string;
  deviceId: string;
  key: string;
  dataType: string;
  isReadable: boolean;
  isWritable: boolean;
  isReportable: boolean;
}

interface ResolvedAutomationTargets {
  capabilities: Map<string, ResolvedCapabilityTarget>;
}

@Injectable()
export class AutomationRepository {
  private readonly logger = new Logger(AutomationRepository.name);
  private readonly validator = new AutomationDomainValidator();

  constructor(private readonly prisma: PrismaService) {}

  async createOwnedAutomation(
    input: AutomationPersistenceInput,
  ): Promise<AutomationAggregateRecord> {
    const definition = this.validateInput(input);

    return this.prisma.$transaction(async (transaction) => {
      await this.assertActiveMembership(
        transaction,
        input.tenantId,
        input.ownerMembershipId,
      );
      const targets = await this.resolveTargets(
        transaction,
        input.tenantId,
        definition,
      );
      const triggerCapability = this.requireTarget(
        targets,
        definition.trigger.deviceId,
        definition.trigger.capabilityKey,
      );

      const automation = await transaction.automation.create({
        data: {
          tenantId: input.tenantId,
          ownerMembershipId: input.ownerMembershipId,
          name: definition.name.trim(),
          schemaVersion: definition.schemaVersion,
          enabled: false,
          triggerKind: AutomationTriggerKind.CAPABILITY_REPORTED,
          triggerDeviceId: definition.trigger.deviceId,
          triggerCapabilityId: triggerCapability.id,
          condition: this.toInputJson(definition.condition),
          cooldownSeconds: 0,
        },
        select: { id: true },
      });

      await transaction.automationAction.createMany({
        data: this.toActionRows(
          input.tenantId,
          automation.id,
          definition.actions,
          targets,
        ),
      });

      const aggregate = await this.loadAggregate(
        transaction,
        input.tenantId,
        input.ownerMembershipId,
        automation.id,
      );
      this.logger.log({
        event: 'automation.persistence.created',
        outcome: 'succeeded',
        actionCount: aggregate.actions.length,
      });
      return aggregate;
    });
  }

  async findOwnedAutomation(
    tenantId: string,
    ownerMembershipId: string,
    automationId: string,
  ): Promise<AutomationAggregateRecord> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(ownerMembershipId, 'ownerMembershipId');
    this.assertUuid(automationId, 'automationId');
    await this.assertActiveMembershipForRead(tenantId, ownerMembershipId);

    const automation = await this.prisma.automation.findFirst({
      where: { id: automationId, tenantId, ownerMembershipId },
      include: automationAggregateInclude,
    });
    if (!automation) this.notFound();
    return automation!;
  }

  async listOwnedAutomations(
    tenantId: string,
    ownerMembershipId: string,
    limit: number,
  ): Promise<AutomationSummaryRecord[]> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(ownerMembershipId, 'ownerMembershipId');
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
      this.invalid(`limit must be between 1 and ${MAX_LIST_LIMIT}`);
    }
    await this.assertActiveMembershipForRead(tenantId, ownerMembershipId);

    return this.prisma.automation.findMany({
      where: { tenantId, ownerMembershipId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        name: true,
        schemaVersion: true,
        enabled: true,
        revision: true,
        triggerKind: true,
        triggerDeviceId: true,
        triggerCapabilityId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async replaceOwnedAutomation(
    input: ReplaceAutomationPersistenceInput,
  ): Promise<AutomationAggregateRecord> {
    const definition = this.validateInput(input);
    this.assertUuid(input.automationId, 'automationId');
    this.assertExpectedRevision(input.expectedRevision);

    return this.prisma.$transaction(async (transaction) => {
      await this.assertActiveMembership(
        transaction,
        input.tenantId,
        input.ownerMembershipId,
      );
      const existing = await transaction.automation.findFirst({
        where: {
          id: input.automationId,
          tenantId: input.tenantId,
          ownerMembershipId: input.ownerMembershipId,
        },
        select: { id: true },
      });
      if (!existing) this.notFound();

      const targets = await this.resolveTargets(
        transaction,
        input.tenantId,
        definition,
      );
      const triggerCapability = this.requireTarget(
        targets,
        definition.trigger.deviceId,
        definition.trigger.capabilityKey,
      );

      const update = await transaction.automation.updateMany({
        where: {
          id: input.automationId,
          tenantId: input.tenantId,
          ownerMembershipId: input.ownerMembershipId,
          revision: input.expectedRevision,
        },
        data: {
          name: definition.name.trim(),
          schemaVersion: definition.schemaVersion,
          enabled: false,
          triggerKind: AutomationTriggerKind.CAPABILITY_REPORTED,
          triggerDeviceId: definition.trigger.deviceId,
          triggerCapabilityId: triggerCapability.id,
          condition: this.toInputJson(definition.condition),
          cooldownSeconds: 0,
          revision: { increment: 1 },
        },
      });
      if (update.count !== 1) this.revisionConflict();

      await transaction.automationAction.deleteMany({
        where: {
          automationId: input.automationId,
          tenantId: input.tenantId,
        },
      });
      await transaction.automationAction.createMany({
        data: this.toActionRows(
          input.tenantId,
          input.automationId,
          definition.actions,
          targets,
        ),
      });

      const aggregate = await this.loadAggregate(
        transaction,
        input.tenantId,
        input.ownerMembershipId,
        input.automationId,
      );
      this.logger.log({
        event: 'automation.persistence.replaced',
        outcome: 'succeeded',
        revision: aggregate.revision,
        actionCount: aggregate.actions.length,
      });
      return aggregate;
    });
  }

  async deleteOwnedAutomation(
    tenantId: string,
    ownerMembershipId: string,
    automationId: string,
    expectedRevision: number,
  ): Promise<void> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(ownerMembershipId, 'ownerMembershipId');
    this.assertUuid(automationId, 'automationId');
    this.assertExpectedRevision(expectedRevision);

    await this.prisma.$transaction(async (transaction) => {
      await this.assertActiveMembership(
        transaction,
        tenantId,
        ownerMembershipId,
      );
      const existing = await transaction.automation.findFirst({
        where: { id: automationId, tenantId, ownerMembershipId },
        select: { id: true },
      });
      if (!existing) this.notFound();

      const deleted = await transaction.automation.deleteMany({
        where: {
          id: automationId,
          tenantId,
          ownerMembershipId,
          revision: expectedRevision,
        },
      });
      if (deleted.count !== 1) this.revisionConflict();
    });

    this.logger.log({
      event: 'automation.persistence.deleted',
      outcome: 'succeeded',
    });
  }

  async setOwnedAutomationEnabled(
    input: SetAutomationEnabledPersistenceInput,
  ): Promise<AutomationAggregateRecord> {
    this.assertUuid(input.tenantId, 'tenantId');
    this.assertUuid(input.ownerMembershipId, 'ownerMembershipId');
    this.assertUuid(input.automationId, 'automationId');
    this.assertExpectedRevision(input.expectedRevision);

    return this.prisma.$transaction(async (transaction) => {
      await this.assertActiveMembership(
        transaction,
        input.tenantId,
        input.ownerMembershipId,
      );
      const existing = await this.loadAggregate(
        transaction,
        input.tenantId,
        input.ownerMembershipId,
        input.automationId,
      );

      if (existing.revision !== input.expectedRevision) {
        this.revisionConflict();
      }

      if (input.enabled) {
        const definition = this.definitionFromAggregate(existing);
        await this.resolveTargets(transaction, input.tenantId, definition);
      }

      if (existing.enabled === input.enabled) {
        return existing;
      }

      const update = await transaction.automation.updateMany({
        where: {
          id: input.automationId,
          tenantId: input.tenantId,
          ownerMembershipId: input.ownerMembershipId,
          revision: input.expectedRevision,
        },
        data: {
          enabled: input.enabled,
          revision: { increment: 1 },
        },
      });
      if (update.count !== 1) this.revisionConflict();

      const aggregate = await this.loadAggregate(
        transaction,
        input.tenantId,
        input.ownerMembershipId,
        input.automationId,
      );
      if (input.enabled) {
        this.logger.log({
          event: 'automation.persistence.activated',
          outcome: 'succeeded',
          automationId: input.automationId,
          revision: aggregate.revision,
        });
      } else {
        this.logger.log({
          event: 'automation.persistence.deactivated',
          outcome: 'succeeded',
          automationId: input.automationId,
          revision: aggregate.revision,
        });
      }
      return aggregate;
    });
  }

  private validateInput(
    input: AutomationPersistenceInput,
  ): AutomationDefinitionContract {
    this.assertUuid(input.tenantId, 'tenantId');
    this.assertUuid(input.ownerMembershipId, 'ownerMembershipId');
    if (input.enabled === true) {
      throw new AutomationPersistenceError(
        AUTOMATION_PERSISTENCE_ERROR_CODES.ActivationNotApproved,
        'Automation activation is not approved in the persistence foundation',
      );
    }

    let definition: AutomationDefinitionContract;
    try {
      definition = this.validator.validateDefinition(input.definition);
    } catch (error) {
      this.invalid(
        error instanceof Error ? error.message : 'Invalid automation contract',
      );
    }

    if (definition!.schemaVersion !== AUTOMATION_SCHEMA_VERSION) {
      this.invalid('Unsupported automation schemaVersion');
    }
    if (
      Buffer.byteLength(JSON.stringify(definition), 'utf8') >
      MAX_DEFINITION_BYTES
    ) {
      this.invalid('Automation definition exceeds the persistence size limit');
    }

    return definition!;
  }

  private definitionFromAggregate(
    aggregate: AutomationAggregateRecord,
  ): AutomationDefinitionContract {
    try {
      return this.validator.validateDefinition({
        schemaVersion: aggregate.schemaVersion,
        name: aggregate.name,
        trigger: {
          kind: 'CAPABILITY_REPORTED',
          deviceId: aggregate.triggerDeviceId,
          capabilityKey: aggregate.triggerCapability.key,
        },
        condition: aggregate.condition,
        actions: aggregate.actions.map((action) => ({
          actionId: action.actionId,
          kind: 'DEVICE_COMMAND',
          deviceId: action.deviceId,
          capabilityKey: action.capability.key,
          value: action.value,
        })),
      });
    } catch (error) {
      this.targetInvalid(
        error instanceof Error
          ? `Persisted automation is no longer activatable: ${error.message}`
          : 'Persisted automation is no longer activatable',
      );
    }
  }

  private async resolveTargets(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    definition: AutomationDefinitionContract,
  ): Promise<ResolvedAutomationTargets> {
    const references = this.collectCapabilityReferences(definition);
    const deviceIds = [...new Set(references.map((item) => item.deviceId))];
    const devices = await transaction.device.findMany({
      where: {
        tenantId,
        id: { in: deviceIds },
        status: { not: DeviceStatus.REVOKED },
      },
      select: { id: true },
    });
    if (devices.length !== deviceIds.length) {
      this.targetInvalid(
        'Automation device target was not found in the tenant',
      );
    }

    const uniqueReferences = new Map<string, CapabilityReference>();
    for (const reference of references) {
      uniqueReferences.set(
        this.targetKey(reference.deviceId, reference.capabilityKey),
        reference,
      );
    }
    const capabilities = await transaction.capability.findMany({
      where: {
        OR: [...uniqueReferences.values()].map(
          ({ deviceId, capabilityKey }) => ({
            deviceId,
            key: capabilityKey,
          }),
        ),
      },
      select: {
        id: true,
        deviceId: true,
        key: true,
        dataType: true,
        isReadable: true,
        isWritable: true,
        isReportable: true,
      },
    });
    const capabilityMap = new Map<string, ResolvedCapabilityTarget>(
      capabilities.map((capability) => [
        this.targetKey(capability.deviceId, capability.key),
        capability,
      ]),
    );
    if (capabilityMap.size !== uniqueReferences.size) {
      this.targetInvalid(
        'Automation capability target was not found on the selected tenant device',
      );
    }

    for (const reference of references) {
      const capability = this.requireTarget(
        { capabilities: capabilityMap },
        reference.deviceId,
        reference.capabilityKey,
      );
      if (reference.usage === 'TRIGGER' && !capability.isReportable) {
        this.targetInvalid('Automation trigger capability must be reportable');
      }
      if (
        reference.usage === 'CONDITION' &&
        (!capability.isReadable || !capability.isReportable)
      ) {
        this.targetInvalid(
          'Automation condition capability must be readable and reportable',
        );
      }
      if (reference.usage === 'ACTION' && !capability.isWritable) {
        this.targetInvalid('Automation action capability must be writable');
      }
    }

    for (const action of definition.actions) {
      const target = this.requireTarget(
        { capabilities: capabilityMap },
        action.deviceId,
        action.capabilityKey,
      );
      this.assertValueCompatible(action.value, target.dataType);
    }

    return { capabilities: capabilityMap };
  }

  private collectCapabilityReferences(
    definition: AutomationDefinitionContract,
  ): CapabilityReference[] {
    const references: CapabilityReference[] = [
      {
        deviceId: definition.trigger.deviceId,
        capabilityKey: definition.trigger.capabilityKey,
        usage: 'TRIGGER',
      },
    ];
    this.collectConditionReferences(definition.condition, references);
    for (const action of definition.actions) {
      references.push({
        deviceId: action.deviceId,
        capabilityKey: action.capabilityKey,
        usage: 'ACTION',
      });
    }
    return references;
  }

  private collectConditionReferences(
    condition: AutomationCondition,
    references: CapabilityReference[],
  ): void {
    switch (condition.kind) {
      case 'ALL':
      case 'ANY':
        for (const child of condition.conditions) {
          this.collectConditionReferences(child, references);
        }
        return;
      case 'NOT':
        this.collectConditionReferences(condition.condition, references);
        return;
      case 'COMPARE':
        if (condition.left.source === 'LATEST_CAPABILITY_VALUE') {
          references.push({
            deviceId: condition.left.deviceId,
            capabilityKey: condition.left.capabilityKey,
            usage: 'CONDITION',
          });
        }
        return;
      case 'ALWAYS':
        return;
    }
  }

  private toActionRows(
    tenantId: string,
    automationId: string,
    actions: readonly AutomationAction[],
    targets: ResolvedAutomationTargets,
  ): Prisma.AutomationActionCreateManyInput[] {
    return actions.map((action, position) => {
      const capability = this.requireTarget(
        targets,
        action.deviceId,
        action.capabilityKey,
      );
      return {
        tenantId,
        automationId,
        actionId: action.actionId,
        position,
        kind: AutomationActionKind.DEVICE_COMMAND,
        deviceId: action.deviceId,
        capabilityId: capability.id,
        value: this.toInputJson(action.value),
      };
    });
  }

  private requireTarget(
    targets: ResolvedAutomationTargets,
    deviceId: string,
    capabilityKey: string,
  ): ResolvedCapabilityTarget {
    const capability = targets.capabilities.get(
      this.targetKey(deviceId, capabilityKey),
    );
    if (!capability) {
      this.targetInvalid('Automation capability target could not be resolved');
    }
    return capability!;
  }

  private targetKey(deviceId: string, capabilityKey: string): string {
    return `${deviceId}:${capabilityKey}`;
  }

  private assertValueCompatible(
    value: AutomationPrimitive,
    dataType: string,
  ): void {
    const normalizedDataType = dataType.trim().toLowerCase();
    if (
      (normalizedDataType === 'number' && typeof value !== 'number') ||
      (normalizedDataType === 'boolean' && typeof value !== 'boolean') ||
      (normalizedDataType === 'string' && typeof value !== 'string') ||
      !['number', 'boolean', 'string'].includes(normalizedDataType)
    ) {
      this.targetInvalid(
        'Automation action value does not match the target capability data type',
      );
    }
  }

  private async assertActiveMembershipForRead(
    tenantId: string,
    membershipId: string,
  ): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { id_tenantId: { id: membershipId, tenantId } },
      select: { status: true },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new AutomationPersistenceError(
        AUTOMATION_PERSISTENCE_ERROR_CODES.MembershipInvalid,
        'Active automation owner membership not found',
      );
    }
  }

  private async assertActiveMembership(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
  ): Promise<void> {
    const membership = await transaction.membership.findUnique({
      where: { id_tenantId: { id: membershipId, tenantId } },
      select: { status: true },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new AutomationPersistenceError(
        AUTOMATION_PERSISTENCE_ERROR_CODES.MembershipInvalid,
        'Active automation owner membership not found',
      );
    }
  }

  private async loadAggregate(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    ownerMembershipId: string,
    automationId: string,
  ): Promise<AutomationAggregateRecord> {
    const automation = await transaction.automation.findFirst({
      where: { id: automationId, tenantId, ownerMembershipId },
      include: automationAggregateInclude,
    });
    if (!automation) this.notFound();
    return automation!;
  }

  private toInputJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private assertUuid(value: string, field: string): void {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      this.invalid(`${field} must be a UUID`);
    }
  }

  private assertExpectedRevision(value: number): void {
    if (!Number.isInteger(value) || value < 1) {
      this.invalid('expectedRevision must be a positive integer');
    }
  }

  private invalid(message: string): never {
    throw new AutomationPersistenceError(
      AUTOMATION_PERSISTENCE_ERROR_CODES.InvalidInput,
      message,
    );
  }

  private targetInvalid(message: string): never {
    throw new AutomationPersistenceError(
      AUTOMATION_PERSISTENCE_ERROR_CODES.TargetInvalid,
      message,
    );
  }

  private notFound(): never {
    throw new AutomationPersistenceError(
      AUTOMATION_PERSISTENCE_ERROR_CODES.AutomationNotFound,
      'Automation not found',
    );
  }

  private revisionConflict(): never {
    throw new AutomationPersistenceError(
      AUTOMATION_PERSISTENCE_ERROR_CODES.RevisionConflict,
      'Automation revision conflict',
    );
  }
}
