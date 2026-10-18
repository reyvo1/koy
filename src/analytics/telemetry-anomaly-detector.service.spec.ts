import { TelemetryAnomalyDetector } from './telemetry-anomaly-detector.service';

/**
 * Behavioural coverage for the detector's arithmetic and its persistence rules.
 *
 * The contract spec reads the source, which cannot tell whether the median is actually computed or merely
 * named. These drive the service and assert on what it does with real values.
 */
describe('TelemetryAnomalyDetector', () => {
  const build = () => {
    let createdCount = 0;
    const analyticsFinding = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(async () => ({ id: `finding-${(createdCount += 1)}` })),
    };
    const telemetry = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = { analyticsFinding, telemetry } as never;

    return {
      service: new TelemetryAnomalyDetector(prisma),
      analyticsFinding,
      telemetry,
    };
  };

  const rows = (values: number[]) =>
    values.map((value, index) => ({
      id: `t${index}`,
      createdAt: new Date(Date.UTC(2026, 6, 20, 10, index)),
      payload: { temp: value },
    }));

  const base = {
    tenantId: 't1',
    deviceId: 'd1',
    capabilityKey: 'temp',
    now: new Date('2026-07-20T12:00:00.000Z'),
  };

  describe('option validation', () => {
    it('refuses to run without a tenant', async () => {
      const { service, analyticsFinding, telemetry } = build();

      await expect(
        // @ts-expect-error -- deliberately omitting the tenant it requires
        service.detect({ deviceId: 'd1', capabilityKey: 'temp' }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(telemetry.findMany).not.toHaveBeenCalled();
      expect(analyticsFinding.create).not.toHaveBeenCalled();
    });

    it.each([
      ['zero deviation multiplier', { deviationMultiplier: 0 }],
      ['negative deviation multiplier', { deviationMultiplier: -3 }],
      ['zero minSamples', { minSamples: 0 }],
      ['negative window', { window: -1 }],
    ])('refuses a %s', async (_label, extra) => {
      const { service, telemetry } = build();

      await expect(service.detect({ ...base, ...extra })).rejects.toBeInstanceOf(RangeError);
      expect(telemetry.findMany).not.toHaveBeenCalled();
    });

    it('bounds the read it issues', async () => {
      const { service, telemetry } = build();

      await service.detect({ ...base, window: 42 });

      expect(telemetry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 42, where: expect.objectContaining({ tenantId: 't1' }) }),
      );
    });
  });

  describe('sample selection', () => {
    it('reports nothing and writes nothing when the window holds too few samples', async () => {
      const { service, telemetry, analyticsFinding } = build();
      telemetry.findMany.mockResolvedValue(rows([20, 21, 22]));

      const result = await service.detect({ ...base, minSamples: 8 });

      // Not "no anomalies found" -- too little history is not evidence of normality, and the caller is
      // told the difference by the evaluated count being below the threshold.
      expect(result).toEqual({ evaluated: 3, findings: 0, createdFindings: [] });
      expect(analyticsFinding.create).not.toHaveBeenCalled();
    });

    it('ignores samples whose value is not a finite number', async () => {
      const { service, telemetry } = build();
      telemetry.findMany.mockResolvedValue([
        ...rows([20, 20, 20, 20, 20, 20, 20, 20]),
        { id: 'x', createdAt: new Date(), payload: { temp: 'warm' } },
        { id: 'y', createdAt: new Date(), payload: { temp: null } },
      ]);

      const result = await service.detect({ ...base, minSamples: 8 });

      expect(result.evaluated).toBe(8);
    });

    it('ignores rows carrying a different capability key', async () => {
      const { service, telemetry } = build();
      telemetry.findMany.mockResolvedValue([
        ...rows([20, 20, 20, 20, 20, 20, 20, 20]),
        { id: 'z', createdAt: new Date(), payload: { humidity: 80 } },
      ]);

      const result = await service.detect({ ...base, minSamples: 8 });

      expect(result.evaluated).toBe(8);
    });
  });

  describe('the arithmetic', () => {
    /**
     * The case the whole design exists for. Mean and standard deviation both move toward the spike, so a
     * naive detector scores 100 as unremarkable among these values. Median and MAD do not move, so it is
     * correctly identified. The numbers here are chosen so the naive calculation genuinely fails.
     */
    it('flags a single large spike that a mean-and-deviation baseline would hide', async () => {
      const { service, telemetry, analyticsFinding } = build();
      telemetry.findMany.mockResolvedValue(rows([10, 11, 10, 12, 11, 10, 11, 12, 100]));

      const result = await service.detect({ ...base, minSamples: 8, deviationMultiplier: 3 });

      expect(result.findings).toBe(1);
      expect(analyticsFinding.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ evidenceTelemetryId: 't8', kind: 'ANOMALY' }),
        }),
      );
    });

    it('does not flag a steady series that merely trends slightly', async () => {
      const { service, telemetry, analyticsFinding } = build();
      telemetry.findMany.mockResolvedValue(rows([20, 20.5, 21, 20.2, 20.8, 20.1, 20.4, 20.6]));

      const result = await service.detect({ ...base, minSamples: 8, deviationMultiplier: 3 });

      expect(result.findings).toBe(0);
      expect(analyticsFinding.create).not.toHaveBeenCalled();
    });

    it('reports nothing for a perfectly flat series, where every deviation would be infinite', async () => {
      const { service, telemetry, analyticsFinding } = build();
      telemetry.findMany.mockResolvedValue(rows([7, 7, 7, 7, 7, 7, 7, 7]));

      const result = await service.detect({ ...base, minSamples: 8, deviationMultiplier: 3 });

      expect(result.findings).toBe(0);
      expect(analyticsFinding.create).not.toHaveBeenCalled();
    });

    // With zero spread, a sample that moves IS a deviation -- the series stopped being constant.
    it('flags a value that moves away from an otherwise perfectly flat series', async () => {
      const { service, telemetry } = build();
      telemetry.findMany.mockResolvedValue(rows([7, 7, 7, 7, 7, 7, 7, 9]));

      const result = await service.detect({ ...base, minSamples: 8, deviationMultiplier: 3 });

      expect(result.findings).toBe(1);
    });

    it('grades severity and confidence from how far the sample sits from the baseline', async () => {
      const { service, telemetry, analyticsFinding } = build();
      // Median of [10,10,10,10,10,11,11,11,40] is 10; the absolute deviations are [0,0,0,0,0,1,1,1,30],
      // whose median is 1. So the 40 sits (40-10)/1 = 30 deviations out. At a 3x multiplier, WARNING
      // starts at 6 and CRITICAL at 12, which makes this unambiguously CRITICAL.
      telemetry.findMany.mockResolvedValue(rows([10, 10, 11, 10, 11, 10, 10, 11, 40]));

      await service.detect({ ...base, minSamples: 8, deviationMultiplier: 3 });

      expect(analyticsFinding.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ severity: 'CRITICAL' }),
        }),
      );
    });

    it('records the pinned detector version on every finding', async () => {
      const { service, telemetry, analyticsFinding } = build();
      telemetry.findMany.mockResolvedValue(rows([10, 11, 10, 12, 11, 10, 11, 12, 100]));

      await service.detect({ ...base, minSamples: 8, deviationMultiplier: 3 });

      expect(analyticsFinding.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            detectorVersion: TelemetryAnomalyDetector.DETECTOR_VERSION,
          }),
        }),
      );
    });
  });

  describe('persistence', () => {
    it('does not write a second finding for a sample it already reported', async () => {
      const { service, telemetry, analyticsFinding } = build();
      telemetry.findMany.mockResolvedValue(rows([10, 11, 10, 12, 11, 10, 11, 12, 100]));
      analyticsFinding.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await service.detect({ ...base, minSamples: 8, deviationMultiplier: 3 });

      expect(result.findings).toBe(0);
      expect(analyticsFinding.create).not.toHaveBeenCalled();
      // The lookup is scoped to the tenant, the device and the capability. An unscoped existence check
      // would suppress a genuine finding on another device that happened to share a sample id.
      expect(analyticsFinding.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 't1',
            deviceId: 'd1',
            capabilityKey: 'temp',
          }),
        }),
      );
    });

    it('writes one finding per anomalous sample', async () => {
      const { service, telemetry, analyticsFinding } = build();
      telemetry.findMany.mockResolvedValue(rows([10, 10, 10, 10, 10, 10, 10, 200, -200]));

      const result = await service.detect({ ...base, minSamples: 8, deviationMultiplier: 3 });

      expect(result.findings).toBe(2);
      expect(analyticsFinding.create).toHaveBeenCalledTimes(2);
    });

    it('returns the rows it created so a fan-out can identify exactly them', async () => {
      const { service, telemetry } = build();
      telemetry.findMany.mockResolvedValue(rows([10, 11, 10, 12, 11, 10, 11, 12, 100]));

      const result = await service.detect({ ...base, minSamples: 8, deviationMultiplier: 3 });

      // The counts alone cannot make a downstream notification idempotent: the caller needs the
      // persisted identity of each created row, not a number it would have to re-derive by time.
      expect(result.createdFindings).toHaveLength(1);
      expect(result.createdFindings[0]).toEqual(
        expect.objectContaining({
          id: 'finding-1',
          severity: 'CRITICAL',
          capabilityKey: 'temp',
          summary: expect.stringContaining('temp read 100'),
        }),
      );
    });
  });
});