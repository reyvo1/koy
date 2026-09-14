import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, SceneExecutionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilityValidator } from '../device/capability.validator';
import {
  CreateSceneInput,
} from './scene-domain.validator';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SCENE_PERSISTENCE_ERROR_CODES = {
  InvalidInput: 'SCENE_INVALID_INPUT',
  SceneNotFound: 'SCENE_NOT_FOUND',
  NameConflict: 'SCENE_NAME_CONFLICT',
  ExecutionNotFound: 'SCENE_EXECUTION_NOT_FOUND',
} as const;

export type ScenePersistenceErrorCode =
  (typeof SCENE_PERSISTENCE_ERROR_CODES)[keyof typeof SCENE_PERSISTENCE_ERROR_CODES];

export class ScenePersistenceError extends Error {
  constructor(
    public readonly code: ScenePersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScenePersistenceError';
  }
}

const sceneInclude = {
  actions: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.SceneInclude;

export type SceneRecord = Prisma.SceneGetPayload<{
  include: typeof sceneInclude;
}>;

export interface ReserveSceneExecutionResult {
  readonly disposition: 'CREATED' | 'REPLAYED';
  readonly execution: {
    readonly id: string;
    readonly tenantId: string;
    readonly sceneId: string;
    readonly status: SceneExecutionStatus;
  };
}

/**
 * Module 12 Slice 12.1 — tenant-isolated scene persistence with idempotent
 * execution reservation. No execution runtime is wired here.
 */
@Injectable()
export class SceneRepository {
  private readonly logger = new Logger(SceneRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly capabilityValidator?: CapabilityValidator,
  ) {}

  async createScene(
    tenantId: string,
    input: CreateSceneInput,
  ): Promise<SceneRecord> {
    this.assertUuid(tenantId, 'tenantId');
    const result = await this.prisma.$transaction(async (transaction) => {
      if (!this.capabilityValidator) {
        throw new ScenePersistenceError(
          SCENE_PERSISTENCE_ERROR_CODES.InvalidInput,
          'Scene capability validation is unavailable',
        );
      }

      const capabilities = await transaction.capability.findMany({
        where: {
          OR: input.actions.map((action) => ({
            id: action.capabilityId,
            deviceId: action.deviceId,
            key: action.capabilityKey,
            device: { tenantId },
          })),
        },
      });
      const capabilityByTarget = new Map(
        capabilities.map((capability) => [
          `${capability.id}:${capability.deviceId}:${capability.key}`,
          capability,
        ]),
      );

      for (const action of input.actions) {
        const capability = capabilityByTarget.get(
          `${action.capabilityId}:${action.deviceId}:${action.capabilityKey}`,
        );
        if (!capability) {
          throw new ScenePersistenceError(
            SCENE_PERSISTENCE_ERROR_CODES.InvalidInput,
            'Scene action capability does not belong to the selected tenant device',
          );
        }
        if (!capability.isWritable) {
          throw new ScenePersistenceError(
            SCENE_PERSISTENCE_ERROR_CODES.InvalidInput,
            `Scene action capability ${capability.key} is not writable`,
          );
        }
        try {
          this.capabilityValidator.validateValue(action.value, capability);
        } catch {
          throw new ScenePersistenceError(
            SCENE_PERSISTENCE_ERROR_CODES.InvalidInput,
            `Scene action value is invalid for capability ${capability.key}`,
          );
        }
      }

      return transaction.scene.create({
        data: {
          tenantId,
          name: input.name,
          actions: {
            create: input.actions.map((action, position) => ({
              actionId: action.actionId,
              position,
              deviceId: action.deviceId,
              capabilityId: action.capabilityId,
              capabilityKey: action.capabilityKey,
              value: action.value,
            })),
          },
        },
        include: sceneInclude,
      });
    });

    this.logger.log({
      event: 'scene.persistence.created',
      outcome: 'created',
      actionCount: result.actions.length,
    });
    return result;
  }

  async findTenantScene(tenantId: string, sceneId: string): Promise<SceneRecord> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(sceneId, 'sceneId');
    const scene = await this.prisma.scene.findFirst({
      where: { id: sceneId, tenantId },
      include: sceneInclude,
    });
    if (!scene) {
      throw new ScenePersistenceError(
        SCENE_PERSISTENCE_ERROR_CODES.SceneNotFound,
        'Scene not found',
      );
    }
    return scene;
  }

  async listTenantScenes(tenantId: string): Promise<SceneRecord[]> {
    this.assertUuid(tenantId, 'tenantId');
    return this.prisma.scene.findMany({
      where: { tenantId },
      include: sceneInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Tenant-scoped hard delete; execution history removed with the scene. */
  async deleteTenantScene(tenantId: string, sceneId: string): Promise<boolean> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(sceneId, 'sceneId');
    const result = await this.prisma.$transaction([
      this.prisma.sceneExecution.deleteMany({
        where: { sceneId, tenantId },
      }),
      this.prisma.scene.deleteMany({
        where: { id: sceneId, tenantId },
      }),
    ]);
    return result[1].count > 0;
  }

  /** Enable/disable a tenant scene; false when the scene does not exist. */
  async setTenantSceneEnabled(
    tenantId: string,
    sceneId: string,
    enabled: boolean,
  ): Promise<boolean> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(sceneId, 'sceneId');
    const result = await this.prisma.scene.updateMany({
      where: { id: sceneId, tenantId },
      data: { enabled },
    });
    return result.count > 0;
  }

  /** Bounded, tenant-scene-scoped execution history, newest first. */
  async listSceneExecutions(
    tenantId: string,
    sceneId: string,
    limit: number,
  ): Promise<
    readonly {
      readonly id: string;
      readonly status: string;
      readonly triggerSource: string;
      readonly sceneRevision: number;
      readonly startedAt: Date | null;
      readonly completedAt: Date | null;
      readonly createdAt: Date;
    }[]
  > {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(sceneId, 'sceneId');
    return this.prisma.sceneExecution.findMany({
      where: { tenantId, sceneId },
      select: {
        id: true,
        status: true,
        triggerSource: true,
        sceneRevision: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  /**
   * Idempotent reservation keyed by (tenantId, sceneId, requestId): replays
   * return the original execution; conflicting requestIds create new ones.
   */
  async reserveSceneExecution(input: {
    tenantId: string;
    sceneId: string;
    requestId: string;
  }): Promise<ReserveSceneExecutionResult> {
    const { tenantId, sceneId } = input;
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(sceneId, 'sceneId');
    const requestId = input.requestId?.trim();
    if (!requestId || requestId.length > 256) {
      throw new ScenePersistenceError(
        SCENE_PERSISTENCE_ERROR_CODES.InvalidInput,
        'requestId must be 1..256 characters',
      );
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`scene_exec:${tenantId}:${sceneId}`}))`;

      const existing = await transaction.sceneExecution.findUnique({
        where: {
          tenantId_sceneId_requestId: { tenantId, sceneId, requestId },
        },
      });
      if (existing) {
        return { disposition: 'REPLAYED' as const, execution: existing };
      }

      const scene = await transaction.scene.findFirst({
        where: { id: sceneId, tenantId },
        select: { id: true, revision: true },
      });
      if (!scene) {
        throw new ScenePersistenceError(
          SCENE_PERSISTENCE_ERROR_CODES.SceneNotFound,
          'Scene not found',
        );
      }

      const created = await transaction.sceneExecution.create({
        data: {
          tenantId,
          sceneId,
          sceneRevision: scene.revision,
          requestId,
          triggerSource: 'USER_REQUEST',
          status: SceneExecutionStatus.RESERVED,
        },
      });
      return { disposition: 'CREATED' as const, execution: created };
    });

    this.logger.log({
      event: 'scene.execution.reserved',
      outcome: result.disposition === 'CREATED' ? 'created' : 'replayed',
      sceneId,
      status: result.execution.status,
    });
    return {
      disposition: result.disposition,
      execution: {
        id: result.execution.id,
        tenantId: result.execution.tenantId,
        sceneId: result.execution.sceneId,
        status: result.execution.status,
      },
    };
  }

  private assertUuid(value: string, field: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new ScenePersistenceError(
        SCENE_PERSISTENCE_ERROR_CODES.InvalidInput,
        `${field} must be a valid UUID`,
      );
    }
  }
}
