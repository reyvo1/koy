import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DeviceAccessGuard } from './device-access.guard';
import { DeviceAccessService } from './device-access.service';

function contextFor(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
  } as unknown as ExecutionContext;
}

describe('DeviceAccessGuard', () => {
  const access = {
    resolveOne: jest.fn(),
  } as unknown as DeviceAccessService;

  afterEach(() => jest.resetAllMocks());

  it('allows a decision that grants CONTROL', async () => {
    const reflector = {
      get: jest.fn().mockReturnValue('CONTROL'),
    } as unknown as Reflector;
    (access.resolveOne as jest.Mock).mockResolvedValue({
      deviceId: 'd1',
      canView: true,
      canControl: true,
      source: 'ADMIN',
    });
    const guard = new DeviceAccessGuard(reflector, access);

    await expect(
      guard.canActivate(
        contextFor({
          user: {
            userId: 'u1',
            tenantContext: {
              tenantId: 't1',
              membershipId: 'm1',
              role: 'ADMIN',
            },
          },
          params: { id: 'd1' },
        }),
      ),
    ).resolves.toBe(true);

    expect(access.resolveOne).toHaveBeenCalledWith(
      {
        tenantId: 't1',
        membershipId: 'm1',
        userId: 'u1',
        role: 'ADMIN',
      },
      'd1',
    );
  });

  it('allows VIEW but denies CONTROL for a view-only share', async () => {
    const reflector = {
      get: jest.fn().mockReturnValue('VIEW'),
    } as unknown as Reflector;
    (access.resolveOne as jest.Mock).mockResolvedValue({
      deviceId: 'd1',
      canView: true,
      canControl: false,
      source: 'VIEW_SHARE',
    });
    const guard = new DeviceAccessGuard(reflector, access);

    const request = {
      user: {
        userId: 'u1',
        tenantContext: {
          tenantId: 't1',
          membershipId: 'm1',
          role: 'MEMBER',
        },
      },
      params: { deviceId: 'd1' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    (reflector.get as jest.Mock).mockReturnValue('CONTROL');
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      'Device control access denied',
    );
  });

  it('returns safe not-found when the device is outside the tenant scope', async () => {
    const reflector = {
      get: jest.fn().mockReturnValue('VIEW'),
    } as unknown as Reflector;
    (access.resolveOne as jest.Mock).mockResolvedValue(null);
    const guard = new DeviceAccessGuard(reflector, access);

    await expect(
      guard.canActivate(
        contextFor({
          user: {
            userId: 'u1',
            tenantContext: {
              tenantId: 't1',
              membershipId: 'm1',
              role: 'MEMBER',
            },
          },
          params: { id: 'd1' },
        }),
      ),
    ).rejects.toThrow('Device not found');
  });
});
