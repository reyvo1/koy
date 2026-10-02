import { DeviceRiskForecastingService } from './device-risk-forecasting.service';

/**
 * Behavioural coverage for the forecaster.
 *
 * The property that matters most here is that a trend is distinguished from a level: a device that has
 * always dropped commands and one whose drop rate is climbing are in different situations, and only
 * comparing two windows tells them apart.
 */
describe('DeviceRiskForecastingService', () => {
  const NOW = new Date('2026-07-20T12:00:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;

  const build = (
    overrides: {
      device?: unknown;
      openMaintenance?: unknown;
      recent?: string[];
      prior?: string[];
      findings?: string[];
    } = {},
  ) => {
    const device = {
      findFirst: jest.fn().mockResolvedValue(
        overrides.device === undefined ? { id: 'd1', lastHeartbeatAt: NOW } : overrides.device,
      ),
      update: jest.fn().mockResolvedValue({}),
    };
    const deviceMaintenance = {
      findFirst: jest.fn().mockResolvedValue(overrides.openMaintenance ?? null),
    };
    const deviceCommand = { findMany: jest.fn() };
    const analyticsFinding = {
      findMany: jest
        .fn()
        .mockResolvedValue((overrides.findings ?? []).map((severity) => ({ severity }))),
    };

    const prisma = { device, deviceMaintenance, deviceCommand, analyticsFinding } as never;
    const service = new DeviceRiskForecastingService(prisma);

    // Recent window first, then the earlier one: the service reads them concurrently.
    deviceCommand.findMany
      .mockResolvedValueOnce((overrides.recent ?? []).map((status) => ({ status })))
      .mockResolvedValueOnce((overrides.prior ?? []).map((status) => ({ status })));

    return { service, device, deviceMaintenance, deviceCommand, update: device.update };
  };

  const forecast = (service: DeviceRiskForecastingService, extra = {}) =>
    service.forecast({ tenantId: 't1', deviceId: 'd1', now: NOW, recentWindowMs: DAY, priorWindowMs: 7 * DAY, ...extra });

  const ok = (count: number) => Array.from({ length: count }, () => 'ACKNOWLEDGED');

  describe('option validation', () => {
    it('refuses to forecast without a tenant', async () => {
      const { service, device } = build();

      await expect(
        // @ts-expect-error -- deliberately omitting the tenant it requires
        service.forecast({ deviceId: 'd1' }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(device.findFirst).not.toHaveBeenCalled();
    });

    it.each([
      ['zero recentWindowMs', { recentWindowMs: 0 }],
      ['negative priorWindowMs', { priorWindowMs: -1 }],
      ['zero minCommands', { minCommands: 0 }],
    ])('refuses a %s', async (_label, extra) => {
      const { service, device } = build();

      await expect(forecast(service, extra)).rejects.toBeInstanceOf(RangeError);
      expect(device.findFirst).not.toHaveBeenCalled();
    });

    it('refuses a device outside the tenant', async () => {
      const { service } = build({ device: null });

      await expect(forecast(service)).rejects.toBeInstanceOf(RangeError);
    });
  });

  describe('scoping', () => {
    it('looks the device up inside the tenant', async () => {
      const { service, device } = build();

      await forecast(service);

      expect(device.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'd1', tenantId: 't1' } }),
      );
    });

    it('reads commands twice, for the recent and the earlier window', async () => {
      const { service, deviceCommand } = build();

      await forecast(service);

      expect(deviceCommand.findMany).toHaveBeenCalledTimes(2);
      const recentCall = deviceCommand.findMany.mock.calls[0][0];
      const priorCall = deviceCommand.findMany.mock.calls[1][0];
      expect(recentCall.where.createdAt).toEqual({ gte: new Date(NOW.getTime() - DAY) });
      expect(priorCall.where.createdAt).toEqual({
        gte: new Date(NOW.getTime() - 8 * DAY),
        lt: new Date(NOW.getTime() - DAY),
      });
    });
  });

  describe('open maintenance', () => {
    it('defers to an already-open maintenance record instead of forecasting over it', async () => {
      const { service, deviceCommand, update } = build({ openMaintenance: { id: 'm1' } });

      const result = await forecast(service);

      // Forecasting on top of work an operator already picked up produces a second, conflicting
      // instruction for the same device.
      expect(result.band).toBe('NOT_ESTABLISHED');
      expect(result.horizonDays).toBeNull();
      expect(result.evidence.join(' ')).toContain('already open');
      expect(deviceCommand.findMany).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalled();
    });

    it('looks for an open record inside the tenant and device', async () => {
      const { service, deviceMaintenance } = build();

      await forecast(service);

      expect(deviceMaintenance.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1', deviceId: 'd1', status: 'OPEN' },
        }),
      );
    });
  });

  describe('insufficient evidence', () => {
    it('declines to band a device with fewer than minCommands recently', async () => {
      const { service } = build({ recent: ['ACKNOWLEDGED', 'FAILED'], prior: ok(10) });

      const result = await forecast(service);

      // "Stable" here would rank the least-observed devices as the safest, which is backwards.
      expect(result.band).toBe('NOT_ESTABLISHED');
      expect(result.horizonDays).toBeNull();
      expect(result.evidence.join(' ')).toContain('need at least');
    });

    it('declines when there is no earlier window to compare against', async () => {
      const { service } = build({ recent: ok(10), prior: [] });

      expect((await forecast(service)).band).toBe('NOT_ESTABLISHED');
    });
  });

  describe('trend versus level', () => {
    it('treats a device that has always failed at a high rate as IMMINENT', async () => {
      const { service } = build({
        recent: ['FAILED', 'FAILED', 'FAILED', 'ACKNOWLEDGED', 'ACKNOWLEDGED'],
        prior: ['FAILED', 'FAILED', 'FAILED', 'FAILED', 'FAILED'],
      });

      const result = await forecast(service);

      expect(result.band).toBe('IMMINENT');
      expect(result.horizonDays).toBe(1);
    });

    it('treats a device that has always failed at a LOW, steady rate as WATCH rather than IMMINENT', async () => {
      // The same two failing commands in both windows: the level is unchanged, so the trend is flat. The
      // difference from the case above is the point -- only the trend separates them.
      const { service } = build({
        recent: ['FAILED', 'FAILED', 'ACKNOWLEDGED', 'ACKNOWLEDGED', 'ACKNOWLEDGED', 'ACKNOWLEDGED'],
        prior: ['FAILED', 'FAILED', 'ACKNOWLEDGED', 'ACKNOWLEDGED', 'ACKNOWLEDGED', 'ACKNOWLEDGED'],
      });

      expect((await forecast(service)).band).toBe('WATCH');
    });

    it('bands a rising failure rate DECLINING with a horizon that shrinks as it rises', async () => {
      // Recent rate 0.2 sits below the IMMINENT line; the earlier window was clean, so the trend is +0.2.
      const { service } = build({
        recent: ['FAILED', 'FAILED', ...ok(8)],
        prior: ok(10),
      });

      const result = await forecast(service);

      expect(result.band).toBe('DECLINING');
      expect(result.horizonDays).toBeGreaterThanOrEqual(2);
      expect(result.horizonDays).toBeLessThan(10);
    });

    it('bands a clean device with no failures as STABLE', async () => {
      const { service } = build({ recent: ok(10), prior: ok(10) });

      const result = await forecast(service);

      expect(result.band).toBe('STABLE');
      expect(result.horizonDays).toBe(30);
    });

    it('counts TIMED_OUT as a failure, since from the device the outcome is the same', async () => {
      const { service } = build({
        recent: ['TIMED_OUT', 'TIMED_OUT', 'TIMED_OUT', 'ACKNOWLEDGED', 'ACKNOWLEDGED'],
        prior: ok(10),
      });

      expect((await forecast(service)).band).toBe('IMMINENT');
    });

    it('escalates to IMMINENT when critical findings are climbing alongside failures', async () => {
      const { service } = build({
        recent: ['FAILED', 'ACKNOWLEDGED', 'ACKNOWLEDGED', 'ACKNOWLEDGED', 'ACKNOWLEDGED'],
        prior: ok(10),
        findings: ['CRITICAL', 'CRITICAL', 'CRITICAL'],
      });

      expect((await forecast(service)).band).toBe('IMMINENT');
    });
  });

  describe('evidence and persistence', () => {
    it('reports both windows in the evidence so the band can be argued with', async () => {
      const { service } = build({ recent: ok(10), prior: ok(10) });

      const result = await forecast(service);

      const text = result.evidence.join(' | ');
      // Zero failures reported as "0/10", not a rounding of a percentage.
      expect(text).toContain('0/10 commands failed recently');
      expect(text).toContain('0/10 failed in the earlier window');
      expect(text).toContain('0 critical anomaly');
      expect(text).toContain('trend');
    });

    it('stores the band, the horizon, the clock and the version', async () => {
      const { service, update } = build({ recent: ok(10), prior: ok(10) });

      await forecast(service);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: {
          riskBand: 'STABLE',
          riskHorizonDays: 30,
          riskEvaluatedAt: NOW,
          riskForecastVersion: DeviceRiskForecastingService.FORECAST_VERSION,
        },
      });
    });

    it('stores a null horizon when it declines to band', async () => {
      const { service, update } = build({ recent: ['ACKNOWLEDGED'], prior: ok(10) });

      await forecast(service);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ riskBand: 'NOT_ESTABLISHED', riskHorizonDays: null }),
        }),
      );
    });
  });
});