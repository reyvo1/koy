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

    // `FirmwareArtifact` is unique on (tenantId, version). Registering a version that
    // already exists is a client mistake, and Prisma reports it as P2002 — which
    // `GlobalExceptionFilter` does not recognise, so it reached the operator as a 500
    // "internal error" for something they can fix. The same rule the org surface already
    // applies with ORG_ALREADY_EXISTS: name the conflict, answer 409, and keep the existing
    // digest out of the response so a duplicate POST cannot be used to read the stored one.
    const existing = await this.prisma.firmwareArtifact.findFirst({
      where: { tenantId, version: normalized.version },
      select: { id: true },
    });
    if (existing) {
      throw Object.assign(
        new Error(`firmware version ${normalized.version} already exists`),
        { code: 'OTA_VERSION_ALREADY_EXISTS' },
      );
    }

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

    // Every target must be a device of THIS tenant, resolved server-side.
    //
    // Without this check a rollout row could name any device id — including one belonging
    // to another tenant — and the record would then claim that a foreign device is being
    // updated. Nothing downstream re-checks: progress is merged by id, so the rollout reads
    // as legitimate fleet activity for a fleet the caller does not own. Tenant isolation is
    // the product here, not a feature of it, so the target set is proven against the
    // database rather than accepted from the request body.
    const owned = await this.prisma.device.findMany({
      where: { tenantId: input.tenantId, id: { in: targets } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((device) => device.id));
    const foreign = targets.filter((id) => !ownedIds.has(id));
    if (foreign.length > 0) {
      throw Object.assign(
        new Error(
          `targets not found in this tenant: ${foreign.slice(0, 5).join(', ')}`,
        ),
        { code: 'OTA_TARGETS_NOT_IN_TENANT' },
      );
    }

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
  }): Promise<{
    completedCount: number;
    failedCount: number;
    done: boolean;
    status: OtaRolloutStatus;
  }> {
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

    // A rollout that ends with failed devices is ROLLED_BACK, never COMPLETED.
    //
    // The previous expression asked `'PARTIALLY_FAILED' in OtaRolloutStatus` and fell
    // through to `'COMPLETED'` when that member was absent — which it always is, so a
    // rollout in which devices failed was stored as a clean success. `assertTransition`
    // permits IN_PROGRESS -> ROLLED_BACK, and ROLLED_BACK is terminal, so recording the
    // failure is both expressible and final. `failedDeviceIds` stays on the row so an
    // operator can see which devices rejected the firmware.
    const nextStatus = done
      ? failed.length === 0
        ? OtaRolloutStatus.COMPLETED
        : OtaRolloutStatus.ROLLED_BACK
      : null;

    // Partial failures keep IN_PROGRESS until every target reports.
    const data: Record<string, unknown> = {
      completedDeviceIds: completed,
      failedDeviceIds: failed,
    };
    if (done && nextStatus) {
      this.validator.assertTransition(rollout.status, nextStatus);
      data.status = nextStatus;
    }

    await this.prisma.otaRollout.updateMany({
      where: { id: rollout.id, tenantId: input.tenantId, status: rollout.status },
      data,
    });

    return {
      completedCount: completed.length,
      failedCount: failed.length,
      // `done` means every target reported, not that the rollout succeeded. The two are
      // reported separately on purpose: a finished rollout that failed is still finished,
      // and a caller that only checked `done` would otherwise retry a terminal rollout.
      done,
      status: (data.status as OtaRolloutStatus | undefined) ?? rollout.status,
    };
  }

  /**
   * Tenant-scoped read of one rollout.
   *
   * The where clause pins `tenantId`, so a rollout id belonging to another tenant is not
   * readable — it is simply absent, and the controller turns absence into a 404 rather than
   * a 403 that would confirm the id exists somewhere.
   */
  async findRollout(tenantId: string, rolloutId: string) {
    this.assertUuid(tenantId);
    this.assertUuid(rolloutId);
    return this.prisma.otaRollout.findFirst({
      where: { id: rolloutId, tenantId },
    });
  }

  private assertUuid(value: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw Object.assign(new Error(`${value} is not a UUID`), {
        code: 'OTA_INVALID_IDENTITY',
      });
    }
  }
}
