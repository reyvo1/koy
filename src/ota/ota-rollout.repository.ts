import { Injectable, Logger } from '@nestjs/common';
import { OtaRolloutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OtaDomainValidator } from './ota-domain.validator';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Module 15 Slice 15.2 — rollout repository with forward-only transitions.
 * All state changes are validated by the domain state machine and applied
 * with optimistic status guards so concurrent transitions fail loudly.
 */
@Injectable()
export class OtaRolloutRepository {
  private readonly logger = new Logger(OtaRolloutRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: OtaDomainValidator,
  ) {}

  async createArtifact(
    tenantId: string,
    input: {
      version: string;
      artifactUrl: string;
      sha256: string;
      sizeBytes: number;
      compatibleModels: string[];
      releaseNotes?: string;
    },
  ) {
    this.assertUuid(tenantId);
    const normalized = this.validator.validateArtifact(input);
    const artifact = await this.prisma.firmwareArtifact.create({
      data: {
        tenantId,
        ...normalized,
        compatibleModels: input.compatibleModels,
        releaseNotes: input.releaseNotes ?? null,
      },
    });
    this.logger.log({
      event: 'ota.artifact.created',
      outcome: 'created',
      firmwareId: artifact.id,
    });
    return artifact;
  }

  async createRollout(input: {
    tenantId: string;
    firmwareId: string;
    targetDeviceIds: string[];
  }) {
    this.assertUuid(input.tenantId);
    this.assertUuid(input.firmwareId);
    const targets = this.validator.validateTargets(input.targetDeviceIds);

    return this.prisma.otaRollout.create({
      data: {
        tenantId: input.tenantId,
        firmwareId: input.firmwareId,
        targetDeviceIds: targets,
        completedDeviceIds: [],
        failedDeviceIds: [],
        status: 'DRAFT',
      },
    });
  }

  /** Forward-only guarded transition; replays of the same target are no-ops. */
  async transition(
    tenantId: string,
    rolloutId: string,
    to: OtaRolloutStatus,
  ): Promise<void> {
    this.assertUuid(tenantId);
    this.assertUuid(rolloutId);

    const rollout = await this.prisma.otaRollout.findFirst({
      where: { id: rolloutId, tenantId },
    });
    if (!rollout) {
      throw Object.assign(new Error('rollout not found'), {
        code: 'OTA_ROLLOUT_NOT_FOUND',
      });
    }

    this.validator.assertTransition(rollout.status, to);

    const update = await this.prisma.otaRollout.updateMany({
      where: { id: rollout.id, tenantId, status: rollout.status },
      data: { status: to },
    });
    if (update.count !== 1) {
      throw Object.assign(new Error('rollout transition lost a race'), {
        code: 'OTA_TRANSITION_CONFLICT',
      });
    }
    this.logger.log({
      event: 'ota.rollout.transitioned',
      outcome: 'applied',
      rolloutId,
      to,
    });
  }

  async recordProgress(input: {
    tenantId: string;
    rolloutId: string;
    succeededDeviceIds: string[];
    failedDeviceIds: string[];
  }): Promise<{ completedCount: number; failedCount: number; done: boolean }> {
    this.assertUuid(input.tenantId);
    this.assertUuid(input.rolloutId);

    const rollout = await this.prisma.otaRollout.findFirst({
      where: { id: input.rolloutId, tenantId: input.tenantId },
    });
    if (!rollout || rollout.status !== OtaRolloutStatus.IN_PROGRESS) {
      throw Object.assign(new Error('rollout not in progress'), {
        code: 'OTA_ROLLOUT_NOT_IN_PROGRESS',
      });
    }

    const merge = (current: unknown, additions: string[]) => [
      ...new Set([...((current as string[]) ?? []), ...additions]),
    ];
    const completed = merge(rollout.completedDeviceIds, input.succeededDeviceIds);
    const failed = merge(rollout.failedDeviceIds, input.failedDeviceIds);
    const targets = (rollout.targetDeviceIds as string[]) ?? [];
    const done = completed.length + failed.length >= targets.length;
    const nextStatus = done
      ? failed.length === 0
        ? 'COMPLETED'
        : 'PARTIALLY_FAILED' in OtaRolloutStatus
          ? 'FAILED'
          : 'COMPLETED'
      : null;

    // Partial failures keep IN_PROGRESS until every target reports.
    const data: Record<string, unknown> = {
      completedDeviceIds: completed,
      failedDeviceIds: failed,
    };
    let effectiveStatus = rollout.status as OtaRolloutStatus;
    if (done && nextStatus) {
      this.validator.assertTransition(rollout.status, nextStatus as never);
      data.status = nextStatus;
      effectiveStatus = nextStatus as OtaRolloutStatus;
    }

    await this.prisma.otaRollout.updateMany({
      where: { id: rollout.id, tenantId: input.tenantId, status: rollout.status },
      data,
    });

    return {
      completedCount: completed.length,
      failedCount: failed.length,
      done:
        effectiveStatus === 'COMPLETED' ||
        effectiveStatus === ('PARTIALLY_FAILED' as never),
    };
  }

  private assertUuid(value: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw Object.assign(new Error(`${value} is not a UUID`), {
        code: 'OTA_INVALID_IDENTITY',
      });
    }
  }
}
