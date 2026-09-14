import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DeviceStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { DeviceAuthGuard } from './device-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('argon2');

describe('DeviceAuthGuard', () => {
  let guard: DeviceAuthGuard;
  let prisma: PrismaService;

  const request = {
    headers: {
      'x-device-id': 'device-1',
      'x-device-secret': 'device-secret',
    },
  };

  const createContext = (): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    prisma = {
      device: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;

    guard = new DeviceAuthGuard(prisma);

    jest.clearAllMocks();

    request.headers = {
      'x-device-id': 'device-1',
      'x-device-secret': 'device-secret',
    };
  });

  it('rejects missing device credentials', async () => {
    request.headers = {
      'x-device-id': '',
      'x-device-secret': '',
    };

    await expect(guard.canActivate(createContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects unknown device', async () => {
    (prisma.device.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(guard.canActivate(createContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects device without credential', async () => {
    (prisma.device.findUnique as jest.Mock).mockResolvedValue({
      id: 'device-1',
      status: DeviceStatus.PAIRED,
      credential: null,
    });

    await expect(guard.canActivate(createContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects revoked device', async () => {
    (prisma.device.findUnique as jest.Mock).mockResolvedValue({
      id: 'device-1',
      status: DeviceStatus.REVOKED,
      credential: {
        passwordHash: 'hash',
      },
    });

    await expect(guard.canActivate(createContext())).rejects.toThrow(
      UnauthorizedException,
    );

    expect(argon2.verify).not.toHaveBeenCalled();
  });

  it('rejects invalid device secret', async () => {
    (prisma.device.findUnique as jest.Mock).mockResolvedValue({
      id: 'device-1',
      status: DeviceStatus.ACTIVE,
      credential: {
        passwordHash: 'hash',
      },
    });

    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(guard.canActivate(createContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('attaches authenticated device to request', async () => {
    const device = {
      id: 'device-1',
      status: DeviceStatus.ACTIVE,
      credential: {
        passwordHash: 'hash',
      },
    };

    (prisma.device.findUnique as jest.Mock).mockResolvedValue(device);
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    await expect(guard.canActivate(createContext())).resolves.toBe(true);

    expect(request).toHaveProperty('device', device);
  });
});
