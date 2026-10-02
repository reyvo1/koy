import { EnergyIntelligenceService } from './energy-intelligence.service';

/**
 * Behavioural coverage for the energy service.
 *
 * Two properties carry the weight here. A power reading must be refused rather than converted, because a
 * wrong energy number is indistinguishable from a right one once it reaches a report. And a total must
 * never claim completeness it does not have.
 */
describe('EnergyIntelligenceService', () => {
  const FROM = new Date('2026-07-10T00:00:00.000Z');
  const TO = new Date('2026-07-11T00:00:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;

  const build = (
    overrides: {
      capabilities?: { key: string; unit: string | null; deviceId: string }[];
      rollups?: {
        deviceId: string;
        capabilityKey: string;
        bucketStart: Date;
        bucketEnd: Date;
        valueSum: number;
      }[];
    } = {},
  ) => {
    const capability = {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (overrides.capabilities ?? [{ key: 'energy', unit: 'kWh', deviceId: 'd1' }]).map((entry) => ({
            id: `cap-${entry.deviceId}-${entry.key}`,
            key: entry.key,
            unit: entry.unit,
            deviceId: entry.deviceId,
          })),
        ),
    };
    const telemetryRollup = {
      findMany: jest.fn().mockResolvedValue(overrides.rollups ?? []),
    };
    const prisma = { capability, telemetryRollup } as never;

    return { service: new EnergyIntelligenceService(prisma), capability, telemetryRollup };
  };

  const summarise = (service: EnergyIntelligenceService, extra = {}) =>
    service.summarise({ tenantId: 't1', from: FROM, to: TO, ...extra });

  // `index` counts back from the end of the current period: 0 is the last bucket inside it, 1 is the one
  // before. bucketStart/bucketEnd are then a clean day aligned to TO, so a bucket either lies wholly inside
  // the period or wholly outside it -- which is what makes the boundary test meaningful.
  const bucket = (index: number, valueSum: number, deviceId = 'd1', key = 'energy') => ({
    deviceId,
    capabilityKey: key,
    bucketStart: new Date(TO.getTime() - (index + 1) * DAY),
    bucketEnd: new Date(TO.getTime() - index * DAY),
    valueSum,
  });

  describe('option validation', () => {
    it('refuses to run without a tenant', async () => {
      const { service, capability } = build();

      await expect(
        // @ts-expect-error -- deliberately omitting the tenant it requires
        service.summarise({ from: FROM, to: TO }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(capability.findMany).not.toHaveBeenCalled();
    });

    it('refuses a period that ends before it starts', async () => {
      const { service } = build();

      await expect(
        service.summarise({ tenantId: 't1', from: TO, to: FROM }),
      ).rejects.toBeInstanceOf(RangeError);
    });

    it('refuses an invalid date', async () => {
      const { service } = build();

      await expect(
        service.summarise({ tenantId: 't1', from: new Date('nonsense'), to: TO }),
      ).rejects.toBeInstanceOf(RangeError);
    });
  });

  describe('what counts as energy', () => {
    it('sums rollups for a capability whose unit says kWh', async () => {
      const { service } = build({
        capabilities: [{ key: 'energy', unit: 'kWh', deviceId: 'd1' }],
        // Two buckets both inside the one-day period, so the total is their sum.
        rollups: [
          { ...bucket(0, 5), bucketStart: new Date(TO.getTime() - 3 * 3600_000), bucketEnd: new Date(TO.getTime() - 2 * 3600_000) },
          { ...bucket(0, 3.5), bucketStart: new Date(TO.getTime() - 3600_000), bucketEnd: TO },
        ],
      });

      const result = await summarise(service);

      expect(result.total).toBe(8.5);
    });

    it('matches the unit case-insensitively', async () => {
      const { service } = build({
        capabilities: [{ key: 'energy', unit: '  KWH ', deviceId: 'd1' }],
        rollups: [bucket(0, 4)],
      });

      expect((await summarise(service)).total).toBe(4);
    });

    /**
     * The trap. Watts are a rate; energy is a rate over time, and the rollups do not record the sampling
     * interval. Converting one into the other with a guessed interval produces a number that looks exactly
     * like energy and is wrong by a factor nobody can recover afterwards.
     */
    it('refuses to read a power capability as energy', async () => {
      const { service } = build({
        capabilities: [{ key: 'power', unit: 'W', deviceId: 'd1' }],
        rollups: [bucket(0, 900), bucket(1, 800)],
      });

      const result = await summarise(service);

      expect(result.total).toBe(0);
      expect(result.unit).toBeNull();
      expect(result.rejectedCapabilities.join(' ')).toContain('power reports W');
      expect(result.note).toContain('cannot be converted');
    });

    it('refuses amps too, rather than treating any unit as interchangeable', async () => {
      const { service } = build({
        capabilities: [{ key: 'current', unit: 'A', deviceId: 'd1' }],
      });

      expect((await summarise(service)).total).toBe(0);
    });

    it('reports a tenant with no energy capability at all', async () => {
      const { service } = build({ capabilities: [{ key: 'temp', unit: 'C', deviceId: 'd1' }] });

      const result = await summarise(service);

      expect(result.total).toBe(0);
      expect(result.contributingDevices).toBe(0);
      expect(result.note).toBe('No energy capability found in this tenant');
    });

    it('ignores a capability with no unit rather than guessing one', async () => {
      const { service } = build({
        capabilities: [{ key: 'energy', unit: null, deviceId: 'd1' }],
        rollups: [bucket(0, 99)],
      });

      expect((await summarise(service)).total).toBe(0);
    });
  });

  describe('scoping and bounds', () => {
    it('scopes capabilities through the device to the tenant', async () => {
      const { service, capability } = build();

      await summarise(service);

      expect(capability.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { device: { tenantId: 't1' } },
        }),
      );
    });

    it('reads the window plus the preceding period of the same length', async () => {
      const { service, telemetryRollup } = build();

      await summarise(service);

      // One day back from `from` is one day before `to`, so the previous period is queried too.
      expect(telemetryRollup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bucketStart: { gte: new Date(FROM.getTime() - DAY), lt: TO },
          }),
        }),
      );
    });

    it('excludes a rollup whose bucket straddles the period boundary', async () => {
      const { service } = build({
        capabilities: [{ key: 'energy', unit: 'kWh', deviceId: 'd1' }],
        rollups: [
          { deviceId: 'd1', capabilityKey: 'energy', bucketStart: new Date(FROM.getTime() - 3600_000), bucketEnd: FROM, valueSum: 100 },
          bucket(0, 5),
        ],
      });

      // A partial bucket would contribute an amount that looks like a whole one.
      expect((await summarise(service)).total).toBe(5);
    });
  });

  describe('comparison', () => {
    it('reports an increase with its ratio against the previous period', async () => {
      const { service } = build({
        // index 0 is the current day, index 1 the day before, so the ratio is 12 against 6.
        rollups: [bucket(0, 12), bucket(1, 6)],
      });

      const result = await summarise(service);

      expect(result.total).toBe(12);
      expect(result.previousTotal).toBe(6);
      expect(result.direction).toBe('increase');
      expect(result.change).toBe(1);
    });

    it('reports a decrease', async () => {
      const { service } = build({ rollups: [bucket(0, 3), bucket(1, 12)] });

      const result = await summarise(service);

      expect(result.direction).toBe('decrease');
      expect(result.change).toBe(-0.75);
    });

    it('calls a small movement flat rather than reporting noise as a trend', async () => {
      const { service } = build({ rollups: [bucket(0, 101), bucket(1, 100)] });

      expect((await summarise(service)).direction).toBe('flat');
    });

    /**
     * The reason `change` is nullable. A percentage change against a zero baseline is Infinity, and against
     * no baseline is NaN. Either one renders on a dashboard as a number nobody can interpret.
     */
    it('gives a null change rather than Infinity when the previous period was zero', async () => {
      const { service } = build({ rollups: [bucket(0, 10)] });

      const result = await summarise(service);

      expect(result.change).toBeNull();
      expect(Number.isFinite(result.change as unknown as number)).toBe(false);
      expect(result.direction).toBe('flat');
    });

    it('gives a null change when there is no previous period at all', async () => {
      const { service } = build();

      const result = await summarise(service);

      expect(result.change).toBeNull();
      expect(result.total).toBe(0);
    });
  });

  describe('coverage', () => {
    it('breaks the total down per device, biggest first', async () => {
      const { service } = build({
        capabilities: [
          { key: 'energy', unit: 'kWh', deviceId: 'd1' },
          { key: 'energy', unit: 'kWh', deviceId: 'd2' },
        ],
        rollups: [bucket(0, 5, 'd1'), bucket(0, 9, 'd2')],
      });

      const result = await summarise(service);

      expect(result.perDevice).toEqual([
        { deviceId: 'd2', total: 9 },
        { deviceId: 'd1', total: 5 },
      ]);
      expect(result.contributingDevices).toBe(2);
    });

    /**
     * A total that omits silent devices reads as the tenant's complete consumption. The note is what stops
     * that being the reading.
     */
    it('says so when an energy device reported nothing in the period', async () => {
      const { service } = build({
        capabilities: [
          { key: 'energy', unit: 'kWh', deviceId: 'd1' },
          { key: 'energy', unit: 'kWh', deviceId: 'd2' },
        ],
        rollups: [bucket(0, 5, 'd1')],
      });

      const result = await summarise(service);

      expect(result.contributingDevices).toBe(1);
      expect(result.note).toContain('1 of 2 energy devices reported nothing');
    });

    it('carries no note when every device reported', async () => {
      const { service } = build({
        capabilities: [
          { key: 'energy', unit: 'kWh', deviceId: 'd1' },
          { key: 'energy', unit: 'kWh', deviceId: 'd2' },
        ],
        rollups: [bucket(0, 5, 'd1'), bucket(0, 5, 'd2')],
      });

      expect((await summarise(service)).note).toBeNull();
    });

    it('can be asked to skip the per-device breakdown', async () => {
      const { service } = build({ rollups: [bucket(0, 5)] });

      expect((await summarise(service, { perDevice: false })).perDevice).toEqual([]);
    });
  });
});