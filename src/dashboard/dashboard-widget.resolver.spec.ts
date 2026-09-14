import { randomUUID } from 'node:crypto';
import {
  DashboardBindingIntent,
  DashboardBindingMode,
  DashboardWidgetKind,
  DeviceStatus,
  Prisma,
} from '@prisma/client';
import {
  DASHBOARD_PERSISTENCE_ERROR_CODES,
  DashboardPersistenceError,
} from './dashboard.persistence.error';
import { DashboardWidgetResolver } from './dashboard-widget.resolver';
import {
  DashboardResolutionBindingInput,
  DashboardResolutionCapability,
  DashboardResolutionWidgetInput,
} from './dashboard-widget-resolution.types';

const deviceId = randomUUID();

function capability(
  overrides: Partial<DashboardResolutionCapability> = {},
): DashboardResolutionCapability {
  return {
    id: randomUUID(),
    deviceId,
    key: 'temperature',
    semanticType: 'temperature',
    dataType: 'number',
    unit: '°C',
    constraints: { min: -40, max: 125, precision: 1 },
    isReadable: true,
    isWritable: false,
    isReportable: true,
    schemaVersion: '1.0.0',
    ...overrides,
  };
}

function binding(
  overrides: Partial<DashboardResolutionBindingInput> = {},
): DashboardResolutionBindingInput {
  const target = capability();
  return {
    id: randomUUID(),
    alias: 'value',
    intent: DashboardBindingIntent.READ,
    mode: DashboardBindingMode.LATEST,
    deviceId,
    capabilityId: target.id,
    queryConfig: null,
    device: { id: deviceId, status: DeviceStatus.ACTIVE },
    capability: target,
    ...overrides,
  };
}

function widget(
  kind: DashboardWidgetKind,
  bindings: DashboardResolutionBindingInput[],
  presentationConfig: Prisma.JsonObject | null = null,
): DashboardResolutionWidgetInput {
  return {
    id: randomUUID(),
    kind,
    title: `${kind} widget`,
    schemaVersion: '1.0.0',
    presentationConfig,
    bindings,
  };
}

describe('DashboardWidgetResolver', () => {
  const resolver = new DashboardWidgetResolver();

  it('resolves CARD from device status without capability metadata', () => {
    const result = resolver.resolveWidgets([
      widget(DashboardWidgetKind.CARD, [
        binding({
          alias: 'status',
          mode: DashboardBindingMode.DEVICE_STATUS,
          intent: DashboardBindingIntent.READ,
          capabilityId: null,
          capability: null,
        }),
      ]),
    ]);

    expect(result[0]).toMatchObject({
      state: 'READY',
      bindings: [{ mode: DashboardBindingMode.DEVICE_STATUS }],
    });
  });

  it('resolves SWITCH only for a writable boolean command capability', () => {
    const target = capability({
      key: 'enabled',
      semanticType: 'enabled',
      dataType: 'boolean',
      constraints: null,
      unit: null,
      isReadable: true,
      isWritable: true,
      isReportable: false,
    });

    const result = resolver.resolveWidgets([
      widget(
        DashboardWidgetKind.SWITCH,
        [
          binding({
            intent: DashboardBindingIntent.WRITE,
            mode: DashboardBindingMode.COMMAND,
            capabilityId: target.id,
            capability: target,
          }),
        ],
        { onLabel: 'On', offLabel: 'Off', confirmCommand: true },
      ),
    ]);

    expect(result[0]).toMatchObject({ state: 'READY' });
  });

  it('normalizes GAUGE bounds from capability constraints', () => {
    const result = resolver.resolveWidgets([
      widget(DashboardWidgetKind.GAUGE, [binding()], { precision: 2 }),
    ]);

    expect(result[0]).toMatchObject({
      state: 'READY',
      presentation: {
        min: -40,
        max: 125,
        precision: 2,
        unit: '°C',
      },
    });
  });

  it('resolves CHART with bounded history and aggregate plans', () => {
    const aggregateCapability = capability({ key: 'humidity', unit: '%' });
    const result = resolver.resolveWidgets([
      widget(DashboardWidgetKind.CHART, [
        binding({
          alias: 'history',
          intent: DashboardBindingIntent.REPORT,
          mode: DashboardBindingMode.HISTORY,
          queryConfig: { limit: 75 },
        }),
        binding({
          alias: 'aggregate',
          intent: DashboardBindingIntent.REPORT,
          mode: DashboardBindingMode.AGGREGATE,
          capabilityId: aggregateCapability.id,
          capability: aggregateCapability,
          queryConfig: { bucket: '1h', rangeHours: 24 },
        }),
      ]),
    ]);

    expect(result[0]).toMatchObject({
      state: 'READY',
      bindings: [
        { query: { limit: 75 } },
        { query: { bucket: '1h', rangeHours: 24 } },
      ],
    });
  });

  it('resolves TABLE with bounded aliases, sorting, and refresh', () => {
    const result = resolver.resolveWidgets([
      widget(
        DashboardWidgetKind.TABLE,
        [
          binding({ alias: 'temperature' }),
          binding({
            alias: 'status',
            mode: DashboardBindingMode.DEVICE_STATUS,
            capabilityId: null,
            capability: null,
          }),
        ],
        {
          columns: ['status', 'temperature'],
          sortBy: 'temperature',
          sortDirection: 'desc',
          rowLimit: 25,
          refreshSeconds: 30,
        },
      ),
    ]);

    expect(result[0]).toMatchObject({ state: 'READY' });
  });

  it('resolves STATUS from one latest readable capability', () => {
    const result = resolver.resolveWidgets([
      widget(DashboardWidgetKind.STATUS, [binding()], {
        labels: { normal: 'Normal', alarm: 'Alarm' },
        severityMap: { normal: 'info', alarm: 'critical' },
      }),
    ]);

    expect(result[0]).toMatchObject({ state: 'READY' });
  });

  it('marks MAP unsupported until coordinate semantics are approved', () => {
    const mapWidget = widget(DashboardWidgetKind.MAP, []);
    const result = resolver.resolveWidgets([mapWidget]);

    expect(result[0]).toMatchObject({
      state: 'UNSUPPORTED',
      reasonCode: 'MAP_SEMANTICS_NOT_APPROVED',
    });
    expect(() => resolver.assertPersistable([mapWidget])).toThrow(
      expect.objectContaining<Partial<DashboardPersistenceError>>({
        code: DASHBOARD_PERSISTENCE_ERROR_CODES.WidgetResolutionInvalid,
      }),
    );
  });

  it('rejects non-writable switch capabilities', () => {
    const target = capability({ dataType: 'boolean', isWritable: false });
    const switchWidget = widget(DashboardWidgetKind.SWITCH, [
      binding({
        intent: DashboardBindingIntent.WRITE,
        mode: DashboardBindingMode.COMMAND,
        capabilityId: target.id,
        capability: target,
      }),
    ]);

    expect(() => resolver.assertPersistable([switchWidget])).toThrow(
      expect.objectContaining<Partial<DashboardPersistenceError>>({
        code: DASHBOARD_PERSISTENCE_ERROR_CODES.WidgetResolutionInvalid,
      }),
    );
  });

  it('rejects aggregate plans exceeding 744 buckets', () => {
    const chart = widget(DashboardWidgetKind.CHART, [
      binding({
        intent: DashboardBindingIntent.REPORT,
        mode: DashboardBindingMode.AGGREGATE,
        queryConfig: { bucket: '15m', rangeHours: 744 },
      }),
    ]);

    const result = resolver.resolveWidgets([chart]);
    expect(result[0]).toMatchObject({
      state: 'INVALID',
      reasonCode: 'AGGREGATE_RANGE_INVALID',
    });
  });

  it('isolates an invalid widget from ready widgets during resolution', () => {
    const invalid = widget(DashboardWidgetKind.GAUGE, [
      binding({ device: { id: deviceId, status: DeviceStatus.REVOKED } }),
    ]);
    const ready = widget(DashboardWidgetKind.CARD, [binding()]);

    const result = resolver.resolveWidgets([invalid, ready]);

    expect(result.map((entry) => entry.state)).toEqual(['INVALID', 'READY']);
    expect(result[0].reasonCode).toBe('BINDING_DEVICE_INVALID');
  });

  it('keeps partial resolution stable for unsupported capability schemas', () => {
    const invalidCapability = capability({ schemaVersion: '2.0.0' });
    const invalid = widget(DashboardWidgetKind.CARD, [
      binding({
        capabilityId: invalidCapability.id,
        capability: invalidCapability,
      }),
    ]);
    const ready = widget(DashboardWidgetKind.CARD, [binding()]);

    const result = resolver.resolveWidgets([invalid, ready]);

    expect(result.map((entry) => entry.state)).toEqual(['INVALID', 'READY']);
    expect(result[0]).toMatchObject({
      reasonCode: 'CAPABILITY_SCHEMA_UNSUPPORTED',
      bindings: [{ capability: { key: 'temperature' } }],
    });
  });

  it('rejects unknown presentation configuration keys', () => {
    const card = widget(DashboardWidgetKind.CARD, [binding()], {
      arbitraryCss: 'hidden',
    });

    expect(resolver.resolveWidgets([card])[0]).toMatchObject({
      state: 'INVALID',
      reasonCode: 'CONFIG_KEY_UNKNOWN',
    });
  });
});
