import { OtaRolloutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OtaDomainValidator } from './ota-domain.validator';
import { OtaRolloutRepository } from './ota-rollout.repository';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const firmwareId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rolloutId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/**
 * A rollout where a device FAILED must not be stored as COMPLETED.
 *
 * The terminal state is derived from the merged reports: zero failures completes the
 * rollout, one or more failures is a failure. `OtaRolloutStatus` has no PARTIALLY_FAILED
 * member and `assertTransition` forbids IN_PROGRESS -> COMPLETED-with-failures being
 * recorded silently, so the repository must fail loudly rather than launder a failed
 * device into a clean rollout.
 */
describe('OtaRolloutRepository — failed device reporting', () => {
  let rolloutRow: Record<string, any>;
  let updateMany: jest.Mock;
  let repo: OtaRolloutRepository;

  beforeEach(() => {
    rolloutRow = {
      id: rolloutId,
      tenantId,
      firmwareId,
      status: OtaRolloutStatus.IN_PROGRESS,
      targetDeviceIds: ['d1', 'd2'],
      completedDeviceIds: [],
      failedDeviceIds: [],
    };
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    repo = new OtaRolloutRepository(
      {
        $queryRaw: async () => [{ databaseNow: new Date() }],
        otaRollout: { findFirst: async () => rolloutRow, updateMany },
      } as unknown as PrismaService,
      new OtaDomainValidator(),
    );
  });

  it('does not mark a rollout COMPLETED when a target reported failure', async () => {
    await repo.recordProgress({
      tenantId,
      rolloutId,
      succeededDeviceIds: ['d1'],
      failedDeviceIds: ['d2'],
    });

    const persisted = updateMany.mock.calls[0][0].data;
    expect(persisted.status).not.toBe(OtaRolloutStatus.COMPLETED);
  });

  it('records the failed device id alongside its own status', async () => {
    const result = await repo.recordProgress({
      tenantId,
      rolloutId,
      succeededDeviceIds: ['d1'],
      failedDeviceIds: ['d2'],
    });

    const persisted = updateMany.mock.calls[0][0].data;
    expect(persisted.completedDeviceIds).toEqual(['d1']);
    expect(persisted.failedDeviceIds).toEqual(['d2']);
    expect(result.failedCount).toBe(1);
  });

  it('still completes cleanly when every target succeeds', async () => {
    await repo.recordProgress({
      tenantId,
      rolloutId,
      succeededDeviceIds: ['d1', 'd2'],
      failedDeviceIds: [],
    });

    const persisted = updateMany.mock.calls[0][0].data;
    expect(persisted.status).toBe(OtaRolloutStatus.COMPLETED);
  });

  it('is idempotent when the same failure is reported twice', async () => {
    const first = await repo.recordProgress({
      tenantId,
      rolloutId,
      succeededDeviceIds: ['d1'],
      failedDeviceIds: ['d2'],
    });
    rolloutRow.completedDeviceIds = ['d1'];
    rolloutRow.failedDeviceIds = ['d2'];
    const second = await repo.recordProgress({
      tenantId,
      rolloutId,
      succeededDeviceIds: ['d1'],
      failedDeviceIds: ['d2'],
    });

    expect(first.failedCount).toBe(1);
    expect(second.failedCount).toBe(1);
    expect(updateMany.mock.calls[1][0].data.failedDeviceIds).toEqual(['d2']);
  });
});
