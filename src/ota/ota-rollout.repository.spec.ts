import { OtaRolloutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OtaDomainValidator } from './ota-domain.validator';
import { OtaRolloutRepository } from './ota-rollout.repository';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const firmwareId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rolloutId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('OtaRolloutRepository', () => {
  let rolloutRow: Record<string, any>;
  let createArtifact: jest.Mock;
  let createRollout: jest.Mock;
  let findFirst: jest.Mock;
  let updateMany: jest.Mock;
  // `createRollout` resolves its targets against `device` before writing, so a rollout may
  // only name devices of the caller's tenant. This double returns every target it is given;
  // the refusal path is covered in `ota-rollout-tenant-scope.contract.spec.ts`.
  let deviceFindMany: jest.Mock;
  let repo: OtaRolloutRepository;

  beforeEach(() => {
    rolloutRow = {
      id: rolloutId,
      tenantId,
      firmwareId,
      status: 'DRAFT',
      targetDeviceIds: ['d1', 'd2'],
      completedDeviceIds: [],
      failedDeviceIds: [],
    };
    createArtifact = jest.fn().mockResolvedValue({ id: firmwareId });
    createRollout = jest.fn().mockResolvedValue({ id: rolloutId });
    findFirst = jest.fn().mockResolvedValue(rolloutRow);
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    deviceFindMany = jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(where.id.in.map((id: string) => ({ id }))),
    );
    repo = new OtaRolloutRepository(
      {
        device: { findMany: deviceFindMany },
        // No artifact carries this version, so the duplicate check finds nothing and the
        // create proceeds; the refusal path is covered in ota-rollout-tenant-scope.
        firmwareArtifact: {
          create: createArtifact,
          findFirst: jest.fn().mockResolvedValue(null),
        },
        otaRollout: { create: createRollout, findFirst, updateMany },
      } as unknown as PrismaService,
      new OtaDomainValidator(),
    );
  });

  it('creates artifacts through the domain validator', async () => {
    await repo.createArtifact(tenantId, {
      version: '2.0.0',
      artifactUrl: 'https://ota.example.com/fw.bin',
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
      compatibleModels: ['ESP32-V1'],
    });
    expect(createArtifact).toHaveBeenCalledTimes(1);
  });

  it('creates DRAFT rollouts with bounded targets', async () => {
    await repo.createRollout({
      tenantId,
      firmwareId,
      targetDeviceIds: ['d1', 'd2'],
    });
    expect(createRollout).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT' }),
      }),
    );
  });

  it('applies guarded forward transitions', async () => {
    await repo.transition(tenantId, rolloutId, OtaRolloutStatus.PUBLISHED);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'DRAFT' }),
        data: { status: 'PUBLISHED' },
      }),
    );
  });

  it('refuses illegal transitions without writing', async () => {
    await expect(
      repo.transition(tenantId, rolloutId, OtaRolloutStatus.COMPLETED),
    ).rejects.toMatchObject({ code: 'OTA_STATUS_TRANSITION_INVALID' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('records progress and finalizes COMPLETED when all targets report success', async () => {
    rolloutRow.status = 'IN_PROGRESS';

    const result = await repo.recordProgress({
      tenantId,
      rolloutId,
      succeededDeviceIds: ['d1', 'd2'],
      failedDeviceIds: [],
    });

    expect(result.done).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('keeps IN_PROGRESS until every target reports', async () => {
    rolloutRow.status = 'IN_PROGRESS';

    const result = await repo.recordProgress({
      tenantId,
      rolloutId,
      succeededDeviceIds: ['d1'],
      failedDeviceIds: [],
    });

    expect(result.done).toBe(false);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: expect.anything() }),
      }),
    );
  });
});
