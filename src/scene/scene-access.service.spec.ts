import { SceneAccessService } from './scene-access.service';
import { DeviceAccessService } from '../device/device-access.service';

const context = { tenantId: 'tenant-1', membershipId: 'membership-1', userId: 'user-1', role: 'MEMBER' };

describe('SceneAccessService', () => {
  it('allows VIEW but refuses CONTROL for a VIEW-only share', async () => {
    const devices = {
      resolveMany: jest.fn().mockResolvedValue(new Map([
        ['device-1', { deviceId: 'device-1', canView: true, canControl: false, source: 'VIEW_SHARE' }],
      ])),
    } as unknown as DeviceAccessService;
    const service = new SceneAccessService(devices);
    await expect(service.assertDeviceAccess(context, ['device-1'], 'VIEW')).resolves.toBeUndefined();
    await expect(service.assertDeviceAccess(context, ['device-1'], 'CONTROL')).rejects.toMatchObject({ status: 403 });
  });

  it('fails closed when a referenced device is not in the tenant/access result', async () => {
    const devices = { resolveMany: jest.fn().mockResolvedValue(new Map()) } as unknown as DeviceAccessService;
    const service = new SceneAccessService(devices);
    await expect(service.assertDeviceAccess(context, ['missing-device'], 'VIEW')).rejects.toMatchObject({ status: 404 });
  });

  it('filters scenes whose actions include a device the member cannot view', async () => {
    const devices = {
      resolveMany: jest.fn().mockResolvedValue(new Map([
        ['device-1', { deviceId: 'device-1', canView: true, canControl: true, source: 'OWNER' }],
        ['device-2', { deviceId: 'device-2', canView: false, canControl: false, source: 'NONE' }],
      ])),
    } as unknown as DeviceAccessService;
    const service = new SceneAccessService(devices);
    const visible = { id: 'scene-1', actions: [{ deviceId: 'device-1' }] };
    const hidden = { id: 'scene-2', actions: [{ deviceId: 'device-2' }] };
    await expect(service.filterReadableScenes(context, [visible, hidden] as never)).resolves.toEqual([visible]);
  });
});
