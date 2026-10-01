import { DeviceLocationService } from './device-location.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Behavioural tests for device location.
 *
 * These exist because source contracts could not hold this service down. Two mutations passed a
 * regex-based contract while the behaviour was already broken:
 *
 *   - removing the latitude range guard left `-90`/`90` matching the *error message* on the line
 *     below, because the message says "latitude harus antara -90 dan 90";
 *   - removing `tenantId` from the device lookup satisfied a clause that was not anchored to the
 *     lookup it was meant to inspect.
 *
 * A regex can only be told what to look for; a mock Prisma can be told what the service asked for.
 * `expect(where).toEqual({ id: 'dev-1', tenantId: 'tenant-a' })` has no reading of a comment, an
 * error message, or a second occurrence elsewhere in the file.
 */

describe('DeviceLocationService', () => {
  let prisma: {
    device: { findFirst: jest.Mock };
    deviceLocation: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let service: DeviceLocationService;

  const FIX = {
    id: 'loc-1',
    tenantId: 'tenant-a',
    deviceId: 'dev-1',
    latitude: -6.2,
    longitude: 106.8,
    label: 'Gedung A',
    recordedAt: new Date('2026-10-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      device: { findFirst: jest.fn().mockResolvedValue({ id: 'dev-1' }) },
      deviceLocation: {
        create: jest.fn().mockResolvedValue(FIX),
        findFirst: jest.fn().mockResolvedValue(FIX),
        findMany: jest.fn().mockResolvedValue([FIX]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    service = new DeviceLocationService(prisma as unknown as PrismaService);
  });

  describe('recordFix', () => {
    const valid = {
      tenantId: 'tenant-a',
      deviceId: 'dev-1',
      latitude: -6.2,
      longitude: 106.8,
    };

    it('scopes the device lookup by tenant as well as by id', async () => {
      // The whole point: a caller naming another tenant's device id must not be able to plant a
      // coordinate in that tenant's permanent history.
      await service.recordFix(valid);
      expect(prisma.device.findFirst).toHaveBeenCalledWith({
        where: { id: 'dev-1', tenantId: 'tenant-a' },
        select: { id: true },
      });
    });

    it('refuses a device that is not in the tenant, and writes nothing', async () => {
      prisma.device.findFirst.mockResolvedValueOnce(null);
      await expect(service.recordFix(valid)).rejects.toThrow(/tidak ditemukan/i);
      expect(prisma.deviceLocation.create).not.toHaveBeenCalled();
    });

    it('writes the tenant it resolved, not the one it was handed', async () => {
      // Both are 'tenant-a' here by construction; the assertion pins that the write names tenantId at
      // all, since an earlier version took it from the caller without proving anything.
      await service.recordFix(valid);
      expect(prisma.deviceLocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-a', deviceId: 'dev-1' }),
        }),
      );
    });

    it.each([
      ['latitude above 90', { latitude: 91 }],
      ['latitude below -90', { latitude: -91 }],
      ['longitude above 180', { longitude: 181 }],
      ['longitude below -180', { longitude: -181 }],
      ['NaN latitude', { latitude: Number.NaN }],
      ['NaN longitude', { longitude: Number.NaN }],
      ['infinite latitude', { latitude: Number.POSITIVE_INFINITY }],
      ['a string latitude', { latitude: '6.2' as unknown as number }],
    ])('rejects %s', async (_label, override) => {
      // NaN and Infinity are here because every comparison with NaN is false, so a range check alone
      // accepts it and then stores a coordinate no map can render.
      await expect(service.recordFix({ ...valid, ...override })).rejects.toThrow();
      expect(prisma.deviceLocation.create).not.toHaveBeenCalled();
    });

    it('accepts the edges of the world', async () => {
      for (const edge of [
        { latitude: 90, longitude: 180 },
        { latitude: -90, longitude: -180 },
        { latitude: 0, longitude: 0 },
      ]) {
        await expect(service.recordFix({ ...valid, ...edge })).resolves.toBeTruthy();
      }
    });

    it('keeps 0,0 as a real position rather than a "no data" sentinel', async () => {
      // 0,0 is in the Gulf of Guinea. Treating it as missing would silently drop a device that is
      // genuinely there, so the write must go through.
      await service.recordFix({ ...valid, latitude: 0, longitude: 0 });
      expect(prisma.deviceLocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ latitude: 0, longitude: 0 }),
        }),
      );
    });

    it("records the device's timestamp rather than stamping the write", async () => {
      const recordedAt = new Date('2026-01-01T00:00:00.000Z');
      await service.recordFix({ ...valid, recordedAt });
      expect(prisma.deviceLocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recordedAt }),
        }),
      );
    });
  });

  describe('historyFor', () => {
    it('scopes every read by tenant and device', async () => {
      await service.historyFor({ tenantId: 'tenant-a', deviceId: 'dev-1' });
      expect(prisma.deviceLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-a', deviceId: 'dev-1' } }),
      );
      expect(prisma.deviceLocation.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-a', deviceId: 'dev-1' },
      });
    });

    it('reports "never reported" as null, not as an empty coordinate', async () => {
      prisma.deviceLocation.findFirst.mockResolvedValueOnce(null);
      const history = await service.historyFor({ tenantId: 'tenant-a', deviceId: 'dev-1' });
      expect(history.latest).toBeNull();
    });

    it('separates latest from history', async () => {
      prisma.deviceLocation.findFirst.mockResolvedValueOnce(FIX);
      prisma.deviceLocation.findMany.mockResolvedValueOnce([FIX]);
      const history = await service.historyFor({ tenantId: 'tenant-a', deviceId: 'dev-1' });
      expect(history.latest).toEqual(expect.objectContaining({ id: 'loc-1' }));
      expect(history.items).toHaveLength(1);
      expect(history.total).toBe(1);
    });

    it('bounds the history', async () => {
      await service.historyFor({ tenantId: 'tenant-a', deviceId: 'dev-1', limit: 10_000 });
      expect(prisma.deviceLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('refuses a non-integer limit by falling back rather than asking Prisma for NaN rows', async () => {
      await service.historyFor({
        tenantId: 'tenant-a',
        deviceId: 'dev-1',
        limit: 1.5 as unknown as number,
      });
      expect(prisma.deviceLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('orders newest first, with a stable tiebreaker', async () => {
      await service.historyFor({ tenantId: 'tenant-a', deviceId: 'dev-1' });
      expect(prisma.deviceLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
        }),
      );
    });
  });

  describe('latestForTenant', () => {
    it('scopes by tenant and asks for one row per device', async () => {
      await service.latestForTenant('tenant-a');
      expect(prisma.deviceLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-a' }, distinct: ['deviceId'] }),
      );
    });
  });
});