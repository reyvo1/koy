import {
  DashboardBindingIntent,
  DashboardBindingMode,
  DashboardWidgetKind,
  DeviceStatus,
} from '@prisma/client';
import { TelemetryAggregationService } from '../telemetry/telemetry-aggregation.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { DashboardResolvedWidget } from './dashboard-widget-resolution.types';
import { DashboardWidgetQueryService } from './dashboard-widget-query.service';

const NOW = new Date('2026-07-19T01:00:00.000Z');

function widget(
  mode: DashboardBindingMode,
  query: Record<string, unknown> = {},
): DashboardResolvedWidget {
  return {
    id: 'widget-1',
    kind: DashboardWidgetKind.CARD,
    title: 'Temperature',
    state: 'READY',
    reasonCode: null,
    message: null,
    presentation: { staleAfterSeconds: 300 },
    supportedStates: [
      'LOADING',
      'EMPTY',
      'STALE',
      'UNAUTHORIZED',
      'OFFLINE',
      'ERROR',
    ],
    bindings: [
      {
        id: 'binding-1',
        alias: 'value',
        intent:
          mode === DashboardBindingMode.HISTORY ||
          mode === DashboardBindingMode.AGGREGATE
            ? DashboardBindingIntent.REPORT
            : mode === DashboardBindingMode.COMMAND
              ? DashboardBindingIntent.WRITE
              : DashboardBindingIntent.READ,
        mode,
        device: { id: 'device-1', status: DeviceStatus.ACTIVE },
        capability:
          mode === DashboardBindingMode.DEVICE_STATUS
            ? null
            : {
                id: 'capability-1',
                key: 'temperature',
                semanticType: 'temperature',
                dataType: 'number',
                unit: 'celsius',
                constraints: {},
                access: {
                  readable: true,
                  writable: mode === DashboardBindingMode.COMMAND,
                  reportable: true,
                },
              },
        query,
      },
    ],
  };
}

describe('DashboardWidgetQueryService', () => {
  let telemetry: {
    getLatest: jest.Mock;
    getHistory: jest.Mock;
  };
  let aggregation: { getAggregate: jest.Mock };
  let service: DashboardWidgetQueryService;

  beforeEach(() => {
    telemetry = {
      getLatest: jest.fn(),
      getHistory: jest.fn(),
    };
    aggregation = {
      getAggregate: jest.fn(),
    };
    service = new DashboardWidgetQueryService(
      telemetry as unknown as TelemetryService,
      aggregation as unknown as TelemetryAggregationService,
      () => NOW,
    );
  });

  it('returns only the bound latest capability value', async () => {
    telemetry.getLatest.mockResolvedValue({
      payload: { temperature: 24.5, humidity: 70 },
      createdAt: new Date('2026-07-19T00:59:00.000Z'),
    });

    await expect(
      service.queryWidget('tenant-1', widget(DashboardBindingMode.LATEST)),
    ).resolves.toMatchObject({
      state: 'READY',
      generatedAt: NOW.toISOString(),
      bindings: [
        {
          state: 'READY',
          observedAt: '2026-07-19T00:59:00.000Z',
          data: { value: 24.5 },
        },
      ],
    });
    expect(telemetry.getLatest).toHaveBeenCalledWith('tenant-1', 'device-1');
  });

  it('marks latest telemetry stale using bounded presentation metadata', async () => {
    telemetry.getLatest.mockResolvedValue({
      payload: { temperature: 24.5 },
      createdAt: new Date('2026-07-19T00:50:00.000Z'),
    });

    await expect(
      service.queryWidget('tenant-1', widget(DashboardBindingMode.LATEST)),
    ).resolves.toMatchObject({
      state: 'STALE',
      bindings: [{ state: 'STALE', reasonCode: 'TELEMETRY_DATA_STALE' }],
    });
  });

  it('filters bounded history to the requested capability', async () => {
    telemetry.getHistory.mockResolvedValue({
      items: [
        {
          payload: { temperature: 25, humidity: 70 },
          createdAt: new Date('2026-07-19T00:59:00.000Z'),
        },
        {
          payload: { humidity: 71 },
          createdAt: new Date('2026-07-19T00:58:00.000Z'),
        },
      ],
      nextCursor: 'cursor-1',
    });

    await expect(
      service.queryWidget(
        'tenant-1',
        widget(DashboardBindingMode.HISTORY, { limit: 25 }),
      ),
    ).resolves.toMatchObject({
      state: 'READY',
      bindings: [
        {
          data: {
            points: [
              {
                observedAt: '2026-07-19T00:59:00.000Z',
                value: 25,
              },
            ],
            nextCursor: 'cursor-1',
          },
        },
      ],
    });
    expect(telemetry.getHistory).toHaveBeenCalledWith(
      'tenant-1',
      'device-1',
      25,
    );
  });

  it('executes an aggregate with server-derived canonical bounds', async () => {
    aggregation.getAggregate.mockResolvedValue({
      from: '2026-07-18T01:00:00.000Z',
      to: NOW.toISOString(),
      bucket: '1h',
      buckets: [{ start: '2026-07-19T00:00:00.000Z', avg: 24 }],
    });

    await expect(
      service.queryWidget(
        'tenant-1',
        widget(DashboardBindingMode.AGGREGATE, {
          bucket: '1h',
          rangeHours: 24,
        }),
      ),
    ).resolves.toMatchObject({
      state: 'READY',
      bindings: [
        {
          data: {
            from: '2026-07-18T01:00:00.000Z',
            to: NOW.toISOString(),
            bucket: '1h',
          },
        },
      ],
    });
    expect(aggregation.getAggregate).toHaveBeenCalledWith(
      'tenant-1',
      'device-1',
      'temperature',
      '2026-07-18T01:00:00.000Z',
      NOW.toISOString(),
      '1h',
    );
  });

  it('returns device status without querying telemetry', async () => {
    const statusWidget = widget(DashboardBindingMode.DEVICE_STATUS);
    statusWidget.bindings[0].capability = null;

    await expect(
      service.queryWidget('tenant-1', statusWidget),
    ).resolves.toMatchObject({
      state: 'READY',
      bindings: [{ data: { status: DeviceStatus.ACTIVE } }],
    });
    expect(telemetry.getLatest).not.toHaveBeenCalled();
  });

  it('keeps command execution deferred and fail-closed', async () => {
    await expect(
      service.queryWidget('tenant-1', widget(DashboardBindingMode.COMMAND)),
    ).resolves.toMatchObject({
      state: 'UNSUPPORTED',
      bindings: [
        {
          state: 'UNSUPPORTED',
          reasonCode: 'COMMAND_QUERY_DEFERRED',
        },
      ],
    });
  });

  it('isolates telemetry failures to the widget response', async () => {
    telemetry.getLatest.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.queryWidget('tenant-1', widget(DashboardBindingMode.LATEST)),
    ).resolves.toMatchObject({
      state: 'ERROR',
      bindings: [
        {
          state: 'ERROR',
          reasonCode: 'TELEMETRY_QUERY_FAILED',
          data: null,
        },
      ],
    });
  });
});
