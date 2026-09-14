import { AutomationRuntimeReadRepository } from './automation-runtime-read.repository';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TELEMETRY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const CAPABILITY_ID = '22222222-2222-4222-8222-222222222222';
const ACTION_DEVICE_ID = '33333333-3333-4333-8333-333333333333';

function envelope() {
  return {
    tenantId: TENANT_ID,
    telemetryId: TELEMETRY_ID,
    deviceId: DEVICE_ID,
    eventId: 'event-1',
    occurredAt: new Date('2026-08-05T00:00:00.000Z'),
    origin: 'EXTERNAL_ACCEPTED' as const,
    ancestry: [],
    reports: [
      {
        capabilityId: CAPABILITY_ID,
        capabilityKey: 'temperature',
        value: 31,
      },
    ],
  };
}

describe('AutomationRuntimeReadRepository', () => {
  const telemetryFindFirst = jest.fn();
  const capabilityFindMany = jest.fn();
  const capabilityFindFirst = jest.fn();
  const automationFindMany = jest.fn();
  const queryRaw = jest.fn();
  const repository = new AutomationRuntimeReadRepository({
    telemetry: { findFirst: telemetryFindFirst },
    capability: {
      findMany: capabilityFindMany,
      findFirst: capabilityFindFirst,
    },
    automation: { findMany: automationFindMany },
    $queryRaw: queryRaw,
  } as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('verifies exact persisted telemetry and report capability identity', async () => {
    telemetryFindFirst.mockResolvedValue({
      eventId: 'event-1',
      payload: { temperature: 31 },
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
    });
    capabilityFindMany.mockResolvedValue([
      { id: CAPABILITY_ID, key: 'temperature', isReportable: true },
    ]);

    await expect(
      repository.assertAcceptedTelemetry(envelope()),
    ).resolves.toBeUndefined();
    expect(telemetryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: TELEMETRY_ID,
          tenantId: TENANT_ID,
          deviceId: DEVICE_ID,
        },
      }),
    );
  });

  it('rejects omitted or conflicting persisted report evidence', async () => {
    telemetryFindFirst.mockResolvedValue({
      eventId: 'event-1',
      payload: { temperature: 32 },
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
    });
    capabilityFindMany.mockResolvedValue([
      { id: CAPABILITY_ID, key: 'temperature', isReportable: true },
    ]);

    await expect(
      repository.assertAcceptedTelemetry(envelope()),
    ).rejects.toMatchObject({
      code: 'AUTOMATION_RUNTIME_READ_TELEMETRY_MISMATCH',
    });
  });

  it('loads enabled exact-trigger candidates and reconstructs validated definitions', async () => {
    automationFindMany.mockResolvedValue([
      {
        id: '44444444-4444-4444-8444-444444444444',
        tenantId: TENANT_ID,
        name: 'Runtime candidate',
        schemaVersion: '1.0.0',
        enabled: true,
        revision: 3,
        triggerDeviceId: DEVICE_ID,
        triggerCapabilityId: CAPABILITY_ID,
        triggerCapability: { id: CAPABILITY_ID, key: 'temperature' },
        condition: { kind: 'ALWAYS' },
        actions: [
          {
            actionId: 'fan-on',
            position: 0,
            deviceId: ACTION_DEVICE_ID,
            value: true,
            capability: { id: 'cap-action', key: 'fan' },
          },
        ],
      },
    ]);

    const result = await repository.findEnabledCandidatesForReport({
      tenantId: TENANT_ID,
      deviceId: DEVICE_ID,
      capabilityId: CAPABILITY_ID,
    });

    expect(automationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          enabled: true,
          triggerDeviceId: DEVICE_ID,
          triggerCapabilityId: CAPABILITY_ID,
        }),
        orderBy: [{ id: 'asc' }],
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        automationId: '44444444-4444-4444-8444-444444444444',
        tenantId: TENANT_ID,
        enabled: true,
        revision: 3,
        triggerCapabilityId: CAPABILITY_ID,
        definition: expect.objectContaining({
          condition: { kind: 'ALWAYS' },
          actions: [
            expect.objectContaining({
              actionId: 'fan-on',
              capabilityKey: 'fan',
              value: true,
            }),
          ],
        }),
      }),
    ]);
  });

  it('deduplicates latest targets and loads only primitive tenant-bound values', async () => {
    const targets = repository.collectLatestValueTargets({
      kind: 'ALL',
      conditions: [
        {
          kind: 'COMPARE',
          left: {
            source: 'LATEST_CAPABILITY_VALUE',
            deviceId: ACTION_DEVICE_ID,
            capabilityKey: 'humidity',
          },
          operator: 'GREATER_THAN',
          right: 40,
        },
        {
          kind: 'COMPARE',
          left: {
            source: 'LATEST_CAPABILITY_VALUE',
            deviceId: ACTION_DEVICE_ID,
            capabilityKey: 'humidity',
          },
          operator: 'LESS_THAN',
          right: 80,
        },
      ],
    });
    expect(targets).toEqual([
      { deviceId: ACTION_DEVICE_ID, capabilityKey: 'humidity' },
    ]);

    capabilityFindFirst.mockResolvedValue({
      id: 'latest-capability',
      isReadable: true,
      isReportable: true,
    });
    queryRaw.mockResolvedValue([{ value: 55 }]);

    await expect(
      repository.loadLatestValues(TENANT_ID, targets),
    ).resolves.toEqual([
      {
        tenantId: TENANT_ID,
        deviceId: ACTION_DEVICE_ID,
        capabilityKey: 'humidity',
        value: 55,
      },
    ]);
    expect(capabilityFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deviceId: ACTION_DEVICE_ID,
          key: 'humidity',
          device: { tenantId: TENANT_ID },
        },
      }),
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
