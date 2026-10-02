import { DeviceTwinVerdict } from '@prisma/client';
import { DeviceTwinService, readReportedStatus } from './device-twin.service';

/**
 * Behavioural coverage for the device twin (ADR-011).
 *
 * The verdicts that matter here are the ones that refuse to reassure: UNKNOWN when a device never reported,
 * STALE when the observation aged out, and DIVERGENT when the device disagrees. A twin that could only ever
 * say ALIGNED would be a green light with no evidence behind it.
 */
describe('DeviceTwinService', () => {
  const NOW = new Date('2026-09-01T12:00:00.000Z');
  const MINUTE = 60_000;

  const build = (
    overrides: {
      device?: unknown;
      telemetry?: unknown;
      latestSnapshot?: unknown;
    } = {},
  ) => {
    const deviceTwinSnapshot = {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'snap', ...data }),
      ),
      findFirst: jest.fn().mockResolvedValue(overrides.latestSnapshot ?? null),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const device = {
      findFirst: jest.fn().mockResolvedValue(
        overrides.device === undefined ? { id: 'd1', status: 'ACTIVE' } : overrides.device,
      ),
    };
    const telemetry = {
      findFirst: jest.fn().mockResolvedValue(
        overrides.telemetry === undefined
          ? { createdAt: new Date(NOW.getTime() - 1 * MINUTE), payload: { status: 'ACTIVE' } }
          : overrides.telemetry,
      ),
    };
    const prisma = { deviceTwinSnapshot, device, telemetry } as never;

    return { service: new DeviceTwinService(prisma), deviceTwinSnapshot, device, telemetry };
  };

  describe('required inputs', () => {
    it('refuses to reconcile without a tenant', async () => {
      const { service, deviceTwinSnapshot } = build();

      await expect(service.reconcile({ tenantId: '', deviceId: 'd1' })).rejects.toBeInstanceOf(RangeError);
      expect(deviceTwinSnapshot.create).not.toHaveBeenCalled();
    });

    it('refuses to reconcile without a device', async () => {
      const { service, deviceTwinSnapshot } = build();

      await expect(service.reconcile({ tenantId: 't1', deviceId: '' })).rejects.toBeInstanceOf(RangeError);
      expect(deviceTwinSnapshot.create).not.toHaveBeenCalled();
    });

    it('refuses a device that is not in this tenant', async () => {
      const { service, deviceTwinSnapshot } = build({ device: null });

      await expect(service.reconcile({ tenantId: 't1', deviceId: 'd1' })).rejects.toBeInstanceOf(RangeError);
      expect(deviceTwinSnapshot.create).not.toHaveBeenCalled();
    });

    it('reads the device inside the tenant, so a twin cannot be built for another tenant', async () => {
      const { service, device } = build();

      await service.reconcile({ tenantId: 't1', deviceId: 'd1' });

      expect(device.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'd1', tenantId: 't1' } }),
      );
    });
  });

  describe('the four verdicts', () => {
    it('says ALIGNED when a fresh observation matches what is expected', async () => {
      const { service } = build();

      const snapshot = await service.reconcile({ tenantId: 't1', deviceId: 'd1', now: NOW });

      expect(snapshot.verdict).toBe(DeviceTwinVerdict.ALIGNED);
      expect(snapshot.divergenceReason).toBeNull();
    });

    // The core of the slice: a device that has never reported has produced no evidence, and "no evidence"
    // must never be reported as agreement.
    it('says UNKNOWN when the device never reported', async () => {
      const { service } = build({ telemetry: null });

      const snapshot = await service.reconcile({ tenantId: 't1', deviceId: 'd1', now: NOW });

      expect(snapshot.verdict).toBe(DeviceTwinVerdict.UNKNOWN);
      expect(snapshot.observedAt).toBeNull();
      expect(snapshot.observedStatus).toBeNull();
      expect(snapshot.divergenceReason).toMatch(/did not report/i);
    });

    // "It agrees, as of eight days ago" is not "it agrees". Stale wins over ALIGNED on purpose.
    it('says STALE when the observation aged out, even though it matched', async () => {
      const { service } = build({
        telemetry: { createdAt: new Date(NOW.getTime() - 8 * 24 * 60 * MINUTE), payload: { status: 'ACTIVE' } },
      });

      const snapshot = await service.reconcile({ tenantId: 't1', deviceId: 'd1', now: NOW });

      expect(snapshot.verdict).toBe(DeviceTwinVerdict.STALE);
      expect(snapshot.observedStatus).toBe('ACTIVE');
      expect(snapshot.divergenceReason).toMatch(/past the 15 minute horizon/);
    });

    it('says DIVERGENT when the device reports something else', async () => {
      const { service } = build({
        telemetry: { createdAt: new Date(NOW.getTime() - MINUTE), payload: { status: 'INACTIVE' } },
      });

      const snapshot = await service.reconcile({ tenantId: 't1', deviceId: 'd1', now: NOW });

      expect(snapshot.verdict).toBe(DeviceTwinVerdict.DIVERGENT);
      expect(snapshot.divergenceReason).toMatch(/reports INACTIVE but ACTIVE is expected/);
    });

    it('respects a caller-supplied horizon', async () => {
      const { service } = build({
        telemetry: { createdAt: new Date(NOW.getTime() - 30 * MINUTE), payload: { status: 'ACTIVE' } },
      });

      const snapshot = await service.reconcile({ tenantId: 't1', deviceId: 'd1', now: NOW, horizonMinutes: 60 });

      expect(snapshot.verdict).toBe(DeviceTwinVerdict.ALIGNED);
    });

    // Alive but silent about its state is not the same as aligned.
    it('says UNKNOWN when the device reported data but no status', async () => {
      const { service } = build({
        telemetry: { createdAt: new Date(NOW.getTime() - MINUTE), payload: { temperature: 21.5 } },
      });

      const snapshot = await service.reconcile({ tenantId: 't1', deviceId: 'd1', now: NOW });

      expect(snapshot.verdict).toBe(DeviceTwinVerdict.UNKNOWN);
      expect(snapshot.observedStatus).toBeNull();
    });

    it('keeps the raw payload as evidence alongside the verdict', async () => {
      const { service } = build({
        telemetry: { createdAt: new Date(NOW.getTime() - MINUTE), payload: { status: 'INACTIVE', code: 7 } },
      });

      const snapshot = await service.reconcile({ tenantId: 't1', deviceId: 'd1', now: NOW });

      expect(snapshot.observedPayload).toEqual({ status: 'INACTIVE', code: 7 });
    });
  });

  describe('the observed status is what was reported, not what was wanted', () => {
    it('never copies the desired status into the observation', async () => {
      const { service, deviceTwinSnapshot } = build({
        telemetry: { createdAt: new Date(NOW.getTime() - MINUTE), payload: { temperature: 20 } },
      });

      await service.reconcile({ tenantId: 't1', deviceId: 'd1', desiredStatus: 'ACTIVE', now: NOW });

      const { data } = deviceTwinSnapshot.create.mock.calls[0][0];
      expect(data.desiredStatus).toBe('ACTIVE');
      expect(data.observedStatus).toBeNull();
    });

    it('falls back to the device status when no desired status is declared', async () => {
      const { service, deviceTwinSnapshot } = build();

      await service.reconcile({ tenantId: 't1', deviceId: 'd1', now: NOW });

      expect(deviceTwinSnapshot.create.mock.calls[0][0].data.desiredStatus).toBe('ACTIVE');
    });
  });

  describe('readReportedStatus', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['an array', [1, 2]],
      ['a string', 'ACTIVE'],
      ['a number', 7],
      ['an empty object', {}],
    ])('returns null for %s', (_label, payload) => {
      expect(readReportedStatus(payload as never)).toBeNull();
    });

    it('returns the reported status', () => {
      expect(readReportedStatus({ status: 'ACTIVE' })).toBe('ACTIVE');
    });

    it('trims a padded status', () => {
      expect(readReportedStatus({ status: '  ACTIVE  ' })).toBe('ACTIVE');
    });

    it('returns null for a blank status', () => {
      expect(readReportedStatus({ status: '   ' })).toBeNull();
    });
  });

  describe('versioning', () => {
    it('starts at version 1', async () => {
      const { service, deviceTwinSnapshot } = build();

      await service.reconcile({ tenantId: 't1', deviceId: 'd1', now: NOW });

      expect(deviceTwinSnapshot.create.mock.calls[0][0].data.twinVersion).toBe(1);
    });

    it('increments from the latest snapshot', async () => {
      const { service, deviceTwinSnapshot } = build({ latestSnapshot: { twinVersion: 7 } });

      await service.reconcile({ tenantId: 't1', deviceId: 'd1', now: NOW });

      expect(deviceTwinSnapshot.create.mock.calls[0][0].data.twinVersion).toBe(8);
    });

    it('reads the latest version inside the tenant', async () => {
      const { service, deviceTwinSnapshot } = build();

      await service.reconcile({ tenantId: 't1', deviceId: 'd1', now: NOW });

      expect(deviceTwinSnapshot.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deviceId: 'd1', tenantId: 't1' } }),
      );
    });
  });

  describe('history', () => {
    it('refuses to read history without a tenant', async () => {
      const { service, deviceTwinSnapshot } = build();

      await expect(service.history({ tenantId: '', deviceId: 'd1' })).rejects.toBeInstanceOf(RangeError);
      expect(deviceTwinSnapshot.findMany).not.toHaveBeenCalled();
    });

    it('bounds the history and returns it newest first', async () => {
      const { service, deviceTwinSnapshot } = build();

      await service.history({ tenantId: 't1', deviceId: 'd1', limit: 5 });

      expect(deviceTwinSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId: 'd1', tenantId: 't1' },
          orderBy: { twinVersion: 'desc' },
          take: 5,
        }),
      );
    });
  });
});