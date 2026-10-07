import { MobileApiError } from '../session/mobile-session-client';
import {
  loadLatestTelemetry,
  loadMobileAlerts,
  loadMobileDeviceDetail,
  loadMobileCommandStatus,
  loadMobileDevices,
  reconcileMobileCommand,
  MobileDeviceSummary,
  sendBooleanCapabilityCommand,
  sendTypedCapabilityCommand,
  sendPowerToggle,
} from './mobile-device-client';

describe('mobile device control client', () => {
  it.each([
    ['boolean', 'true', true],
    ['integer', '2', 2],
    ['number', '2.5', 2.5],
    ['string', 'mode', 'mode'],
    ['enum', 'eco', 'eco'],
    ['object', '{"threshold":0}', { threshold: 0 }],
  ])('preserves %s values across the JSON command boundary', async (dataType, raw, value) => {
    const requestJson = jest.fn().mockResolvedValue({ correlationId: 'typed-command', status: 'SENT' });
    await expect(sendTypedCapabilityCommand({ requestJson }, 'device', { key: 'target', dataType: String(dataType), constraints: { enumValues: ['eco'] } }, String(raw))).resolves.toEqual({ commandId: 'typed-command', status: 'SENT' });
    const [, init] = requestJson.mock.calls[0];
    expect(JSON.parse(init.body).payload).toEqual({ target: value });
  });
  it('rejects an invalid typed value before any transport request', async () => {
    const requestJson = jest.fn();
    await expect(sendTypedCapabilityCommand({ requestJson }, 'device', { key: 'target', dataType: 'number', constraints: { max: 10 } }, '100')).rejects.toMatchObject({ code: 'DEVICE_VALUE_INVALID' });
    expect(requestJson).not.toHaveBeenCalled();
  });
  it('loads devices from the gateway', async () => {
    let capturedPath = '';
    const devices: MobileDeviceSummary[] = await loadMobileDevices({
      requestJson: async <T>(path: string) => {
        capturedPath = path;
        return ({ devices: [
          {
            id: 'd1',
            name: 'Lampu Teras',
            status: 'ACTIVE',
            lastHeartbeatAt: '2026-09-11T03:00:00.000Z',
            canControl: false,
            roomName: 'Teras',
            roomPath: '/site/teras',
          },
        ] }) as T;
      },
    });
    expect(devices).toHaveLength(1);
    expect(devices[0].name).toBe('Lampu Teras');
    expect(devices[0].canControl).toBe(false);
    expect(capturedPath).toBe('/spaces/accessible');
  });

  it('sends a power toggle command with switch.power capability', async () => {
    let capturedBody: unknown;
    const result = await sendPowerToggle(
      {
        requestJson: async <T>(_path: string, init?: RequestInit) => {
          capturedBody = JSON.parse(String(init?.body));
          return { correlationId: 'c1', status: 'SENT' } as T;
        },
      },
      'dev-1',
      true,
    );
    expect(result.commandId).toBe('c1');
    expect(capturedBody).toMatchObject({
      payload: { 'switch.power': true },
    });
    expect((capturedBody as { idempotencyKey?: string }).idempotencyKey).toEqual(
      expect.any(String),
    );
  });

  it('sends an authorized dashboard boolean capability without hardcoding the key', async () => {
    let capturedBody: any;
    await sendBooleanCapabilityCommand(
      {
        requestJson: async <T>(_path: string, init?: RequestInit) => {
          capturedBody = JSON.parse(String(init?.body));
          return { correlationId: 'c2', status: 'SENT' } as T;
        },
      },
      'dev-2',
      'relay.output',
      false,
    );

    expect(capturedBody.payload).toEqual({ 'relay.output': false });
    expect(capturedBody.idempotencyKey).toEqual(expect.any(String));
  });

  it('reads a tenant-authorized command status by device and correlation id', async () => {
    let capturedPath = '';
    const result = await loadMobileCommandStatus(
      {
        requestJson: async <T>(path: string) => {
          capturedPath = path;
          return { correlationId: 'corr-1', status: 'ACKNOWLEDGED' } as T;
        },
      },
      'dev-1',
      'corr-1',
    );

    expect(capturedPath).toBe('/devices/dev-1/commands/corr-1');
    expect(result).toEqual({
      commandId: 'corr-1',
      status: 'ACKNOWLEDGED',
      terminal: true,
    });
  });

  it('reconciles a command until a terminal device result is observed', async () => {
    let calls = 0;
    const result = await reconcileMobileCommand(
      {
        requestJson: async <T>() => {
          calls += 1;
          return {
            correlationId: 'corr-2',
            status: calls < 2 ? 'SENT' : 'FAILED',
          } as T;
        },
      },
      'dev-2',
      'corr-2',
      3,
      0,
    );

    expect(calls).toBe(2);
    expect(result.status).toBe('FAILED');
    expect(result.terminal).toBe(true);
  });

  it('filters malformed telemetry readings', async () => {
    const points = await loadLatestTelemetry(
      {
        requestJson: async <T>() =>
          ({
            id: 'telemetry-1',
            createdAt: '2026-08-23T00:00:00.000Z',
            payload: {
              temperature: 27.5,
              bad: { nested: true },
            },
          }) as T,
      },
      'dev-1',
    );
    expect(points).toHaveLength(1);
    expect(points[0].capabilityKey).toBe('temperature');
  });


  it('loads Device Detail from VIEW-authorized backend contracts without inferring firmware/protocol', async () => {
    const paths: string[] = [];
    const summary: MobileDeviceSummary = { id: 'd1', name: 'Lampu', status: 'ACTIVE', lastHeartbeatAt: null, canControl: true, roomName: 'R1', roomPath: '/R1' };
    const detail = await loadMobileDeviceDetail({
      requestJson: async <T>(path: string) => {
        paths.push(path);
        if (path.endsWith('/capabilities')) return [{ id: 'c1', key: 'relay', semanticType: 'relay', dataType: 'boolean', isReadable: true, isWritable: true, isReportable: true }] as T;
        if (path.endsWith('/telemetry/latest')) return { createdAt: '2026-09-13T00:00:00Z', payload: { relay: true } } as T;
        if (path.includes('/commands?')) return [] as T;
        if (path.endsWith('/technical-history')) return { firmware: { currentVersion: null, availability: 'UNAVAILABLE_BY_CONTRACT', reason: 'n/a' }, protocol: { name: null, availability: 'UNAVAILABLE_BY_CONTRACT', reason: 'n/a' }, updateHistory: [], analyticsFindings: [], alertDeliveryHistory: { available: false, reason: 'n/a' } } as T;
        return { createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-13T00:00:00Z' } as T;
      },
    }, summary);
    expect(detail.capabilities[0].key).toBe('relay');
    expect(detail.technicalHistory.firmware.currentVersion).toBeNull();
    expect(paths).toContain('/devices/d1/technical-history');
  });

  it('loads accessible WARNING/CRITICAL analytics alerts as a distinct non-delivery surface', async () => {
    const payload = await loadMobileAlerts({
      requestJson: async <T>(_path: string) => ({ source: 'ANALYTICS_FINDINGS', notificationDeliveryHistory: false, deviceScopeTruncated: false, maxDeviceScope: 1000, limit: 50, items: [] }) as T,
    });
    expect(payload.source).toBe('ANALYTICS_FINDINGS');
    expect(payload.notificationDeliveryHistory).toBe(false);
  });

  it('surfaces MobileApiError from the gateway untouched', async () => {
    const err = new MobileApiError(404, 'NOT_FOUND', 'device tidak ada', null);
    await expect(
      loadMobileDevices({
        requestJson: async () => {
          throw err;
        },
      }),
    ).rejects.toBe(err);
  });
});
