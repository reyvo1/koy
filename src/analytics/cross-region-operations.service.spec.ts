import { AnalyticsSeverity } from '@prisma/client';
import { CrossRegionOperationsService } from './cross-region-operations.service';

/**
 * Behavioural coverage for the regional rollup (ADR-012).
 *
 * The behaviour that matters is the refusal: a device that is not in an active region must be counted as
 * unplaced and must make the rollup report itself incomplete. A rollup that quietly dropped those devices
 * would present a fleet smaller than the one that exists.
 */
describe('CrossRegionOperationsService', () => {
  const NOW = new Date('2026-09-10T12:00:00.000Z');
  const HOUR = 60 * 60_000;

  const REGION_A = { id: 'ra', regionCode: 'ap-southeast-1', displayName: 'Makassar', timezone: 'Asia/Makassar' };
  const REGION_B = { id: 'rb', regionCode: 'ap-southeast-2', displayName: 'Makassar 2', timezone: 'Asia/Makassar' };

  const build = (
    overrides: {
      findings?: unknown[];
      devices?: unknown[];
      /** What the whole-fleet query returns, used to prove the flagged filter actually narrows it. */
      allDevices?: unknown[];
      regions?: unknown[];
    } = {},
  ) => {
    const analyticsFinding = {
      findMany: jest.fn().mockResolvedValue(overrides.findings ?? []),
    };
    const device = {
      // `summarise` and `unplacedDevices` issue different device queries, and one flat mock answer hides
      // the difference: a query that dropped its `id: { in: ... }` filter still returned the "flagged"
      // devices and the test passed. The mock now answers by inspecting the shape of `where`, so a dropped
      // filter produces a visibly wrong result instead of a silently right one.
      findMany: jest.fn().mockImplementation((args: { where?: { id?: { in?: string[] }; name?: boolean } } = {}) => {
        if (!args?.where?.id?.in) {
          // The unplacedDevices list query. Without a device filter it would return the whole fleet.
          return Promise.resolve(overrides.allDevices ?? []);
        }
        const wanted = new Set(args.where.id.in);
        const rows = overrides.devices ?? [];
        return Promise.resolve(rows.filter((row) => wanted.has((row as { id: string }).id)));
      }),
    };
    const region = {
      findMany: jest.fn().mockResolvedValue(overrides.regions ?? [REGION_A, REGION_B]),
    };
    const prisma = { analyticsFinding, device, region } as never;

    return { service: new CrossRegionOperationsService(prisma), analyticsFinding, device, region };
  };

  const finding = (deviceId: string, severity: AnalyticsSeverity) => ({
    id: `f-${deviceId}-${severity}`,
    deviceId,
    severity,
  });

  describe('required inputs', () => {
    it('refuses to summarise without a tenant', async () => {
      const { service, analyticsFinding } = build();

      await expect(service.summarise({ tenantId: '', now: NOW })).rejects.toBeInstanceOf(RangeError);
      expect(analyticsFinding.findMany).not.toHaveBeenCalled();
    });

    it('refuses to list unplaced devices without a tenant', async () => {
      const { service, analyticsFinding } = build();

      await expect(service.unplacedDevices({ tenantId: '', now: NOW })).rejects.toBeInstanceOf(RangeError);
      expect(analyticsFinding.findMany).not.toHaveBeenCalled();
    });
  });

  describe('per-region totals', () => {
    it('groups findings under the region of their device', async () => {
      const { service } = build({
        findings: [finding('d1', AnalyticsSeverity.CRITICAL), finding('d2', AnalyticsSeverity.WARNING)],
        devices: [
          { id: 'd1', regionId: 'ra' },
          { id: 'd2', regionId: 'ra' },
        ],
      });

      const rollup = await service.summarise({ tenantId: 't1', now: NOW });

      expect(rollup.regions).toHaveLength(1);
      expect(rollup.regions[0]).toMatchObject({
        regionCode: 'ap-southeast-1',
        findingCount: 2,
        affectedDeviceCount: 2,
      });
    });

    it('keeps severity as counts rather than a score', async () => {
      const { service } = build({
        findings: [
          finding('d1', AnalyticsSeverity.CRITICAL),
          finding('d2', AnalyticsSeverity.INFO),
          finding('d3', AnalyticsSeverity.WARNING),
        ],
        devices: [
          { id: 'd1', regionId: 'ra' },
          { id: 'd2', regionId: 'ra' },
          { id: 'd3', regionId: 'ra' },
        ],
      });

      const rollup = await service.summarise({ tenantId: 't1', now: NOW });

      expect(rollup.regions[0].bySeverity).toEqual({ INFO: 1, WARNING: 1, CRITICAL: 1 });
    });

    it('sorts the busiest region first', async () => {
      const { service } = build({
        findings: [finding('d1', AnalyticsSeverity.INFO), finding('d2', AnalyticsSeverity.INFO), finding('d3', AnalyticsSeverity.INFO)],
        devices: [
          { id: 'd1', regionId: 'ra' },
          { id: 'd2', regionId: 'rb' },
          { id: 'd3', regionId: 'rb' },
        ],
      });

      const rollup = await service.summarise({ tenantId: 't1', now: NOW });

      expect(rollup.regions[0].regionCode).toBe('ap-southeast-2');
    });

    it('lists regions with no findings separately, so clean is not confused with uncovered', async () => {
      const { service } = build({ findings: [], devices: [] });

      const rollup = await service.summarise({ tenantId: 't1', now: NOW });

      expect(rollup.regions).toHaveLength(0);
      expect(rollup.regionsWithoutFindings.map((region) => region.regionCode)).toEqual([
        'ap-southeast-1',
        'ap-southeast-2',
      ]);
    });

    it('reads only findings inside the requested window', async () => {
      const { service, analyticsFinding } = build();

      await service.summarise({ tenantId: 't1', sinceHours: 6, now: NOW });

      expect(analyticsFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1', createdAt: { gte: new Date(NOW.getTime() - 6 * HOUR) } },
        }),
      );
    });

    it('scopes the region lookup to the tenant', async () => {
      const { service, device } = build({
        findings: [finding('d1', AnalyticsSeverity.INFO)],
        devices: [{ id: 'd1', regionId: 'ra' }],
      });

      await service.summarise({ tenantId: 't1', now: NOW });

      // The second findMany is the device lookup; the first is the findings read handled by another mock.
      expect(device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't1', id: { in: ['d1'] } } }),
      );
    });

    it('bounds the findings it reads', async () => {
      const { service, analyticsFinding } = build();

      await service.summarise({ tenantId: 't1', limit: 7, now: NOW });

      expect(analyticsFinding.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 7 }));
    });
  });

  describe('unplaced devices are counted, never hidden', () => {
    it('counts a device with no region as unplaced', async () => {
      const { service } = build({
        findings: [finding('d1', AnalyticsSeverity.CRITICAL)],
        devices: [{ id: 'd1', regionId: null }],
      });

      const rollup = await service.summarise({ tenantId: 't1', now: NOW });

      expect(rollup.unplacedDeviceCount).toBe(1);
      expect(rollup.regions).toHaveLength(0);
    });

    it('and says the totals do not cover the fleet', async () => {
      const { service } = build({
        findings: [finding('d1', AnalyticsSeverity.CRITICAL)],
        devices: [{ id: 'd1', regionId: null }],
      });

      const rollup = await service.summarise({ tenantId: 't1', now: NOW });

      expect(rollup.complete).toBe(false);
      expect(rollup.note).toMatch(/do not cover the whole fleet/);
    });

    it('never puts an unplaced device into a region bucket', async () => {
      const { service } = build({
        findings: [finding('d1', AnalyticsSeverity.INFO), finding('d2', AnalyticsSeverity.INFO)],
        devices: [
          { id: 'd1', regionId: 'ra' },
          { id: 'd2', regionId: null },
        ],
      });

      const rollup = await service.summarise({ tenantId: 't1', now: NOW });

      expect(rollup.regions[0].findingCount).toBe(1);
      expect(rollup.regions[0].affectedDeviceCount).toBe(1);
      expect(rollup.unplacedDeviceCount).toBe(1);
    });

    // A device pointing at a deactivated region is not in any region this platform operates. Reporting it
    // under that region's code would claim coverage that does not exist.
    it('counts a device in an inactive region as unplaced too', async () => {
      const { service } = build({
        findings: [finding('d1', AnalyticsSeverity.INFO)],
        devices: [{ id: 'd1', regionId: 'retired-region' }],
        regions: [REGION_A],
      });

      const rollup = await service.summarise({ tenantId: 't1', now: NOW });

      expect(rollup.unplacedDeviceCount).toBe(1);
      expect(rollup.regions).toHaveLength(0);
    });

    it('reports complete when every device is in an active region', async () => {
      const { service } = build({
        findings: [finding('d1', AnalyticsSeverity.INFO)],
        devices: [{ id: 'd1', regionId: 'ra' }],
      });

      const rollup = await service.summarise({ tenantId: 't1', now: NOW });

      expect(rollup.complete).toBe(true);
      expect(rollup.note).toBeNull();
    });

    it('reports a finding whose device cannot be resolved as unplaced, never as extra coverage', async () => {
      const { service } = build({
        findings: [finding('ghost', AnalyticsSeverity.INFO)],
        devices: [],
      });

      const rollup = await service.summarise({ tenantId: 't1', now: NOW });

      expect(rollup.regions).toHaveLength(0);
      expect(rollup.unplacedDeviceCount).toBe(1);
      expect(rollup.complete).toBe(false);
    });

    it('carries the window it was generated over', async () => {
      const { service } = build();

      const rollup = await service.summarise({ tenantId: 't1', sinceHours: 2, now: NOW });

      expect(rollup.since).toEqual(new Date(NOW.getTime() - 2 * HOUR));
      expect(rollup.generatedAt).toBe(NOW);
    });
  });

  describe('the unplaced list is actionable', () => {
    it('only lists devices that actually have a finding in the window', async () => {
      const { service } = build({
        findings: [finding('d1', AnalyticsSeverity.CRITICAL)],
        devices: [{ id: 'd1', name: 'd1', regionId: null, status: 'ACTIVE', lastHeartbeatAt: NOW }],
      });

      const list = await service.unplacedDevices({ tenantId: 't1', now: NOW });

      expect(list).toHaveLength(1);
      expect(list[0].deviceId).toBe('d1');
    });

    it('distinguishes never-assigned from deactivated-region', async () => {
      const { service } = build({
        findings: [finding('d1', AnalyticsSeverity.INFO), finding('d2', AnalyticsSeverity.INFO)],
        devices: [
          { id: 'd1', name: 'a', regionId: null, status: 'ACTIVE', lastHeartbeatAt: NOW },
          { id: 'd2', name: 'b', regionId: 'gone', status: 'ACTIVE', lastHeartbeatAt: NOW },
        ],
        regions: [REGION_A],
      });

      const list = await service.unplacedDevices({ tenantId: 't1', now: NOW });
      const reasons = list.map((entry) => entry.reason).sort();

      expect(reasons).toEqual([
        'points at a region that is not active',
        'was never assigned to a region',
      ]);
    });

    // If the query dropped its `id: { in: flagged }` filter, every unplaced device in the tenant would be
    // returned and an operator would be handed a fleet-wide dump instead of the devices actually generating
    // findings. The whole-fleet mock rows must therefore NOT appear in the result.
    it('does not list devices that have no finding in the window', async () => {
      const { service } = build({
        findings: [finding('d1', AnalyticsSeverity.CRITICAL)],
        devices: [{ id: 'd1', name: 'a', regionId: null, status: 'ACTIVE', lastHeartbeatAt: NOW }],
        allDevices: [
          { id: 'd1', name: 'a', regionId: null, status: 'ACTIVE', lastHeartbeatAt: NOW },
          { id: 'quiet', name: 'q', regionId: null, status: 'ACTIVE', lastHeartbeatAt: NOW },
        ],
      });

      const list = await service.unplacedDevices({ tenantId: 't1', now: NOW });

      expect(list.map((entry) => entry.deviceId)).toEqual(['d1']);
    });

    // A device that has never spoken has a cached status, not an observed one.
    it('marks a device that has never reported as unobserved', async () => {
      const { service } = build({
        findings: [finding('d1', AnalyticsSeverity.INFO)],
        devices: [{ id: 'd1', name: 'a', regionId: null, status: 'ACTIVE', lastHeartbeatAt: null }],
      });

      const list = await service.unplacedDevices({ tenantId: 't1', now: NOW });

      expect(list[0].unobserved).toBe(true);
      expect(list[0].lastHeartbeatAt).toBeNull();
    });
  });
});