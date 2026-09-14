import { Injectable, Logger } from '@nestjs/common';
import { SceneExecutionStatus } from '@prisma/client';
import { CommandService } from '../device/command.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  SCENE_PERSISTENCE_ERROR_CODES,
  ScenePersistenceError,
  SceneRepository,
} from './scene.repository';

export const SCENE_EXECUTION_LIMITS = {
  maxParallelActions: 4,
} as const;


export interface SceneActionOutcome {
  readonly actionId: string;
  readonly ok: boolean;
}

export interface SceneRunResult {
  readonly executionId: string;
  readonly status: SceneExecutionStatus;
  readonly outcomes: readonly SceneActionOutcome[];
}

/**
 * Module 12 Slice 12.2 — bounded scene execution engine.
 * Ordered execution with optional parallel batches (max 4), partial-failure
 * semantics mirroring automation: first failure skips the rest unless running
 * in a parallel batch; idempotency key `scene:<executionId>:<actionId>` keeps
 * replays safe. No scheduler/queue is wired here.
 */
@Injectable()
export class SceneExecutionService {
  private readonly logger = new Logger(SceneExecutionService.name);

  constructor(
    private readonly scenes: SceneRepository,
    private readonly commands: CommandService,
    private readonly prisma: PrismaService,
  ) {}

  async runScene(input: {
    tenantId: string;
    sceneId: string;
    requestId: string;
    mode?: 'ORDERED' | 'PARALLEL';
  }): Promise<SceneRunResult> {
    const reservation = await this.scenes.reserveSceneExecution({
      tenantId: input.tenantId,
      sceneId: input.sceneId,
      requestId: input.requestId,
    });
    const executionId = reservation.execution.id;

    if (reservation.disposition === 'REPLAYED') {
      // A repeated requestId must never dispatch device commands again, even
      // when the original execution is still RESERVED. Returning the recorded
      // state makes idempotency fail-safe under concurrent duplicate requests.
      const record = await this.prisma.sceneExecution.findUniqueOrThrow({
        where: { id: executionId },
      });
      return {
        executionId,
        status: record.status,
        outcomes: [],
      };
    }

    const scene = await this.scenes.findTenantScene(
      input.tenantId,
      input.sceneId,
    );
    if (!scene.enabled) {
      await this.finalize(executionId, SceneExecutionStatus.FAILED);
      throw new ScenePersistenceError(
        SCENE_PERSISTENCE_ERROR_CODES.InvalidInput,
        'Scene is disabled',
      );
    }

    const startedAt = new Date();
    await this.prisma.sceneExecution.updateMany({
      where: { id: executionId, status: SceneExecutionStatus.RESERVED },
      data: {
        status: SceneExecutionStatus.RUNNING,
        startedAt,
      },
    });

    const mode = input.mode ?? 'ORDERED';
    let failed = false;
    const outcomes: SceneActionOutcome[] = [];

    if (mode === 'PARALLEL') {
      for (
        let batchStart = 0;
        batchStart < scene.actions.length && !failed;
        batchStart += SCENE_EXECUTION_LIMITS.maxParallelActions
      ) {
        const batch = scene.actions.slice(
          batchStart,
          batchStart + SCENE_EXECUTION_LIMITS.maxParallelActions,
        );
        await this.runBatch(batch, input.tenantId, executionId, outcomes);
        failed = outcomes.some((o) => !o.ok);
      }
    } else {
      for (const action of scene.actions) {
        if (failed) break;
        await this.runBatch([action], input.tenantId, executionId, outcomes);
        failed = outcomes.some((o) => !o.ok);
      }
    }

    const succeededCount = outcomes.filter((o) => o.ok).length;
    const finalStatus =
      succeededCount === scene.actions.length
        ? SceneExecutionStatus.SUCCEEDED
        : succeededCount === 0
          ? SceneExecutionStatus.FAILED
          : SceneExecutionStatus.PARTIALLY_FAILED;

    await this.finalize(executionId, finalStatus);

    return { executionId, status: finalStatus, outcomes };
  }

  private async finalize(
    executionId: string,
    status: SceneExecutionStatus,
  ): Promise<void> {
    await this.prisma.sceneExecution.updateMany({
      where: { id: executionId, status: SceneExecutionStatus.RUNNING },
      data: { status, completedAt: new Date() },
    });
  }

  private async runBatch(
    batch: readonly {
      actionId: string;
      deviceId: string;
      capabilityKey: string;
      value: unknown;
    }[],
    tenantId: string,
    executionId: string,
    outcomes: SceneActionOutcome[],
  ): Promise<void> {
    const settled = await Promise.allSettled(
      batch.map(async (action) => {
        await this.commands.publish(
          tenantId,
          action.deviceId,
          { [action.capabilityKey]: action.value },
          `scene:${executionId}:${action.actionId}`,
        );
        return { actionId: action.actionId, ok: true };
      }),
    );

    for (let i = 0; i < settled.length; i += 1) {
      const item = settled[i];
      const action = batch[i];
      if (item.status === 'fulfilled') {
        outcomes.push({ actionId: action.actionId, ok: true });
      } else {
        outcomes.push({ actionId: action.actionId, ok: false });
        this.logger.warn({
          event: 'scene.execution.action_failed',
          outcome: 'failed',
          executionId,
          actionId: action.actionId,
        });
      }
    }
  }
}
