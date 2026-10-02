import { EdgeGatewayStatus } from '@prisma/client';
import { EdgeGatewayService } from './edge-gateway.service';

/**
 * Behavioural coverage for edge gateway identity and attribution (ADR-010).
 *
 * The refusals are the behaviour worth pinning: a gateway that may not speak for a device is the whole
 * reason the allowlist exists, and an attribution that silently attributes to the wrong gateway would be
 * worse than no attribution at all.
 */
describe('EdgeGatewayService', () => {
  const NOW = new Date('2026-08-05T09:00:00.000Z');
  const ALLOWED = { id: 'd1' };

  const build = (
    overrides: {
      gateway?: unknown;
      gateways?: unknown[];
      device?: unknown;
      allowlist?: unknown[];
    } = {},
  ) => {
    const edgeGateway = {
      findFirst: jest.fn().mockResolvedValue(
        overrides.gateway === undefined
          ? {
              id: 'g1',
              gatewayStatus: EdgeGatewayStatus.ONLINE,
              devices: overrides.allowlist ?? [ALLOWED],
            }
          : overrides.gateway,
      ),
      findMany: jest.fn().mockResolvedValue(overrides.gateways ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const edgeGatewayDevice = {
      upsert: jest.fn().mockResolvedValue({}),
    };
    const device = {
      findFirst: jest.fn().mockResolvedValue(overrides.device === undefined ? { id: 'd1' } : overrides.device),
    };
    const prisma = { edgeGateway, edgeGatewayDevice, device } as never;

    return { service: new EdgeGatewayService(prisma), edgeGateway, edgeGatewayDevice, device };
  };

  describe('listing gateways', () => {
    it('refuses to list without a tenant, because that would return every tenants gateways', async () => {
      const { service, edgeGateway } = build();

      await expect(service.list('')).rejects.toBeInstanceOf(RangeError);
      expect(edgeGateway.findMany).not.toHaveBeenCalled();
    });

    it('scopes the list to the tenant and bounds it', async () => {
      const { service, edgeGateway } = build();

      await service.list('t1', 30);

      expect(edgeGateway.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't1' }, take: 30 }),
      );
    });
  });

  describe('the allowlist', () => {
    it.each([
      ['no tenant', { tenantId: undefined }],
      ['no gateway', { gatewayId: undefined }],
      ['no device', { deviceId: undefined }],
    ])('refuses %s', async (_label, extra) => {
      const { service, edgeGatewayDevice } = build();

      await expect(
        service.allowDevice({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1', ...extra }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(edgeGatewayDevice.upsert).not.toHaveBeenCalled();
    });

    it('refuses a gateway that is not in this tenant', async () => {
      const { service, edgeGatewayDevice } = build({ gateway: null });

      await expect(
        service.allowDevice({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(edgeGatewayDevice.upsert).not.toHaveBeenCalled();
    });

    it('refuses a device that is not in this tenant', async () => {
      const { service, edgeGatewayDevice } = build({ device: null });

      await expect(
        service.allowDevice({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' }),
      ).rejects.toThrow(/does not exist in this tenant/i);
      expect(edgeGatewayDevice.upsert).not.toHaveBeenCalled();
    });

    it('registers against the unique pair so a repeat is not a second row', async () => {
      const { service, edgeGatewayDevice } = build();

      await service.allowDevice({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' });

      expect(edgeGatewayDevice.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { gatewayId_deviceId: { gatewayId: 'g1', deviceId: 'd1' } },
        }),
      );
    });

    // A mock returns whatever it is told regardless of `where`, so returning null above proves the service
    // handles a missing device -- it does NOT prove the query was tenant-scoped. Dropping `tenantId` from the
    // filter keeps every mocked test green while letting a tenant register any device id it can guess, so the
    // filter itself has to be pinned.
    it('scopes the device lookup to the tenant', async () => {
      const { service, device } = build();

      await service.allowDevice({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' });

      expect(device.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'd1', tenantId: 't1' } }),
      );
    });

    it('scopes the gateway lookup to the tenant', async () => {
      const { service, edgeGateway } = build();

      await service.allowDevice({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' });

      expect(edgeGateway.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'g1', tenantId: 't1' } }),
      );
    });

    it('reports the clock the caller supplied', async () => {
      const { service } = build();

      const result = await service.allowDevice({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1', now: NOW });

      expect(result.registeredAt).toBe(NOW);
    });
  });

  describe('delivery attribution', () => {
    it('refuses to resolve without a tenant', async () => {
      const { service, edgeGateway } = build();

      await expect(service.resolveDelivery({ tenantId: '', deviceId: 'd1' })).rejects.toBeInstanceOf(RangeError);
      expect(edgeGateway.findFirst).not.toHaveBeenCalled();
    });

    it('refuses a device that is not in this tenant', async () => {
      const { service } = build({ device: null });

      await expect(
        service.resolveDelivery({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' }),
      ).rejects.toBeInstanceOf(RangeError);
    });

    // null attribution is a real answer here, not a missing one: the device reported for itself, which is
    // what every row written before ADR-010 says.
    it('attributes to nobody when the device reported for itself', async () => {
      const { service } = build();

      const result = await service.resolveDelivery({ tenantId: 't1', deviceId: 'd1' });

      expect(result.deliveredByGatewayId).toBeNull();
      expect(result.selfReported).toBe(true);
    });

    it('attributes to the gateway when it is registered for the device', async () => {
      const { service } = build();

      const result = await service.resolveDelivery({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' });

      expect(result.deliveredByGatewayId).toBe('g1');
      expect(result.selfReported).toBe(false);
    });

    it('refuses a gateway that is not registered for that device', async () => {
      const { service } = build({ allowlist: [] });

      await expect(
        service.resolveDelivery({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' }),
      ).rejects.toThrow(/not registered for device/i);
    });

    it('refuses a gateway from another tenant', async () => {
      const { service } = build({ gateway: null });

      await expect(
        service.resolveDelivery({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' }),
      ).rejects.toThrow(/does not exist in this tenant/i);
    });

    it('refuses a disabled gateway', async () => {
      const { service } = build({ gateway: { id: 'g1', gatewayStatus: EdgeGatewayStatus.DISABLED, devices: [ALLOWED] } });

      await expect(
        service.resolveDelivery({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' }),
      ).rejects.toThrow(/disabled/i);
    });

    it('scopes the allowlist lookup to the tenant', async () => {
      const { service, edgeGateway } = build();

      await service.resolveDelivery({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' });

      expect(edgeGateway.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'g1', tenantId: 't1' } }),
      );
    });

    // The allowlist must be filtered to THIS device. A mock returns whatever it is told, so a query that
    // forgot the device filter would still pass every test above while letting any gateway that serves one
    // device claim every device it serves nothing for.
    it('filters the allowlist to the device being delivered', async () => {
      const { service, edgeGateway } = build();

      await service.resolveDelivery({ tenantId: 't1', gatewayId: 'g1', deviceId: 'd1' });

      expect(edgeGateway.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            devices: expect.objectContaining({ where: { deviceId: 'd1' } }),
          }),
        }),
      );
    });
  });

  describe('heartbeat', () => {
    it.each([
      ['no tenant', { tenantId: undefined }],
      ['no gateway', { gatewayId: undefined }],
    ])('refuses %s', async (_label, extra) => {
      const { service, edgeGateway } = build();

      await expect(service.recordHeartbeat({ tenantId: 't1', gatewayId: 'g1', ...extra })).rejects.toBeInstanceOf(
        RangeError,
      );
      expect(edgeGateway.updateMany).not.toHaveBeenCalled();
    });

    it('brings a gateway online at the clock the caller supplied', async () => {
      const { service, edgeGateway } = build();

      const result = await service.recordHeartbeat({ tenantId: 't1', gatewayId: 'g1', now: NOW });

      expect(edgeGateway.updateMany).toHaveBeenCalledWith({
        where: { id: 'g1', tenantId: 't1', gatewayStatus: { not: EdgeGatewayStatus.DISABLED } },
        data: { gatewayStatus: EdgeGatewayStatus.ONLINE, lastSeenAt: NOW },
      });
      expect(result.gatewayStatus).toBe(EdgeGatewayStatus.ONLINE);
    });

    // A disabled gateway must not be able to come back online by sending a heartbeat.
    it('will not bring a disabled gateway back online', async () => {
      const { service, edgeGateway } = build();
      edgeGateway.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.recordHeartbeat({ tenantId: 't1', gatewayId: 'g1', now: NOW }),
      ).rejects.toThrow(/does not exist in this tenant, or is disabled/i);
    });

    it('refuses a gateway that is not in this tenant', async () => {
      const { service, edgeGateway } = build();
      edgeGateway.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.recordHeartbeat({ tenantId: 't1', gatewayId: 'g1' })).rejects.toBeInstanceOf(RangeError);
    });
  });
});