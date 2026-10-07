import { DeviceController } from './device.controller';
import { DeviceLocationService } from './device-location.service';
describe('location HTTP input boundary', () => {
  const prisma: any = {
    device: { findFirst: jest.fn().mockResolvedValue({ id: 'd1' }) },
    deviceLocation: {
      create: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ ...data, id: 'l1' })),
    },
  };
  const target: any = { locationService: new DeviceLocationService(prisma) };
  const request = { user: { tenantContext: { tenantId: 't1' } } };
  const invoke = (body: unknown) =>
    DeviceController.prototype.recordLocation.call(
      target,
      request,
      'd1',
      body as any,
    );
  beforeEach(() => jest.clearAllMocks());
  it.each([
    null,
    undefined,
    [],
    { recordedAt: 0 },
    { latitude: 0, longitude: 0, recordedAt: '' },
    { latitude: null, longitude: 0 },
    { latitude: '', longitude: 0 },
    { latitude: 0, longitude: 0, recordedAt: 'invalid' },
  ])('rejects malformed input without manufacturing zero %p', async (input) => {
    await expect(invoke(input)).rejects.toThrow();
    expect(prisma.deviceLocation.create).not.toHaveBeenCalled();
  });
  it('keeps genuine zero coordinates and trusted tenant provenance', async () => {
    await expect(
      invoke({ tenantId: 'foreign', latitude: 0, longitude: 0 }),
    ).resolves.toMatchObject({ latitude: 0, longitude: 0 });
    expect(prisma.deviceLocation.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 't1',
      deviceId: 'd1',
    });
  });
});
