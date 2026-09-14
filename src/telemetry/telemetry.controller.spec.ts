import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

describe('TelemetryController', () => {
  let controller: TelemetryController;
  let telemetryService: { getLatest: jest.Mock; getHistory: jest.Mock };

  beforeEach(() => {
    telemetryService = {
      getLatest: jest.fn(),
      getHistory: jest.fn(),
    };
    controller = new TelemetryController(
      telemetryService as unknown as TelemetryService,
    );
  });

  const request = {
    user: {
      tenantContext: {
        tenantId: 'tenant-1',
      },
    },
  };

  it('queries latest telemetry using trusted tenant context', async () => {
    const latest = {
      id: 'telemetry-1',
      tenantId: 'tenant-1',
      deviceId: 'device-1',
    };
    telemetryService.getLatest.mockResolvedValue(latest);

    await expect(controller.getLatest(request, 'device-1')).resolves.toEqual(
      latest,
    );
    expect(telemetryService.getLatest).toHaveBeenCalledWith(
      'tenant-1',
      'device-1',
    );
  });

  it('preserves an empty latest state as null', async () => {
    telemetryService.getLatest.mockResolvedValue(null);

    await expect(controller.getLatest(request, 'device-1')).resolves.toBeNull();
  });

  it('queries bounded history using trusted tenant context and cursor', async () => {
    const page = {
      items: [{ id: 'telemetry-2' }],
      nextCursor: 'opaque-cursor',
    };
    telemetryService.getHistory.mockResolvedValue(page);

    await expect(
      controller.getHistory(request, 'device-1', 25, 'cursor-1'),
    ).resolves.toEqual(page);
    expect(telemetryService.getHistory).toHaveBeenCalledWith(
      'tenant-1',
      'device-1',
      25,
      'cursor-1',
    );
  });
});
