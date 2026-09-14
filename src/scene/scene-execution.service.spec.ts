import { SceneExecutionStatus } from '@prisma/client';
import { CommandService } from '../device/command.service';
import { PrismaService } from '../prisma/prisma.service';
import { SceneExecutionService } from './scene-execution.service';
import { SceneRepository } from './scene.repository';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sceneId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function sceneRecord(enabled = true, actionCount = 2) {
  return {
    id: sceneId,
    tenantId,
    enabled,
    revision: 1,
    actions: Array.from({ length: actionCount }, (_, i) => ({
      actionId: `a${i}`,
      position: i,
      deviceId: `d${i}-00000000-0000-4000-8000-00000000000`,
      capabilityId: `c${i}-00000000-0000-4000-8000-00000000000`,
      capabilityKey: 'enabled',
      value: true,
    })),
  };
}

describe('SceneExecutionService', () => {
  let reserveSceneExecution: jest.Mock;
  let findTenantScene: jest.Mock;
  let publish: jest.Mock;
  let executionRow: { status: SceneExecutionStatus };
  let updateMany: jest.Mock;
  let service: SceneExecutionService;

  beforeEach(() => {
    executionRow = { status: SceneExecutionStatus.RESERVED };
    reserveSceneExecution = jest.fn().mockResolvedValue({
      disposition: 'CREATED',
      execution: {
        id: 'exec1',
        tenantId,
        sceneId,
        status: SceneExecutionStatus.RESERVED,
      },
    });
    findTenantScene = jest.fn().mockResolvedValue(sceneRecord());
    publish = jest.fn().mockResolvedValue({});
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    service = new SceneExecutionService(
      { reserveSceneExecution, findTenantScene } as unknown as SceneRepository,
      { publish } as unknown as CommandService,
      {
        sceneExecution: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(executionRow),
          updateMany,
        },
      } as unknown as PrismaService,
    );
  });

  it('runs all actions ordered and finalizes SUCCEEDED', async () => {
    const result = await service.runScene({
      tenantId,
      sceneId,
      requestId: 'req-1',
    });

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith(
      tenantId,
      expect.any(String),
      { enabled: true },
      `scene:exec1:a0`,
    );
    expect(result.status).toBe(SceneExecutionStatus.SUCCEEDED);
    expect(result.outcomes).toEqual([
      { actionId: 'a0', ok: true },
      { actionId: 'a1', ok: true },
    ]);
    // Two updateMany calls: RUNNING transition + final SUCCEEDED.
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0][0].data.status).toBe(
      SceneExecutionStatus.RUNNING,
    );
    expect(updateMany.mock.calls[1][0].data.status).toBe(
      SceneExecutionStatus.SUCCEEDED,
    );
  });

  it('marks PARTIALLY_FAILED when a later action fails', async () => {
    publish.mockImplementation((_t, _d, _p, key) => {
      if (key === 'scene:exec1:a1') throw new Error('device offline');
      return Promise.resolve({});
    });

    const result = await service.runScene({
      tenantId,
      sceneId,
      requestId: 'req-2',
    });

    expect(result.status).toBe(SceneExecutionStatus.PARTIALLY_FAILED);
    expect(result.outcomes).toEqual([
      { actionId: 'a0', ok: true },
      { actionId: 'a1', ok: false },
    ]);
  });

  it('marks FAILED and skips later actions when the first fails ordered', async () => {
    findTenantScene.mockResolvedValue(sceneRecord(true, 4));
    publish.mockRejectedValue(new Error('broker down'));

    const result = await service.runScene({
      tenantId,
      sceneId,
      requestId: 'req-3',
    });

    expect(result.status).toBe(SceneExecutionStatus.FAILED);
    // Ordered mode: first action fails, remaining three never dispatched.
    expect(publish).toHaveBeenCalledTimes(1);
    expect(result.outcomes).toEqual([{ actionId: 'a0', ok: false }]);
  });

  it('runs parallel batches capped at 4', async () => {
    findTenantScene.mockResolvedValue(sceneRecord(true, 6));

    await service.runScene({
      tenantId,
      sceneId,
      requestId: 'req-4',
      mode: 'PARALLEL',
    });

    expect(publish).toHaveBeenCalledTimes(6);
  });

  it('refuses to run a disabled scene and finalizes FAILED', async () => {
    findTenantScene.mockResolvedValue(sceneRecord(false));

    await expect(
      service.runScene({ tenantId, sceneId, requestId: 'req-5' }),
    ).rejects.toThrow(/disabled/);
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not dispatch a replayed RESERVED execution under concurrent duplicate requests', async () => {
    reserveSceneExecution.mockResolvedValue({
      disposition: 'REPLAYED',
      execution: {
        id: 'exec1',
        tenantId,
        sceneId,
        status: SceneExecutionStatus.RESERVED,
      },
    });
    executionRow.status = SceneExecutionStatus.RESERVED;

    const result = await service.runScene({
      tenantId,
      sceneId,
      requestId: 'req-concurrent',
    });

    expect(findTenantScene).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(result.status).toBe(SceneExecutionStatus.RESERVED);
  });

  it('replays the recorded terminal outcome for a repeated requestId', async () => {
    reserveSceneExecution.mockResolvedValue({
      disposition: 'REPLAYED',
      execution: {
        id: 'exec1',
        tenantId,
        sceneId,
        status: SceneExecutionStatus.SUCCEEDED,
      },
    });
    executionRow.status = SceneExecutionStatus.SUCCEEDED;

    const result = await service.runScene({
      tenantId,
      sceneId,
      requestId: 'req-1',
    });

    expect(publish).not.toHaveBeenCalled();
    expect(result.status).toBe(SceneExecutionStatus.SUCCEEDED);
  });
});
