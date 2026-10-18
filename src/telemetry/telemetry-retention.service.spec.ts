import { TelemetryRetentionService } from './telemetry-retention.service';

interface RollupRow {
  tenantId: string;
  deviceId: string;
  capabilityKey: string;
  bucketStart: Date;
  sampleCount: number;
  valueSum: number;
  valueMin: number;
  valueMax: number;
  valueLast: number;
}

/**
 * Behavioural coverage for the retention window arithmetic and the hardening pass.
 *
 * The contract spec reads the source, which cannot tell whether the two steps actually share a cut-off,
 * whether a second instance skips instead of racing, or whether the removal loop actually batches. This
 * drives the service with a recording Prisma mock and asserts on the arguments it received.
 */
describe('TelemetryRetentionService', () => {
  // The transaction is a pass-through: the fake client the callback receives is the one the assertions
  // hold. The lock answer is queued first because the service asks for it before anything else.
  const build = (
    overrides: {
      lockAcquired?: boolean;
      aggregates?: RollupRow[];
      count?: number;
      deleteBatches?: number[];
      deleteDelayMs?: number;
      metrics?: { recordTelemetryRetention: jest.Mock };
    } = {},
  ) => {
    const queryRaw = jest.fn();
    queryRaw.mockResolvedValueOnce([{ locked: overrides.lockAcquired ?? true }]);
    queryRaw.mockResolvedValueOnce(overrides.aggregates ?? []);
    if (overrides.count !== undefined) {
      queryRaw.mockResolvedValueOnce([{ count: overrides.count }]);
    }
    queryRaw.mockResolvedValue([]);

    const executeRaw = jest.fn();
    if (overrides.deleteDelayMs !== undefined) {
      executeRaw.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, overrides.deleteDelayMs));
        return 5_000;
      });
    } else {
      for (const size of overrides.deleteBatches ?? [0]) {
        executeRaw.mockResolvedValueOnce(size);
      }
      executeRaw.mockResolvedValue(0);
    }

    const telemetryRollup = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    };

    const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw, telemetryRollup };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
      ),
    };

    const service = new TelemetryRetentionService(
      prisma as never,
      overrides.metrics as never,
    );

    return { service, prisma, queryRaw, executeRaw, telemetryRollup, tx };
  };

  const aggregates: RollupRow[] = [
    {
      tenantId: 't1',
      deviceId: 'd1',
      capabilityKey: 'temp',
      bucketStart: new Date('2026-07-20T09:00:00.000Z'),
      sampleCount: 3,
      valueSum: 60,
      valueMin: 18,
      valueMax: 22,
      valueLast: 19,
    },
  ];

  describe('window validation', () => {
    it.each([
      ['zero', 0],
      ['negative', -1000],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
    ])('refuses a %s retention window before touching the database', async (_label, retentionMs) => {
      const { service, prisma } = build();

      await expect(
        service.rollupAndPrune({ tenantId: 't1', retentionMs, bucketMs: 60_000 }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['zero', 0],
      ['negative', -1],
      ['NaN', Number.NaN],
    ])('refuses a %s bucket width before touching the database', async (_label, bucketMs) => {
      const { service, prisma } = build();

      await expect(
        service.rollupAndPrune({ tenantId: 't1', retentionMs: 86_400_000, bucketMs }),
      ).rejects.toBeInstanceOf(RangeError);
      // The transaction would be where every write and the lock live, so proving it was never opened
      // proves nothing was written, without enumerating the individual mocks.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a non-positive batch size before touching the database', async () => {
      const { service, prisma } = build();

      await expect(
        service.rollupAndPrune({ tenantId: 't1', retentionMs: 86_400_000, bucketMs: 60_000, batchSize: 0 }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a non-positive duration budget before touching the database', async () => {
      const { service, prisma } = build();

      await expect(
        service.rollupAndPrune({ tenantId: 't1', retentionMs: 86_400_000, bucketMs: 60_000, maxDurationMs: 0 }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('concurrency', () => {
    // Operator runs can be started from more than one host. The second run must skip and report, not
    // queue behind the first or race it into double-counting.
    it('skips instead of racing when another run holds the advisory lock', async () => {
      const metrics = { recordTelemetryRetention: jest.fn() };
      const { service, executeRaw, telemetryRollup } = build({ lockAcquired: false, metrics });

      const result = await service.rollupAndPrune({
        tenantId: 't1',
        retentionMs: 1000,
        bucketMs: 1000,
      });

      expect(result.skipped).toBe(true);
      expect(result.rowsPruned).toBe(0);
      expect(result.bucketsWritten).toBe(0);
      expect(executeRaw).not.toHaveBeenCalled();
      expect(telemetryRollup.deleteMany).not.toHaveBeenCalled();
      expect(telemetryRollup.createMany).not.toHaveBeenCalled();
      expect(metrics.recordTelemetryRetention).toHaveBeenCalledWith(
        'skipped',
        expect.any(Number),
        0,
        0,
        false,
      );
    });

    it('asks for the per-tenant lock inside the transaction, with commit head-room over the budget', async () => {
      const { service, prisma, queryRaw } = build();

      await service.rollupAndPrune({
        tenantId: 'tenant-a',
        retentionMs: 1000,
        bucketMs: 1000,
        maxDurationMs: 2_000,
      });

      // The transaction timeout is the removal budget plus head-room: a run that stops on its own
      // budget must still be allowed to commit what it did.
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ timeout: 62_000, maxWait: 15_000 }),
      );
      const lockBoundValues = queryRaw.mock.calls[0].slice(1);
      expect(lockBoundValues).toContain('telemetry-retention:tenant-a');
    });
  });

  describe('cut-off agreement', () => {
    // The property the whole design rests on. If the rollup and the prune disagree about which window is
    // expiring, every retained sample is re-counted on the next pass and the chart over-reports.
    it('gives the rollup and the prune the same cut-off', async () => {
      const { service, queryRaw, executeRaw } = build({ aggregates });
      const now = new Date('2026-07-20T12:00:00.000Z');

      const result = await service.rollupAndPrune({
        tenantId: 't1',
        now,
        retentionMs: 3_600_000,
        bucketMs: 900_000,
      });

      const expectedCutoff = new Date('2026-07-20T11:00:00.000Z');
      expect(result.cutoff).toEqual(expectedCutoff);

      // A tagged template records its bound values after the string array, so the cut-off is asserted by
      // value rather than by position: an index-based assertion would pass as long as *some* date was
      // bound, which is exactly the property under test. Call 0 is the advisory lock; the aggregate is
      // call 1.
      expect(queryRaw.mock.calls[1].slice(1)).toContainEqual(expectedCutoff);
      expect(executeRaw.mock.calls[0].slice(1)).toContainEqual(expectedCutoff);
    });

    it('reports the pruned count rather than a boolean', async () => {
      const { service } = build({ deleteBatches: [7] });

      const result = await service.rollupAndPrune({ tenantId: 't1', retentionMs: 1000, bucketMs: 1000 });

      expect(result).toEqual(
        expect.objectContaining({
          rowsPruned: 7,
          bucketsWritten: 0,
          skipped: false,
          dryRun: false,
          stoppedEarly: false,
          wouldPrune: null,
          wouldWriteBuckets: null,
          cutoff: expect.any(Date),
        }),
      );
    });
  });

  describe('batched removal', () => {
    // Measured by the 1M-row scale probe: the single unbounded statement ran ~33s. Batches bound each
    // statement, and the deadline stops a pass that is out of budget so the next one continues.
    it('drains the backlog across batches and stops when a batch comes back short', async () => {
      const { service, executeRaw } = build({ deleteBatches: [5_000, 3_000] });

      const result = await service.rollupAndPrune({ tenantId: 't1', retentionMs: 1000, bucketMs: 1000 });

      expect(result.rowsPruned).toBe(8_000);
      expect(result.stoppedEarly).toBe(false);
      expect(executeRaw).toHaveBeenCalledTimes(2);
    });

    it('stops on the wall-clock budget and says so', async () => {
      const { service, executeRaw } = build({ deleteDelayMs: 5 });

      const result = await service.rollupAndPrune({
        tenantId: 't1',
        retentionMs: 1000,
        bucketMs: 1000,
        maxDurationMs: 1,
      });

      expect(result.stoppedEarly).toBe(true);
      expect(result.rowsPruned).toBe(5_000);
      expect(executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('aggregation', () => {
    it('writes one rollup row per aggregate with the bucket end derived from the bucket width and the last value from the aggregate itself', async () => {
      const { service, telemetryRollup } = build({ aggregates });

      await service.rollupAndPrune({ tenantId: 't1', retentionMs: 3_600_000, bucketMs: 900_000 });

      expect(telemetryRollup.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            tenantId: 't1',
            deviceId: 'd1',
            capabilityKey: 'temp',
            bucketStart: new Date('2026-07-20T09:00:00.000Z'),
            // The end is the start plus the declared width. Asserting the concrete number is what catches
            // a bucketEnd that disagrees with the bucket it claims to summarise.
            bucketEnd: new Date('2026-07-20T09:15:00.000Z'),
            sampleCount: 3,
            valueSum: 60,
            valueMin: 18,
            valueMax: 22,
            valueLast: 19,
          }),
        ],
      });
    });

    it('sends the last-value ordering inside the single aggregate query', async () => {
      const { service, queryRaw } = build({ aggregates });

      await service.rollupAndPrune({ tenantId: 't1', retentionMs: 3_600_000, bucketMs: 900_000 });

      // The per-bucket lookup this replaced had carried the bucket-bounds bug the live probe caught.
      // Ordering inside the aggregate is the shape that removes the bug class, so the assertion is on
      // the SQL actually sent, not on the source text.
      const sql = String((queryRaw.mock.calls[1][0] as string[]).join(''));
      expect(sql).toContain('array_agg(');
      expect(sql).toContain('ORDER BY t."createdAt" DESC');
    });

    it('replaces the expiring buckets instead of merging into them', async () => {
      const { service, telemetryRollup } = build({ aggregates });
      const now = new Date('2026-07-20T12:00:00.000Z');

      await service.rollupAndPrune({ tenantId: 'tenant-a', now, retentionMs: 3_600_000, bucketMs: 900_000 });

      // Bounded by the same cut-off the prune uses. A delete with no upper bound would also wipe live
      // buckets and take recent history with them, which is the opposite of retention.
      expect(telemetryRollup.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bucketStart: { lt: new Date('2026-07-20T11:00:00.000Z') },
          }),
        }),
      );
    });

    it('writes nothing at all when there is nothing to roll up', async () => {
      const { service, executeRaw, telemetryRollup } = build({
        aggregates: [],
      });

      const result = await service.rollupAndPrune({ tenantId: 't1', retentionMs: 3_600_000, bucketMs: 900_000 });

      expect(result.bucketsWritten).toBe(0);
      expect(telemetryRollup.createMany).not.toHaveBeenCalled();
      expect(telemetryRollup.deleteMany).not.toHaveBeenCalled();
      // The removal still runs: rows with no numeric payload to aggregate are still past the window.
      expect(executeRaw).toHaveBeenCalled();
    });
  });

  describe('dry run', () => {
    it('reports what a pass would do without writing or removing anything', async () => {
      const metrics = { recordTelemetryRetention: jest.fn() };
      const { service, executeRaw, telemetryRollup } = build({ aggregates, count: 12, metrics });

      const result = await service.rollupAndPrune({
        tenantId: 't1',
        retentionMs: 3_600_000,
        bucketMs: 900_000,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.skipped).toBe(false);
      // Nothing was written, so `bucketsWritten` stays 0; what the pass *would* write is reported
      // separately, which is what makes a dry run evidence instead of a guess.
      expect(result.bucketsWritten).toBe(0);
      expect(result.wouldWriteBuckets).toBe(1);
      expect(result.rowsPruned).toBe(0);
      expect(result.wouldPrune).toBe(12);
      expect(executeRaw).not.toHaveBeenCalled();
      expect(telemetryRollup.deleteMany).not.toHaveBeenCalled();
      expect(telemetryRollup.createMany).not.toHaveBeenCalled();
      expect(metrics.recordTelemetryRetention).toHaveBeenCalledWith(
        'dry_run',
        expect.any(Number),
        0,
        0,
        false,
      );
    });
  });

  describe('tenant scope', () => {
    // Found by the live probe: an unscoped prune removed another tenant's rows along with its own,
    // and nothing in the unit tests noticed because the mock answered whatever it was asked.
    it('refuses to run without a tenant rather than deleting across every tenant', async () => {
      const { service, prisma } = build();

      await expect(
        // @ts-expect-error -- deliberately omitting the tenant it requires
        service.rollupAndPrune({ retentionMs: 3_600_000, bucketMs: 900_000 }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('scopes the removal to the tenant it was given', async () => {
      const { service, executeRaw } = build();

      await service.rollupAndPrune({ tenantId: 'tenant-a', retentionMs: 1000, bucketMs: 1000 });

      expect(executeRaw.mock.calls[0].slice(1)).toContain('tenant-a');
    });
  });
});
