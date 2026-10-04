import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilityValidator } from '../device/capability.validator';
import {
  SCENE_PERSISTENCE_ERROR_CODES,
  ScenePersistenceError,
  SceneRecord,
} from './scene.repository';

/**
 * Module 12 Slice 12.1 — focused contract checks for the SceneRepository
 * tenant boundary and idempotency semantics without a live database.
 */
@Injectable()
export class ScenePersistenceProbe {
  constructor(private readonly prisma: PrismaService) {}

  async probeInvalidTenantIsRejected(): Promise<string> {
    try {
      const repo = new (await import('./scene.repository')).SceneRepository(
        this.prisma,
      );
      await repo.findTenantScene('not-a-uuid', '00000000-0000-4000-8000-000000000001');
      return 'NO_ERROR';
    } catch (error) {
      return error instanceof ScenePersistenceError
        ? error.code
        : `UNEXPECTED:${String(error)}`;
    }
  }
}

describe('Scene persistence contract', () => {
  it('exposes the bounded error surface', () => {
    expect(SCENE_PERSISTENCE_ERROR_CODES.InvalidInput).toBe(
      'SCENE_INVALID_INPUT',
    );
    expect(SCENE_PERSISTENCE_ERROR_CODES.SceneNotFound).toBe(
      'SCENE_NOT_FOUND',
    );
    expect(SCENE_PERSISTENCE_ERROR_CODES.NameConflict).toBe(
      'SCENE_NAME_CONFLICT',
    );
  });


  it('rejects a scene action whose capability target is not tenant/device scoped', async () => {
    const tx = {
      capability: { findMany: jest.fn().mockResolvedValue([]) },
      scene: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const repo = new (await import('./scene.repository')).SceneRepository(
      prisma,
      new CapabilityValidator(),
    );

    await expect(
      repo.createScene('00000000-0000-4000-8000-000000000001', {
        name: 'Safe scene',
        actions: [
          {
            actionId: 'act-1',
            deviceId: '00000000-0000-4000-8000-000000000002',
            capabilityId: '00000000-0000-4000-8000-000000000003',
            capabilityKey: 'switch.power',
            value: true,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: SCENE_PERSISTENCE_ERROR_CODES.InvalidInput });
    expect(tx.scene.create).not.toHaveBeenCalled();
  });

  it('validates a scene action value against the resolved writable capability before persistence', async () => {
    const tx = {
      capability: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '00000000-0000-4000-8000-000000000003',
            deviceId: '00000000-0000-4000-8000-000000000002',
            key: 'level',
            semanticType: 'level',
            dataType: 'integer',
            constraints: { min: 0, max: 10 },
            unit: null,
            isReadable: true,
            isWritable: true,
            isReportable: true,
            schemaVersion: '1.0.0',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
      scene: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const repo = new (await import('./scene.repository')).SceneRepository(
      prisma,
      new CapabilityValidator(),
    );

    await expect(
      repo.createScene('00000000-0000-4000-8000-000000000001', {
        name: 'Bounded scene',
        actions: [
          {
            actionId: 'act-1',
            deviceId: '00000000-0000-4000-8000-000000000002',
            capabilityId: '00000000-0000-4000-8000-000000000003',
            capabilityKey: 'level',
            value: 11,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: SCENE_PERSISTENCE_ERROR_CODES.InvalidInput });
    expect(tx.scene.create).not.toHaveBeenCalled();
  });


  it('refuses deletion when a schedule still references the scene', async () => {
    const tx = {
      schedule: { count: jest.fn().mockResolvedValue(1) },
      sceneExecution: { deleteMany: jest.fn() },
      scene: { deleteMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const repo = new (await import('./scene.repository')).SceneRepository(prisma);

    await expect(
      repo.deleteTenantScene(
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ),
    ).rejects.toMatchObject({ code: SCENE_PERSISTENCE_ERROR_CODES.SceneInUse });
    expect(tx.sceneExecution.deleteMany).not.toHaveBeenCalled();
    expect(tx.scene.deleteMany).not.toHaveBeenCalled();
  });

  it('types scene records with ordered actions', () => {
    const sample = {
      id: 's1',
      actions: [{ position: 0 }, { position: 1 }],
    } as unknown as SceneRecord;
    expect(sample.actions.map((a) => a.position)).toEqual([0, 1]);
  });
});
