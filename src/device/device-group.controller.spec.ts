import { DeviceGroupController } from './device-group.controller';
import { PrismaService } from '../prisma/prisma.service';

const TENANT_ID = 'tenant-a';
const DEVICE_A = '11111111-1111-1111-1111-111111111111';
const DEVICE_B = '22222222-2222-2222-2222-222222222222';
const GROUP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function tenantRequest() {
  return {
    user: {
      tenantContext: {
        tenantId: TENANT_ID,
        membershipId: 'membership-a',
        role: 'ADMIN',
      },
    },
  };
}

describe('DeviceGroupController tenant isolation', () => {
  let controller: DeviceGroupController;
  let prisma: {
    device: { findMany: jest.Mock; findFirst: jest.Mock };
    deviceGroup: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
    };
    deviceGroupMember: { create: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      device: { findMany: jest.fn(), findFirst: jest.fn() },
      deviceGroup: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
      },
      deviceGroupMember: { create: jest.fn(), deleteMany: jest.fn() },
    };
    controller = new DeviceGroupController(prisma as unknown as PrismaService);
  });

  it('rejects create when any requested device is outside the active tenant', async () => {
    prisma.device.findMany.mockResolvedValue([{ id: DEVICE_A }]);

    await expect(
      controller.create(tenantRequest(), {
        name: 'Lantai 1',
        deviceIds: [DEVICE_A, DEVICE_B],
      }),
    ).rejects.toThrow('Ada deviceId tidak dikenal pada tenant ini');

    expect(prisma.device.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, id: { in: [DEVICE_A, DEVICE_B] } },
      select: { id: true },
    });
    expect(prisma.deviceGroup.create).not.toHaveBeenCalled();
  });

  it('filters legacy poisoned memberships when listing tenant groups', async () => {
    prisma.deviceGroup.findMany.mockResolvedValue([]);

    await expect(controller.list(tenantRequest())).resolves.toEqual({
      total: 0,
      items: [],
    });

    expect(prisma.deviceGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
        include: {
          members: {
            where: { device: { tenantId: TENANT_ID } },
            include: {
              device: { select: { id: true, name: true, status: true } },
            },
          },
        },
      }),
    );
  });

  it('deduplicates device ids before creating same-tenant memberships', async () => {
    prisma.device.findMany.mockResolvedValue([{ id: DEVICE_A }]);
    prisma.deviceGroup.create.mockResolvedValue({
      id: GROUP_ID,
      name: 'Lantai 1',
      createdAt: new Date('2026-09-11T00:00:00.000Z'),
    });

    await controller.create(tenantRequest(), {
      name: 'Lantai 1',
      deviceIds: [DEVICE_A, DEVICE_A],
    });

    expect(prisma.deviceGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          members: { create: [{ deviceId: DEVICE_A }] },
        }),
      }),
    );
  });

  it('rejects adding a device that is not owned by the active tenant', async () => {
    prisma.deviceGroup.findFirst.mockResolvedValue({ id: GROUP_ID });
    prisma.device.findFirst.mockResolvedValue(null);

    await expect(
      controller.addMember(tenantRequest(), GROUP_ID, { deviceId: DEVICE_B }),
    ).rejects.toThrow('deviceId tidak dikenal pada tenant ini');

    expect(prisma.device.findFirst).toHaveBeenCalledWith({
      where: { id: DEVICE_B, tenantId: TENANT_ID },
      select: { id: true },
    });
    expect(prisma.deviceGroupMember.create).not.toHaveBeenCalled();
  });

  it('adds a member only after both group and device are tenant scoped', async () => {
    prisma.deviceGroup.findFirst.mockResolvedValue({ id: GROUP_ID });
    prisma.device.findFirst.mockResolvedValue({ id: DEVICE_A });
    prisma.deviceGroupMember.create.mockResolvedValue({});

    await expect(
      controller.addMember(tenantRequest(), GROUP_ID, { deviceId: DEVICE_A }),
    ).resolves.toEqual({ groupId: GROUP_ID, deviceId: DEVICE_A, added: true });

    expect(prisma.deviceGroupMember.create).toHaveBeenCalledWith({
      data: { groupId: GROUP_ID, deviceId: DEVICE_A },
    });
  });
});
