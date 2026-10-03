import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import { DomainForbiddenException, DomainNotFoundException } from '../common/errors/domain-exceptions';
import { DeviceAccessService, type DeviceAccessContext } from '../device/device-access.service';
import type { SceneRecord } from './scene.repository';

export type SceneAccessLevel = 'VIEW' | 'CONTROL';

@Injectable()
export class SceneAccessService {
  constructor(private readonly devices: DeviceAccessService) {}

  async assertDeviceAccess(context: DeviceAccessContext, deviceIds: readonly string[], level: SceneAccessLevel): Promise<void> {
    const ids = [...new Set(deviceIds)];
    const decisions = await this.devices.resolveMany(context, ids);
    for (const deviceId of ids) {
      const decision = decisions.get(deviceId);
      if (!decision) throw new DomainNotFoundException(ERROR_CODES.DeviceNotFound, 'Scene target device not found');
      const allowed = level === 'CONTROL' ? decision.canControl : decision.canView;
      if (!allowed) throw new DomainForbiddenException(ERROR_CODES.RbacPermissionDenied, `Scene requires device ${level.toLowerCase()} access`);
    }
  }

  async assertSceneAccess(context: DeviceAccessContext, scene: SceneRecord, level: SceneAccessLevel): Promise<void> {
    await this.assertDeviceAccess(context, scene.actions.map((action) => action.deviceId), level);
  }

  async filterReadableScenes(context: DeviceAccessContext, scenes: readonly SceneRecord[]): Promise<SceneRecord[]> {
    const ids = [...new Set(scenes.flatMap((scene) => scene.actions.map((action) => action.deviceId)))];
    const decisions = await this.devices.resolveMany(context, ids);
    return scenes.filter((scene) => scene.actions.every((action) => decisions.get(action.deviceId)?.canView === true));
  }
}
