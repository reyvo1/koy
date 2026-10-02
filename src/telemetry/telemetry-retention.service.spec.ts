import { TelemetryRetentionService } from './telemetry-retention.service';

/**
 * Behavioural coverage for the retention window arithmetic.
 *
 * The contract spec reads the source, which cannot tell whether the two steps actually share a cut-off
 * or whether the validation runs before any write. This drives the service with a recording Prisma mock
 * and asserts on the arguments it received.
 */
describe('TelemetryRetentionService', () => {
  // The handles returned are the ones actually injected. An earlier version returned the mocks it had
  // created while a caller could override them, so a test holding the returned handle was asserting
  // against a mock nothing had called -- and the assertion below it failed with a confusing
  // "cannot read slice of undefined" rather than saying what was wrong.
  const build = (overrides: { $queryRaw?: jest.Mock } = {}) => {
    const telemetry = {
      deleteMany: jest.fn().mockResolvedValue({ count: 7 }),
    };
    const telemetryRollup = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    };
    const $queryRaw = overrides.$queryRaw ?? jest.fn().mockResolvedValue([]);

    const service = new TelemetryRetentionService({
      telemetry,
      telemetryRollup,
      $queryRaw,
    } as never);

    return { service, telemetry, telemetryRollup, $queryRaw };
  };

  const aggregates = [
    {
      tenantId: 't1',
      deviceId: 'd1',
      capabilityKey: 'temp',
      bucketStart: new Date('2026-07-20T09:00:00.000Z'),
      sampleCount: 3,
      valueSum: 60,
      valueMin: 18,
      valueMax: 22,
    },
  ];

  describe('window validation', () => {
    it.each([
      ['zero', 0],
      ['negative', -1000],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
    ])('refuses a %s retention window before touching the database', async (_label, retentionMs) => {
      const { service, telemetry, telemetryRollup } = build();

      await expect(
        service.rollupAndPrune({ tenantId: 't1', retentionMs, bucketMs: 60_000 }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(telemetry.deleteMany).not.toHaveBeenCalled();
      expect(telemetryRollup.deleteMany).not.toHaveBeenCalled();
    });

    it.each([
      ['zero', 0],
      ['negative', -1],
      ['NaN', Number.NaN],
    ])('refuses a %s bucket width before touching the database', async (_label, bucketMs) => {
      const { service, telemetry, telemetryRollup } = build();

      await expect(
        service.rollupAndPrune({ tenantId: 't1', retentionMs: 86_400_000, bucketMs }),
      ).rejects.toBeInstanceOf(RangeError);
      // Both writes are checked, matching the retention case above. A bucket width of zero would
      // otherwise be caught only after the rollup had already replaced real buckets.
      expect(telemetry.deleteMany).not.toHaveBeenCalled();
      expect(telemetryRollup.deleteMany).not.toHaveBeenCalled();
      expect(telemetryRollup.create).not.toHaveBeenCalled();
    });
  });

  describe('cut-off agreement', () => {
    // The property the whole design rests on. If the rollup and the prune disagree about which window is
    // expiring, every retained sample is re-counted on the next pass and the chart over-reports.
    it('gives the rollup and the prune the same cut-off', async () => {
      const { service, telemetry, $queryRaw } = build({
        $queryRaw: jest.fn().mockResolvedValue(aggregates),
      });
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
      // bound, which is exactly the property under test.
      const boundValues = $queryRaw.mock.calls[0].slice(1);
      expect(boundValues).toContainEqual(expectedCutoff);

      const pruneArgs = (telemetry.deleteMany as jest.Mock).mock.calls[0][0];
      expect(pruneArgs.where.createdAt.lt).toEqual(expectedCutoff);
    });

    it('reports the pruned count rather than a boolean', async () => {
      const { service } = build();

      const result = await service.rollupAndPrune({ tenantId: 't1', retentionMs: 1000, bucketMs: 1000 });

      expect(result).toEqual(
        expect.objectContaining({ rowsPruned: 7, bucketsWritten: 0, cutoff: expect.any(Date) }),
      );
    });
  });

  describe('aggregation', () => {
    it('writes one rollup row per aggregate with the bucket end derived from the bucket width', async () => {
      const $queryRaw = jest
        .fn()
        // The aggregate query, then the last-value lookup for that bucket.
        .mockResolvedValueOnce(aggregates)
        .mockResolvedValue([{ value: 19 }]);
      const { service, telemetryRollup } = build({ $queryRaw });

      await service.rollupAndPrune({ tenantId: 't1', retentionMs: 3_600_000, bucketMs: 900_000 });

      expect(telemetryRollup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
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
      });
    });

    it('replaces the expiring buckets instead of merging into them', async () => {
      const $queryRaw = jest
        .fn()
        .mockResolvedValueOnce(aggregates)
        .mockResolvedValue([{ value: 19 }]);
      const { service, telemetryRollup } = build({ $queryRaw });
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
      const { service, telemetry, telemetryRollup } = build({
        $queryRaw: jest.fn().mockResolvedValue([]),
      });

      const result = await service.rollupAndPrune({ tenantId: 't1', retentionMs: 3_600_000, bucketMs: 900_000 });

      expect(result.bucketsWritten).toBe(0);
      expect(telemetryRollup.create).not.toHaveBeenCalled();
      // The prune still runs: rows with no numeric payload to aggregate are still past the window.
      expect(telemetry.deleteMany).toHaveBeenCalled();
    });
  });
  describe('tenant scope', () => {
    // Found by the live probe: an unscoped prune removed another tenant's rows along with its own,
    // and nothing in the unit tests noticed because the mock answered whatever it was asked.
    it('refuses to run without a tenant rather than deleting across every tenant', async () => {
      const { service, telemetry, telemetryRollup } = build();

      await expect(
        // @ts-expect-error -- deliberately omitting the tenant it requires
        service.rollupAndPrune({ retentionMs: 3_600_000, bucketMs: 900_000 }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(telemetry.deleteMany).not.toHaveBeenCalled();
      expect(telemetryRollup.deleteMany).not.toHaveBeenCalled();
    });

    it('scopes the prune to the tenant it was given', async () => {
      const { service, telemetry } = build();

      await service.rollupAndPrune({ tenantId: 'tenant-a', retentionMs: 1000, bucketMs: 1000 });

      expect((telemetry.deleteMany as jest.Mock).mock.calls[0][0].where.tenantId).toBe('tenant-a');
    });
  });

  describe('bucket bounds', () => {
    // The other live-probe finding: the last-value lookup was bounded by the cut-off instead of by the
    // end of its own bucket, so every bucket reported the newest value before the cut-off. Bucket one
    // returned 30 -- a value from bucket two -- and a mock cannot catch that because it returns whatever
    // the test tells it to.
    it('bounds the last-value lookup by the end of its own bucket, not by the cut-off', async () => {
      const $queryRaw = jest
        .fn()
        .mockResolvedValueOnce(aggregates)
        .mockResolvedValue([{ value: 22 }]);
      const { service } = build({ $queryRaw });
      const now = new Date('2026-07-20T12:00:00.000Z');

      await service.rollupAndPrune({ tenantId: 'tenant-a', now, retentionMs: 3_600_000, bucketMs: 900_000 });

      const lastLookup = $queryRaw.mock.calls[1].slice(1);
      // 09:00 + 15 minutes. The cut-off would be 11:00 and would sweep in two later buckets.
      expect(lastLookup).toContainEqual(new Date('2026-07-20T09:15:00.000Z'));
      expect(lastLookup).not.toContainEqual(new Date('2026-07-20T11:00:00.000Z'));
    });
  });
});
