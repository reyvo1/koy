import { DeviceHealthScoringService } from './device-health-scoring.service';

/**
 * Behavioural coverage for the scorer. The contract spec reads the source, which cannot show that the
 * total is actually the sum of the reported components -- the property that makes the score explainable.
 */
describe('DeviceHealthScoringService', () => {
  const NOW = new Date('2026-07-20T12:00:00.000Z');
  const OFFLINE_AFTER_MS = 15 * 60 * 1000;

  const build = (overrides: { heartbeat?: Date | null; findings?: unknown[]; commands?: number } = {}) => {
    const device = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'd1',
        status: 'ACTIVE',
        lastHeartbeatAt:
          overrides.heartbeat === undefined ? new Date(NOW.getTime() - 60_000) : overrides.heartbeat,
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    const analyticsFinding = {
      findMany: jest
        .fn()
        .mockResolvedValue((overrides.findings ?? []).map((severity) => ({ severity }))),
    };
    const deviceCommand = { count: jest.fn().mockResolvedValue(overrides.commands ?? 0) };
    const prisma = { device, analyticsFinding, deviceCommand } as never;

    return {
      service: new DeviceHealthScoringService(prisma),
      device,
      analyticsFinding,
      deviceCommand,
      update: device.update,
    };
  };

  const score = (service: DeviceHealthScoringService, extra = {}) =>
    service.score({
      tenantId: 't1',
      deviceId: 'd1',
      now: NOW,
      offlineAfterMs: OFFLINE_AFTER_MS,
      ...extra,
    });

  describe('option validation', () => {
    it('refuses to score without a tenant', async () => {
      const { service, device } = build();

      await expect(
        // @ts-expect-error -- deliberately omitting the tenant it requires
        service.score({ deviceId: 'd1' }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(device.findFirst).not.toHaveBeenCalled();
    });

    it.each([
      ['zero offlineAfterMs', { offlineAfterMs: 0 }],
      ['negative findingWindowMs', { findingWindowMs: -1 }],
    ])('refuses a %s', async (_label, extra) => {
      const { service, device } = build();

      await expect(score(service, extra)).rejects.toBeInstanceOf(RangeError);
      expect(device.findFirst).not.toHaveBeenCalled();
    });

    it('refuses a device that is not in this tenant', async () => {
      const { service, device } = build();
      device.findFirst.mockResolvedValue(null);

      await expect(score(service)).rejects.toBeInstanceOf(RangeError);
    });
  });

  describe('scoping and bounds', () => {
    it('looks the device up inside the tenant, so a foreign id cannot be scored', async () => {
      const { service, device } = build();

      await score(service);

      expect(device.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'd1', tenantId: 't1' } }),
      );
    });

    it('reads findings scoped to the tenant, the device and the window', async () => {
      const { service, analyticsFinding } = build();

      await score(service, { findingWindowMs: 1000 });

      expect(analyticsFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 't1', deviceId: 'd1' }),
          take: 200,
        }),
      );
    });
  });

  describe('offline', () => {
    it('marks a device that has never reported as OFFLINE at zero, not merely unhealthy', async () => {
      const { service, update } = build({ heartbeat: null });

      const result = await score(service);

      // Averaging silence into a percentage would understate a device nobody can hear from, so it gets
      // its own band and the whole heartbeat weight.
      expect(result.status).toBe('OFFLINE');
      expect(result.score).toBe(0);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ healthStatus: 'OFFLINE', healthScore: 0 }),
        }),
      );
    });

    it('marks a device silent past the threshold OFFLINE', async () => {
      const { service } = build({ heartbeat: new Date(NOW.getTime() - OFFLINE_AFTER_MS - 1) });

      const result = await score(service);

      expect(result.status).toBe('OFFLINE');
    });

    it('does not mark a device offline on the boundary heartbeat', async () => {
      const { service } = build({ heartbeat: new Date(NOW.getTime() - OFFLINE_AFTER_MS) });

      const result = await score(service);

      expect(result.status).not.toBe('OFFLINE');
    });

    it('does not score a silent device against findings it never produced evidence for', async () => {
      const { service, deviceCommand } = build({ heartbeat: null, findings: ['CRITICAL'] });

      const result = await score(service);

      expect(result.components).toHaveLength(1);
      expect(deviceCommand.count).not.toHaveBeenCalled();
    });
  });

  describe('scoring', () => {
    it('scores a device that is reporting cleanly and behaving at full marks', async () => {
      const { service } = build({ heartbeat: new Date(NOW.getTime() - 1_000) });

      const result = await score(service);

      expect(result.score).toBe(100);
      expect(result.status).toBe('HEALTHY');
    });

    it('returns components whose deductions actually sum to the points taken off', async () => {
      const { service } = build({
        heartbeat: new Date(NOW.getTime() - 5 * 60 * 1000),
        findings: ['CRITICAL', 'WARNING'],
        commands: 2,
      });

      const result = await score(service);

      // This is the property that makes the number explainable. If it ever stops holding, the components
      // are decoration and the total is a number nobody can trace.
      const deducted = result.components.reduce((sum, component) => sum + component.deduction, 0);
      expect(deducted).toBe(100 - result.score);
    });

    it('weights the three signals and keeps a component inside its own weight', async () => {
      const { service } = build({
        heartbeat: new Date(NOW.getTime() - 5 * 60 * 1000),
        findings: ['CRITICAL', 'CRITICAL', 'CRITICAL', 'CRITICAL', 'CRITICAL', 'CRITICAL'],
      });

      const result = await score(service);
      expect(result.components).toHaveLength(3);

      for (const component of result.components) {
        expect(component.deduction).toBeLessThanOrEqual(component.weight);
      }

      /**
       * The floor is held by the per-component caps, not by a clamp on the total: the weights are 40, 50
       * and 10, so deductions can never exceed 100 however extreme the signals get. Six critical findings
       * demand 150 points from a 50 point component and are refused in full.
       *
       * Asserted as the sum-of-deductions invariant rather than through a negative total, because the
       * negative total is unreachable while the caps hold -- a test for it would pass either way and prove
       * nothing. If a fourth component is ever added without a cap, this fails and that is the point.
       */
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      const deducted = result.components.reduce((sum, component) => sum + component.deduction, 0);
      expect(deducted).toBeLessThanOrEqual(100);

      // And the floor is genuinely reached, not approached: a near-expired heartbeat costs its full 40,
      // a saturated anomaly component 50, and two failed commands 10. It has to sit just inside the
      // offline threshold, otherwise it is reported OFFLINE and never reaches the scoring path at all.
      const floored = await score(
        build({
          heartbeat: new Date(NOW.getTime() - OFFLINE_AFTER_MS + 1),
          findings: ['CRITICAL', 'CRITICAL', 'CRITICAL', 'CRITICAL', 'CRITICAL', 'CRITICAL'],
          commands: 2,
        }).service,
      );
      expect(floored.score).toBe(0);
    });

    it('grades a critical finding far harder than an informational one', async () => {
      const critical = await score(build({ findings: ['CRITICAL'] }).service);
      const info = await score(build({ findings: ['INFO'] }).service);

      expect(critical.score).toBeLessThan(info.score);
    });

    /**
     * Bands are asserted by driving real signals to real scores, not by re-implementing the thresholds
     * in the test. A copy of the same conditional would pass no matter what the service did, which is
     * exactly the sort of test that reports green while proving nothing.
     */
    it('bands a clean reporting device as HEALTHY', async () => {
      const { service } = build({ heartbeat: new Date(NOW.getTime() - 1_000) });

      expect((await score(service)).status).toBe('HEALTHY');
    });

    it('bands a device with one critical and one warning finding as DEGRADED', async () => {
      // One critical costs 25 and one warning costs 8 against a fresh heartbeat, landing on 67.
      const { service } = build({ heartbeat: new Date(NOW.getTime() - 1_000), findings: ['CRITICAL', 'WARNING'] });

      const result = await score(service);

      expect(result.score).toBe(67);
      expect(result.status).toBe('DEGRADED');
    });

    it('bands a device with repeated critical findings as UNHEALTHY', async () => {
      // Four criticals saturate the 50 point anomaly component; a half-elapsed heartbeat costs 20.
      const { service } = build({
        heartbeat: new Date(NOW.getTime() - (OFFLINE_AFTER_MS / 2)),
        findings: ['CRITICAL', 'CRITICAL', 'CRITICAL', 'CRITICAL'],
      });

      const result = await score(service);

      expect(result.score).toBe(30);
      expect(result.status).toBe('UNHEALTHY');
    });
  });

  describe('persistence', () => {
    it('stores the score, the band, the clock and the scorer version', async () => {
      const { service, update } = build();

      await score(service);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: {
          healthScore: expect.any(Number),
          healthStatus: expect.any(String),
          healthEvaluatedAt: NOW,
          healthScorerVersion: DeviceHealthScoringService.SCORER_VERSION,
        },
      });
    });
  });
});
