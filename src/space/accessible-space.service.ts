import { Injectable } from '@nestjs/common';
import type { Device } from '@prisma/client';
import { DeviceAccessService } from '../device/device-access.service';
import { DeviceService } from '../device/device.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_USER_WORKSPACE_DEVICES = 500;
const ACCESS_DECISION_BATCH = 500;

export interface AccessibleSpaceContext {
  tenantId: string;
  membershipId: string;
  userId: string;
  role: string;
}

export interface WorkspaceDevice {
  id: string;
  name: string;
  type: string;
  status: string;
  lastHeartbeatAt: string | null;
  canControl: boolean;
  roomId: string | null;
  roomName: string | null;
  roomPath: string | null;
}

/**
 * End-user Room/Space read model.
 *
 * Device visibility is never inferred from space membership. We first obtain
 * the device set authorized by the existing owner/share policy, then resolve
 * CONTROL separately through DeviceAccessService. Space placement only groups
 * already-authorized devices; it cannot grant access by itself.
 */
@Injectable()
export class AccessibleSpaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DeviceService,
    private readonly access: DeviceAccessService,
  ) {}

  async read(context: AccessibleSpaceContext) {
    const authorized = await this.devices.findAll(context.tenantId, {
      userId: context.userId,
      membershipId: context.membershipId,
      role: context.role,
    });

    const ordered = [...authorized].sort(compareDevices);
    const totalAccessibleDevices = ordered.length;
    const visible = ordered.slice(0, MAX_USER_WORKSPACE_DEVICES);
    const ids = visible.map((device) => device.id);

    const decisions = new Map<
      string,
      { canView: boolean; canControl: boolean }
    >();
    for (let index = 0; index < ids.length; index += ACCESS_DECISION_BATCH) {
      const batch = await this.access.resolveMany(
        context,
        ids.slice(index, index + ACCESS_DECISION_BATCH),
      );
      for (const [deviceId, decision] of batch) {
        decisions.set(deviceId, decision);
      }
    }

    const placements =
      ids.length === 0
        ? []
        : await this.prisma.spaceDevicePlacement.findMany({
            where: {
              tenantId: context.tenantId,
              deviceId: { in: ids },
            },
            select: {
              deviceId: true,
              room: {
                select: {
                  id: true,
                  name: true,
                  path: true,
                  kind: true,
                },
              },
            },
          });

    const placementByDevice = new Map(
      placements
        .filter((placement) => placement.room.kind === 'ROOM')
        .map((placement) => [placement.deviceId, placement.room] as const),
    );

    const items: WorkspaceDevice[] = visible.flatMap((device) => {
      const decision = decisions.get(device.id);
      if (!decision?.canView) return [];
      const room = placementByDevice.get(device.id) ?? null;
      return [sanitizeDevice(device, decision.canControl, room)];
    });

    const roomMap = new Map<
      string,
      { id: string; name: string; path: string; devices: WorkspaceDevice[] }
    >();
    const unassignedDevices: WorkspaceDevice[] = [];

    for (const device of items) {
      if (!device.roomId || !device.roomName || !device.roomPath) {
        unassignedDevices.push(device);
        continue;
      }
      const room = roomMap.get(device.roomId) ?? {
        id: device.roomId,
        name: device.roomName,
        path: device.roomPath,
        devices: [],
      };
      room.devices.push(device);
      roomMap.set(room.id, room);
    }

    const rooms = [...roomMap.values()]
      .map((room) => ({
        ...room,
        devices: room.devices.sort(compareWorkspaceDevices),
      }))
      .sort((left, right) =>
        left.path.localeCompare(right.path, 'id', { sensitivity: 'base' }),
      );

    return {
      totalAccessibleDevices,
      visibleDeviceCount: items.length,
      truncated: totalAccessibleDevices > MAX_USER_WORKSPACE_DEVICES,
      maxVisibleDevices: MAX_USER_WORKSPACE_DEVICES,
      rooms,
      unassignedDevices: unassignedDevices.sort(compareWorkspaceDevices),
      devices: items.sort(compareWorkspaceDevices),
    };
  }
}

function sanitizeDevice(
  device: Device,
  canControl: boolean,
  room: { id: string; name: string; path: string } | null,
): WorkspaceDevice {
  return {
    id: device.id,
    name: device.name,
    type: device.type,
    status: device.status,
    lastHeartbeatAt: device.lastHeartbeatAt?.toISOString() ?? null,
    canControl,
    roomId: room?.id ?? null,
    roomName: room?.name ?? null,
    roomPath: room?.path ?? null,
  };
}

function compareDevices(left: Device, right: Device): number {
  const byName = left.name.localeCompare(right.name, 'id', {
    sensitivity: 'base',
  });
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}

function compareWorkspaceDevices(
  left: WorkspaceDevice,
  right: WorkspaceDevice,
): number {
  const byName = left.name.localeCompare(right.name, 'id', {
    sensitivity: 'base',
  });
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}
