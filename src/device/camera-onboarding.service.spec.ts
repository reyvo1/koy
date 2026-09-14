import { Test } from '@nestjs/testing';
import { CameraOnboardingService } from './camera-onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceStatus, DeviceType } from '@prisma/client';
import * as argon2 from 'argon2';

describe('CameraOnboardingService', () => {
  let service: CameraOnboardingService;
  let prisma: {
    device: Record<string, jest.Mock>;
    capability: Record<string, jest.Mock>;
    deviceCredential: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      device: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      capability: { create: jest.fn() },
      deviceCredential: { upsert: jest.fn() },
      $transaction: jest.fn(),
    } as any;
    const moduleRef = await Test.createTestingModule({
      providers: [
        CameraOnboardingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(CameraOnboardingService);
  });

  it('register creates a CAMERA device in PROVISIONING with vendor metadata cap and one-time token', async () => {
    const created = {
      id: 'cam-1',
      name: 'Kamera Depan',
      type: DeviceType.CAMERA,
      status: DeviceStatus.PROVISIONING,
    };
    prisma.device.create.mockResolvedValue(created);
    prisma.device.update.mockResolvedValue(created);

    const result = await service.register('tenant-1', {
      name: 'Kamera Depan',
      vendor: 'Imou',
      model: 'Ranger 2',
    });

    expect(prisma.device.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Kamera Depan',
        type: DeviceType.CAMERA,
        status: DeviceStatus.PROVISIONING,
        tenantId: 'tenant-1',
      }),
    });
    // vendor + model recorded as read-only caps, never credentials
    expect(prisma.capability.create).toHaveBeenCalledTimes(2);
    expect(result.pairingUri).toMatch(/^iotcam:\/\/pair\/cam-1\/[0-9a-f]+$/);
    expect(result.expiresInSeconds).toBe(3600);
  });

  it('pair consumes valid token atomically and moves camera to PAIRED', async () => {
    const token = 'valid-token';
    const hash = await argon2.hash(token);
    prisma.device.findUnique.mockResolvedValue({
      id: 'cam-1',
      type: DeviceType.CAMERA,
      provisioningTokenHash: hash,
      provisioningTokenExpires: new Date(Date.now() + 600000),
      credential: null,
    });
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        device: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        deviceCredential: { upsert: jest.fn().mockResolvedValue({}) },
      }),
    );

    const result = await service.pair('cam-1', token, 'secret123');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(DeviceStatus.PAIRED);
  });

  it('pair rejects a token that lost the concurrent atomic claim', async () => {
    const token = 'valid-token';
    const hash = await argon2.hash(token);
    prisma.device.findUnique.mockResolvedValue({
      id: 'cam-1',
      type: DeviceType.CAMERA,
      status: DeviceStatus.PROVISIONING,
      provisioningTokenHash: hash,
      provisioningTokenExpires: new Date(Date.now() + 600000),
      credential: null,
    });
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        device: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        deviceCredential: { upsert: jest.fn() },
      }),
    );

    await expect(service.pair('cam-1', token, 'secret123')).rejects.toThrow(
      /Invalid or expired provisioning token/,
    );
  });

  it('pair rejects expired token fail-closed', async () => {
    const hash = await argon2.hash('some-token');
    prisma.device.findUnique.mockResolvedValue({
      id: 'cam-1',
      type: DeviceType.CAMERA,
      provisioningTokenHash: hash,
      provisioningTokenExpires: new Date(Date.now() - 1000),
      credential: null,
    });

    await expect(service.pair('cam-1', 'any-token', 'pw')).rejects.toThrow(
      /Invalid or expired provisioning token/,
    );
  });

  it('pair rejects non-camera devices', async () => {
    const hash = await argon2.hash('tok');
    prisma.device.findUnique.mockResolvedValue({
      id: 'dev-9',
      type: DeviceType.SENSOR,
      provisioningTokenHash: hash,
      provisioningTokenExpires: new Date(Date.now() + 600000),
      credential: null,
    });

    await expect(service.pair('dev-9', 'tok', 'pw')).rejects.toThrow(
      /Invalid or expired provisioning token/,
    );
  });

  it('listCameras is tenant-scoped and camera-typed only', async () => {
    prisma.device.findMany.mockResolvedValue([]);
    await service.listCameras('tenant-1');
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', type: DeviceType.CAMERA },
      }),
    );
  });
});
