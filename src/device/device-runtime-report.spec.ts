import { validate } from 'class-validator';
import { DeviceRuntimeReportDto } from './device-public.controller';
import { DeviceService } from './device.service';
describe('authenticated device runtime reports', () => {
  it.each([{}, { firmwareVersion: '1.2.3', protocol: 'MQTT_TLS' }])(
    'accepts bounded optional metadata %p',
    async (input) => {
      expect(
        await validate(Object.assign(new DeviceRuntimeReportDto(), input)),
      ).toEqual([]);
    },
  );
  it.each([
    { firmwareVersion: null },
    { protocol: 42 },
    { protocol: 'rtsp://secret@host' },
    { firmwareVersion: 'a'.repeat(65) },
    { protocol: '' },
  ])('rejects malformed reports %p', async (input) => {
    expect(
      (await validate(Object.assign(new DeviceRuntimeReportDto(), input)))
        .length,
    ).toBeGreaterThan(0);
  });
  it('does not erase identity metadata on a legacy heartbeat', async () => {
    const prisma: any = {
      device: { update: jest.fn().mockResolvedValue({ id: 'd1' }) },
    };
    const webhooks: any = { dispatch: jest.fn().mockResolvedValue(undefined) };
    await new DeviceService(prisma, webhooks).updateHeartbeat('t1', 'd1');
    const data = prisma.device.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('reportedFirmwareVersion');
    expect(data).not.toHaveProperty('reportedProtocol');
    expect(data).toMatchObject({ status: 'ACTIVE' });
  });
  it('persists reports only to the authenticated tenant/device identity', async () => {
    const prisma: any = {
      device: { update: jest.fn().mockResolvedValue({ id: 'd1' }) },
    };
    const webhooks: any = { dispatch: jest.fn().mockResolvedValue(undefined) };
    await new DeviceService(prisma, webhooks).updateHeartbeat('t1', 'd1', {
      firmwareVersion: '1.2.3',
      protocol: 'MQTT_TLS',
    });
    expect(prisma.device.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'd1', tenantId: 't1' },
        data: expect.objectContaining({
          reportedFirmwareVersion: '1.2.3',
          reportedProtocol: 'MQTT_TLS',
          runtimeReportedAt: expect.any(Date),
        }),
      }),
    );
  });
});
