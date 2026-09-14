import { AccessibleSpaceService } from './accessible-space.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const membershipId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function device(id: string, name: string) {
  return {
    id,
    name,
    type: 'SWITCH',
    status: 'ACTIVE',
    tenantId,
    ownerId: userId,
    provisioningTokenHash: null,
    provisioningTokenExpires: null,
    lastHeartbeatAt: new Date('2026-09-13T00:00:00.000Z'),
    createdAt: new Date('2026-09-12T00:00:00.000Z'),
    updatedAt: new Date('2026-09-13T00:00:00.000Z'),
  };
}

describe('AccessibleSpaceService', () => {
  it('groups only authorized devices and preserves CONTROL separately from placement', async () => {
    const ownerDevice = device('dev-owner', 'Lampu');
    const viewDevice = device('dev-view', 'Sensor');
    const service = new AccessibleSpaceService(
      {
        spaceDevicePlacement: {
          findMany: jest.fn().mockResolvedValue([
            {
              deviceId: ownerDevice.id,
              room: { id: 'room-1', name: 'Ruang 1', path: '/Site/Gedung/L1/Ruang 1', kind: 'ROOM' },
            },
            {
              deviceId: viewDevice.id,
              room: { id: 'room-1', name: 'Ruang 1', path: '/Site/Gedung/L1/Ruang 1', kind: 'ROOM' },
            },
          ]),
        },
      } as any,
      {
        findAll: jest.fn().mockResolvedValue([ownerDevice, viewDevice]),
      } as any,
      {
        resolveMany: jest.fn().mockResolvedValue(
          new Map([
            [ownerDevice.id, { canView: true, canControl: true }],
            [viewDevice.id, { canView: true, canControl: false }],
          ]),
        ),
      } as any,
    );

    const result = await service.read({
      tenantId,
      membershipId,
      userId,
      role: 'MEMBER',
    });

    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0].devices).toEqual([
      expect.objectContaining({ id: ownerDevice.id, canControl: true }),
      expect.objectContaining({ id: viewDevice.id, canControl: false }),
    ]);
    expect(result.unassignedDevices).toEqual([]);
  });

  it('keeps authorized devices without room placement visible as unassigned', async () => {
    const unassigned = device('dev-unassigned', 'Portable Sensor');
    const service = new AccessibleSpaceService(
      { spaceDevicePlacement: { findMany: jest.fn().mockResolvedValue([]) } } as any,
      { findAll: jest.fn().mockResolvedValue([unassigned]) } as any,
      {
        resolveMany: jest.fn().mockResolvedValue(
          new Map([[unassigned.id, { canView: true, canControl: false }]]),
        ),
      } as any,
    );

    const result = await service.read({
      tenantId,
      membershipId,
      userId,
      role: 'MEMBER',
    });

    expect(result.rooms).toEqual([]);
    expect(result.unassignedDevices).toEqual([
      expect.objectContaining({ id: unassigned.id, roomId: null, canControl: false }),
    ]);
  });
});
