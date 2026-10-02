import { RegionAssignmentService } from './region-assignment.service';

/**
 * Behavioural coverage for region assignment.
 *
 * Every test here corresponds to a boundary ADR-009 records. The point of the slice is that assignment
 * refuses rather than defaults, so the refusals are the behaviour worth pinning.
 */
describe('RegionAssignmentService', () => {
  const NOW = new Date('2026-07-20T12:00:00.000Z');
  const ACTIVE = { id: 'r1', regionCode: 'ap-southeast-1', timezone: 'Asia/Makassar', isActive: true };
  const RETIRED = { id: 'r0', regionCode: 'eu-west-1', timezone: 'Europe/London', isActive: false };

  const build = (
    overrides: {
      region?: unknown;
      device?: unknown;
      regions?: unknown[];
    } = {},
  ) => {
    const region = {
      findFirst: jest.fn().mockResolvedValue(overrides.region === undefined ? ACTIVE : overrides.region),
      findMany: jest.fn().mockResolvedValue(overrides.regions ?? [ACTIVE]),
    };
    const device = {
      findFirst: jest.fn().mockResolvedValue(
        // Unplaced by default: the state every existing device is in after this migration, and the one the
        // `current` contract has to report honestly.
        overrides.device === undefined ? { id: 'd1', regionId: null, region: null } : overrides.device,
      ),
      update: jest.fn().mockResolvedValue({}),
    };
    const prisma = { region, device } as never;

    return { service: new RegionAssignmentService(prisma), region, device };
  };

  const assign = (service: RegionAssignmentService, extra = {}) =>
    service.assign({
      tenantId: 't1',
      deviceId: 'd1',
      regionId: 'r1',
      reason: 'device commissioned here',
      now: NOW,
      ...extra,
    });

  describe('required inputs', () => {
    it.each([
      ['no tenant', { tenantId: undefined }],
      ['no device', { deviceId: undefined }],
      ['no region', { regionId: undefined }],
      ['a blank reason', { reason: '   ' }],
      ['no reason at all', { reason: undefined }],
    ])('refuses %s', async (_label, extra) => {
      const { service, region, device } = build();

      await expect(assign(service, extra)).rejects.toBeInstanceOf(RangeError);
      expect(region.findFirst).not.toHaveBeenCalled();
      expect(device.update).not.toHaveBeenCalled();
    });

    it('refuses to look up a device without a tenant', async () => {
      const { service, device } = build();

      await expect(service.current('', 'd1')).rejects.toBeInstanceOf(RangeError);
      expect(device.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('the region must be real and active', () => {
    it('refuses a region that does not exist', async () => {
      const { service, device } = build({ region: null });

      await expect(assign(service)).rejects.toBeInstanceOf(RangeError);
      expect(device.update).not.toHaveBeenCalled();
    });

    it('refuses an inactive region', async () => {
      const { service, device } = build({ region: RETIRED });

      await expect(assign(service, { regionId: 'r0' })).rejects.toThrow(/not active/i);
      expect(device.update).not.toHaveBeenCalled();
    });
  });

  describe('tenant scoping', () => {
    it('looks the device up inside the tenant', async () => {
      const { service, device } = build();

      await assign(service);

      expect(device.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'd1', tenantId: 't1' } }),
      );
    });

    it('refuses a device that is not in this tenant', async () => {
      const { service, device } = build({ device: null });

      await expect(assign(service)).rejects.toBeInstanceOf(RangeError);
      expect(device.update).not.toHaveBeenCalled();
    });
  });

  describe('assignment', () => {
    it('places the device and reports the move', async () => {
      const { service, device } = build();

      const result = await assign(service);

      expect(device.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { regionId: 'r1' },
      });
      expect(result.regionCode).toBe('ap-southeast-1');
      expect(result.previousRegionId).toBeNull();
      expect(result.assignedAt).toBe(NOW);
    });

    it('reports the region it came from when a device is moved', async () => {
      const { service } = build({ device: { id: 'd1', regionId: 'r-old' } });

      const result = await assign(service);

      expect(result.previousRegionId).toBe('r-old');
    });

    it('trims the reason it stores', async () => {
      const { service } = build();

      const result = await assign(service, { reason: '  moved after survey  ' });

      expect(result.reason).toBe('moved after survey');
    });

    it('bounds the region list it returns', async () => {
      const { service, region } = build();

      await service.listAssignable(25);

      expect(region.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
    });

    it('offers only active regions, because a retired one must not be an option', async () => {
      const { service, region } = build();

      await service.listAssignable();

      expect(region.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('reading where a device sits', () => {
    it('reports a placed device with its region', async () => {
      const { service, device } = build();
      device.findFirst.mockResolvedValue({ region: ACTIVE });

      const result = await service.current('t1', 'd1');

      expect(result.unplaced).toBe(false);
      expect(result.region?.regionCode).toBe('ap-southeast-1');
    });

    // The state the migration deliberately leaves every existing device in: not silently placed in the one
    // seeded region, which would be a claim about the whole installed base made by a migration.
    it('reports an unplaced device as unplaced rather than defaulting it somewhere', async () => {
      const { service } = build();

      const result = await service.current('t1', 'd1');

      expect(result.unplaced).toBe(true);
      expect(result.region).toBeNull();
    });

    it('refuses a device that is not in this tenant', async () => {
      const { service } = build({ device: null });

      await expect(service.current('t1', 'd1')).rejects.toBeInstanceOf(RangeError);
    });
  });
});