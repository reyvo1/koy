export type MobileDashboardWidgetKind =
  'CARD' | 'SWITCH' | 'GAUGE' | 'CHART' | 'MAP' | 'TABLE' | 'STATUS';

export type MobileDashboardBreakpoint = 'MOBILE' | 'TABLET' | 'DESKTOP';
export type MobileDashboardResolutionState =
  'READY' | 'INVALID' | 'UNSUPPORTED';
export type MobileDashboardDataState =
  'READY' | 'EMPTY' | 'STALE' | 'INVALID' | 'UNSUPPORTED' | 'ERROR';

export interface MobileDashboardSummary {
  id: string;
  name: string;
  description: string | null;
  audience: 'PERSONAL' | 'TENANT_SHARED';
  schemaVersion: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface MobileDashboardLayoutItem {
  id: string;
  widgetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MobileDashboardLayout {
  id: string;
  breakpoint: MobileDashboardBreakpoint;
  columns: number;
  rowHeight: number;
  gap: number;
  items: MobileDashboardLayoutItem[];
}

export interface MobileDashboardWidgetBinding {
  id: string;
  alias: string;
  intent: 'READ' | 'REPORT' | 'WRITE';
  mode: 'DEVICE_STATUS' | 'LATEST' | 'HISTORY' | 'AGGREGATE' | 'COMMAND';
  deviceId: string;
  capabilityId: string | null;
  queryConfig: Record<string, unknown> | null;
}

export interface MobileDashboardWidget {
  id: string;
  kind: MobileDashboardWidgetKind;
  title: string;
  schemaVersion: string;
  presentationConfig: Record<string, unknown> | null;
  bindings: MobileDashboardWidgetBinding[];
}

export interface MobileDashboardAggregate extends MobileDashboardSummary {
  layouts: MobileDashboardLayout[];
  widgets: MobileDashboardWidget[];
}

export interface MobileResolvedBinding {
  id: string;
  alias: string;
  intent: MobileDashboardWidgetBinding['intent'];
  mode: MobileDashboardWidgetBinding['mode'];
  device: { id: string; status: string } | null;
  capability: {
    id: string;
    key: string;
    semanticType: string;
    dataType: string;
    unit: string | null;
    constraints: {
      min?: number;
      max?: number;
      precision?: number;
      enumValues?: string[];
    };
    access: {
      readable: boolean;
      writable: boolean;
      reportable: boolean;
    };
  } | null;
  query: Record<string, unknown>;
}

export interface MobileResolvedWidget {
  id: string;
  kind: MobileDashboardWidgetKind;
  title: string;
  state: MobileDashboardResolutionState;
  reasonCode: string | null;
  presentation: Record<string, unknown>;
  bindings: MobileResolvedBinding[];
}

export interface MobileDashboardResolution {
  dashboardId: string;
  schemaVersion: string;
  revision: number;
  summary: {
    total: number;
    ready: number;
    invalid: number;
    unsupported: number;
  };
  widgets: MobileResolvedWidget[];
}

export interface MobileWidgetBindingData {
  id: string;
  alias: string;
  mode: MobileDashboardWidgetBinding['mode'];
  state: MobileDashboardDataState;
  reasonCode: string | null;
  observedAt: string | null;
  data: Record<string, unknown> | null;
}

export interface MobileWidgetData {
  dashboardId: string;
  schemaVersion: string;
  revision: number;
  widgetId: string;
  kind: MobileDashboardWidgetKind;
  title: string;
  state: MobileDashboardDataState;
  reasonCode: string | null;
  generatedAt: string;
  summary: {
    total: number;
    ready: number;
    empty: number;
    stale: number;
    invalid: number;
    unsupported: number;
    error: number;
  };
  bindings: MobileWidgetBindingData[];
}

export interface MobileDashboardExperience {
  dashboards: MobileDashboardSummary[];
  selectedDashboardId: string | null;
  dashboard: MobileDashboardAggregate | null;
  resolution: MobileDashboardResolution | null;
  widgetData: Record<string, MobileWidgetData>;
}

export class MobileDashboardValidationError extends Error {
  constructor(readonly code: string) {
    super('The dashboard API returned an invalid bounded response.');
    this.name = 'MobileDashboardValidationError';
  }
}

const MAX_DASHBOARDS = 50;
const MAX_LAYOUTS = 3;
const MAX_LAYOUT_ITEMS = 300;
const MAX_WIDGETS = 100;
const MAX_BINDINGS_PER_WIDGET = 16;
const MAX_SAFE_OBJECT_BYTES = 16_384;
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_ALIAS_LENGTH = 64;
const MAX_REASON_CODE_LENGTH = 128;
const MAX_DATE_LENGTH = 64;

const widgetKinds: readonly MobileDashboardWidgetKind[] = [
  'CARD',
  'SWITCH',
  'GAUGE',
  'CHART',
  'MAP',
  'TABLE',
  'STATUS',
];
const breakpoints: readonly MobileDashboardBreakpoint[] = [
  'MOBILE',
  'TABLET',
  'DESKTOP',
];
const resolutionStates: readonly MobileDashboardResolutionState[] = [
  'READY',
  'INVALID',
  'UNSUPPORTED',
];
const dataStates: readonly MobileDashboardDataState[] = [
  'READY',
  'EMPTY',
  'STALE',
  'INVALID',
  'UNSUPPORTED',
  'ERROR',
];
const audiences = ['PERSONAL', 'TENANT_SHARED'] as const;
const intents = ['READ', 'REPORT', 'WRITE'] as const;
const modes = [
  'DEVICE_STATUS',
  'LATEST',
  'HISTORY',
  'AGGREGATE',
  'COMMAND',
] as const;

export function parseMobileDashboardList(
  payload: unknown,
): MobileDashboardSummary[] {
  const record = readRecord(payload, 'MOBILE_DASHBOARD_LIST_INVALID');
  const items = readArray(
    record.items,
    MAX_DASHBOARDS,
    'MOBILE_DASHBOARD_LIST_INVALID',
  );
  return items.map((item) => parseSummary(item));
}

export function parseMobileDashboardAggregate(
  payload: unknown,
): MobileDashboardAggregate {
  const record = readRecord(payload, 'MOBILE_DASHBOARD_AGGREGATE_INVALID');
  const summary = parseSummary(record);
  const layouts = readArray(
    record.layouts,
    MAX_LAYOUTS,
    'MOBILE_DASHBOARD_AGGREGATE_INVALID',
  ).map(parseLayout);
  const widgets = readArray(
    record.widgets,
    MAX_WIDGETS,
    'MOBILE_DASHBOARD_AGGREGATE_INVALID',
  ).map(parseWidget);

  return { ...summary, layouts, widgets };
}

export function parseMobileDashboardResolution(
  payload: unknown,
): MobileDashboardResolution {
  const record = readRecord(payload, 'MOBILE_DASHBOARD_RESOLUTION_INVALID');
  const summary = readRecord(
    record.summary,
    'MOBILE_DASHBOARD_RESOLUTION_INVALID',
  );

  return {
    dashboardId: readString(
      record.dashboardId,
      MAX_ID_LENGTH,
      'MOBILE_DASHBOARD_RESOLUTION_INVALID',
    ),
    schemaVersion: readString(
      record.schemaVersion,
      32,
      'MOBILE_DASHBOARD_RESOLUTION_INVALID',
    ),
    revision: readInteger(
      record.revision,
      1,
      Number.MAX_SAFE_INTEGER,
      'MOBILE_DASHBOARD_RESOLUTION_INVALID',
    ),
    summary: {
      total: readInteger(
        summary.total,
        0,
        MAX_WIDGETS,
        'MOBILE_DASHBOARD_RESOLUTION_INVALID',
      ),
      ready: readInteger(
        summary.ready,
        0,
        MAX_WIDGETS,
        'MOBILE_DASHBOARD_RESOLUTION_INVALID',
      ),
      invalid: readInteger(
        summary.invalid,
        0,
        MAX_WIDGETS,
        'MOBILE_DASHBOARD_RESOLUTION_INVALID',
      ),
      unsupported: readInteger(
        summary.unsupported,
        0,
        MAX_WIDGETS,
        'MOBILE_DASHBOARD_RESOLUTION_INVALID',
      ),
    },
    widgets: readArray(
      record.widgets,
      MAX_WIDGETS,
      'MOBILE_DASHBOARD_RESOLUTION_INVALID',
    ).map(parseResolvedWidget),
  };
}

export function parseMobileWidgetData(payload: unknown): MobileWidgetData {
  const record = readRecord(payload, 'MOBILE_WIDGET_DATA_INVALID');
  const summary = readRecord(record.summary, 'MOBILE_WIDGET_DATA_INVALID');

  return {
    dashboardId: readString(
      record.dashboardId,
      MAX_ID_LENGTH,
      'MOBILE_WIDGET_DATA_INVALID',
    ),
    schemaVersion: readString(
      record.schemaVersion,
      32,
      'MOBILE_WIDGET_DATA_INVALID',
    ),
    revision: readInteger(
      record.revision,
      1,
      Number.MAX_SAFE_INTEGER,
      'MOBILE_WIDGET_DATA_INVALID',
    ),
    widgetId: readString(
      record.widgetId,
      MAX_ID_LENGTH,
      'MOBILE_WIDGET_DATA_INVALID',
    ),
    kind: readEnum(record.kind, widgetKinds, 'MOBILE_WIDGET_DATA_INVALID'),
    title: readString(
      record.title,
      MAX_TITLE_LENGTH,
      'MOBILE_WIDGET_DATA_INVALID',
    ),
    state: readEnum(record.state, dataStates, 'MOBILE_WIDGET_DATA_INVALID'),
    reasonCode: readNullableString(
      record.reasonCode,
      MAX_REASON_CODE_LENGTH,
      'MOBILE_WIDGET_DATA_INVALID',
    ),
    generatedAt: readString(
      record.generatedAt,
      MAX_DATE_LENGTH,
      'MOBILE_WIDGET_DATA_INVALID',
    ),
    summary: {
      total: readInteger(
        summary.total,
        0,
        MAX_BINDINGS_PER_WIDGET,
        'MOBILE_WIDGET_DATA_INVALID',
      ),
      ready: readInteger(
        summary.ready,
        0,
        MAX_BINDINGS_PER_WIDGET,
        'MOBILE_WIDGET_DATA_INVALID',
      ),
      empty: readInteger(
        summary.empty,
        0,
        MAX_BINDINGS_PER_WIDGET,
        'MOBILE_WIDGET_DATA_INVALID',
      ),
      stale: readInteger(
        summary.stale,
        0,
        MAX_BINDINGS_PER_WIDGET,
        'MOBILE_WIDGET_DATA_INVALID',
      ),
      invalid: readInteger(
        summary.invalid,
        0,
        MAX_BINDINGS_PER_WIDGET,
        'MOBILE_WIDGET_DATA_INVALID',
      ),
      unsupported: readInteger(
        summary.unsupported,
        0,
        MAX_BINDINGS_PER_WIDGET,
        'MOBILE_WIDGET_DATA_INVALID',
      ),
      error: readInteger(
        summary.error,
        0,
        MAX_BINDINGS_PER_WIDGET,
        'MOBILE_WIDGET_DATA_INVALID',
      ),
    },
    bindings: readArray(
      record.bindings,
      MAX_BINDINGS_PER_WIDGET,
      'MOBILE_WIDGET_DATA_INVALID',
    ).map(parseWidgetBindingData),
  };
}

function parseSummary(payload: unknown): MobileDashboardSummary {
  const record = readRecord(payload, 'MOBILE_DASHBOARD_SUMMARY_INVALID');

  return {
    id: readString(
      record.id,
      MAX_ID_LENGTH,
      'MOBILE_DASHBOARD_SUMMARY_INVALID',
    ),
    name: readString(
      record.name,
      MAX_TITLE_LENGTH,
      'MOBILE_DASHBOARD_SUMMARY_INVALID',
    ),
    description: readNullableString(
      record.description,
      MAX_DESCRIPTION_LENGTH,
      'MOBILE_DASHBOARD_SUMMARY_INVALID',
    ),
    audience: readEnum(
      record.audience,
      audiences,
      'MOBILE_DASHBOARD_SUMMARY_INVALID',
    ),
    schemaVersion: readString(
      record.schemaVersion,
      32,
      'MOBILE_DASHBOARD_SUMMARY_INVALID',
    ),
    revision: readInteger(
      record.revision,
      1,
      Number.MAX_SAFE_INTEGER,
      'MOBILE_DASHBOARD_SUMMARY_INVALID',
    ),
    createdAt: readString(
      record.createdAt,
      MAX_DATE_LENGTH,
      'MOBILE_DASHBOARD_SUMMARY_INVALID',
    ),
    updatedAt: readString(
      record.updatedAt,
      MAX_DATE_LENGTH,
      'MOBILE_DASHBOARD_SUMMARY_INVALID',
    ),
  };
}

function parseLayout(payload: unknown): MobileDashboardLayout {
  const record = readRecord(payload, 'MOBILE_DASHBOARD_LAYOUT_INVALID');
  return {
    id: readString(record.id, MAX_ID_LENGTH, 'MOBILE_DASHBOARD_LAYOUT_INVALID'),
    breakpoint: readEnum(
      record.breakpoint,
      breakpoints,
      'MOBILE_DASHBOARD_LAYOUT_INVALID',
    ),
    columns: readInteger(
      record.columns,
      1,
      24,
      'MOBILE_DASHBOARD_LAYOUT_INVALID',
    ),
    rowHeight: readInteger(
      record.rowHeight,
      1,
      512,
      'MOBILE_DASHBOARD_LAYOUT_INVALID',
    ),
    gap: readInteger(record.gap, 0, 64, 'MOBILE_DASHBOARD_LAYOUT_INVALID'),
    items: readArray(
      record.items,
      MAX_LAYOUT_ITEMS,
      'MOBILE_DASHBOARD_LAYOUT_INVALID',
    ).map(parseLayoutItem),
  };
}

function parseLayoutItem(payload: unknown): MobileDashboardLayoutItem {
  const record = readRecord(payload, 'MOBILE_DASHBOARD_LAYOUT_ITEM_INVALID');
  return {
    id: readString(
      record.id,
      MAX_ID_LENGTH,
      'MOBILE_DASHBOARD_LAYOUT_ITEM_INVALID',
    ),
    widgetId: readString(
      record.widgetId,
      MAX_ID_LENGTH,
      'MOBILE_DASHBOARD_LAYOUT_ITEM_INVALID',
    ),
    x: readInteger(
      record.x,
      0,
      Number.MAX_SAFE_INTEGER,
      'MOBILE_DASHBOARD_LAYOUT_ITEM_INVALID',
    ),
    y: readInteger(
      record.y,
      0,
      Number.MAX_SAFE_INTEGER,
      'MOBILE_DASHBOARD_LAYOUT_ITEM_INVALID',
    ),
    width: readInteger(
      record.width,
      1,
      24,
      'MOBILE_DASHBOARD_LAYOUT_ITEM_INVALID',
    ),
    height: readInteger(
      record.height,
      1,
      256,
      'MOBILE_DASHBOARD_LAYOUT_ITEM_INVALID',
    ),
  };
}

function parseWidget(payload: unknown): MobileDashboardWidget {
  const record = readRecord(payload, 'MOBILE_DASHBOARD_WIDGET_INVALID');
  return {
    id: readString(record.id, MAX_ID_LENGTH, 'MOBILE_DASHBOARD_WIDGET_INVALID'),
    kind: readEnum(record.kind, widgetKinds, 'MOBILE_DASHBOARD_WIDGET_INVALID'),
    title: readString(
      record.title,
      MAX_TITLE_LENGTH,
      'MOBILE_DASHBOARD_WIDGET_INVALID',
    ),
    schemaVersion: readString(
      record.schemaVersion,
      32,
      'MOBILE_DASHBOARD_WIDGET_INVALID',
    ),
    presentationConfig: readNullableSafeObject(
      record.presentationConfig,
      'MOBILE_DASHBOARD_WIDGET_INVALID',
    ),
    bindings: readArray(
      record.bindings,
      MAX_BINDINGS_PER_WIDGET,
      'MOBILE_DASHBOARD_WIDGET_INVALID',
    ).map(parseWidgetBinding),
  };
}

function parseWidgetBinding(payload: unknown): MobileDashboardWidgetBinding {
  const record = readRecord(payload, 'MOBILE_DASHBOARD_BINDING_INVALID');
  return {
    id: readString(
      record.id,
      MAX_ID_LENGTH,
      'MOBILE_DASHBOARD_BINDING_INVALID',
    ),
    alias: readString(
      record.alias,
      MAX_ALIAS_LENGTH,
      'MOBILE_DASHBOARD_BINDING_INVALID',
    ),
    intent: readEnum(
      record.intent,
      intents,
      'MOBILE_DASHBOARD_BINDING_INVALID',
    ),
    mode: readEnum(record.mode, modes, 'MOBILE_DASHBOARD_BINDING_INVALID'),
    deviceId: readString(
      record.deviceId,
      MAX_ID_LENGTH,
      'MOBILE_DASHBOARD_BINDING_INVALID',
    ),
    capabilityId: readNullableString(
      record.capabilityId,
      MAX_ID_LENGTH,
      'MOBILE_DASHBOARD_BINDING_INVALID',
    ),
    queryConfig: readNullableSafeObject(
      record.queryConfig,
      'MOBILE_DASHBOARD_BINDING_INVALID',
    ),
  };
}

function parseResolvedWidget(payload: unknown): MobileResolvedWidget {
  const record = readRecord(payload, 'MOBILE_RESOLVED_WIDGET_INVALID');
  return {
    id: readString(record.id, MAX_ID_LENGTH, 'MOBILE_RESOLVED_WIDGET_INVALID'),
    kind: readEnum(record.kind, widgetKinds, 'MOBILE_RESOLVED_WIDGET_INVALID'),
    title: readString(
      record.title,
      MAX_TITLE_LENGTH,
      'MOBILE_RESOLVED_WIDGET_INVALID',
    ),
    state: readEnum(
      record.state,
      resolutionStates,
      'MOBILE_RESOLVED_WIDGET_INVALID',
    ),
    reasonCode: readNullableString(
      record.reasonCode,
      MAX_REASON_CODE_LENGTH,
      'MOBILE_RESOLVED_WIDGET_INVALID',
    ),
    presentation: readSafeObject(
      record.presentation,
      'MOBILE_RESOLVED_WIDGET_INVALID',
    ),
    bindings: readArray(
      record.bindings,
      MAX_BINDINGS_PER_WIDGET,
      'MOBILE_RESOLVED_WIDGET_INVALID',
    ).map(parseResolvedBinding),
  };
}

function parseResolvedBinding(payload: unknown): MobileResolvedBinding {
  const record = readRecord(payload, 'MOBILE_RESOLVED_BINDING_INVALID');
  return {
    id: readString(record.id, MAX_ID_LENGTH, 'MOBILE_RESOLVED_BINDING_INVALID'),
    alias: readString(
      record.alias,
      MAX_ALIAS_LENGTH,
      'MOBILE_RESOLVED_BINDING_INVALID',
    ),
    intent: readEnum(record.intent, intents, 'MOBILE_RESOLVED_BINDING_INVALID'),
    mode: readEnum(record.mode, modes, 'MOBILE_RESOLVED_BINDING_INVALID'),
    device: record.device === null ? null : parseResolvedDevice(record.device),
    capability:
      record.capability === null
        ? null
        : parseResolvedCapability(record.capability),
    query: readSafeObject(record.query, 'MOBILE_RESOLVED_BINDING_INVALID'),
  };
}

function parseResolvedDevice(payload: unknown): { id: string; status: string } {
  const record = readRecord(payload, 'MOBILE_RESOLVED_DEVICE_INVALID');
  return {
    id: readString(record.id, MAX_ID_LENGTH, 'MOBILE_RESOLVED_DEVICE_INVALID'),
    status: readString(record.status, 64, 'MOBILE_RESOLVED_DEVICE_INVALID'),
  };
}

function parseResolvedCapability(
  payload: unknown,
): NonNullable<MobileResolvedBinding['capability']> {
  const record = readRecord(payload, 'MOBILE_RESOLVED_CAPABILITY_INVALID');
  const constraints = readSafeObject(
    record.constraints,
    'MOBILE_RESOLVED_CAPABILITY_INVALID',
  );
  const access = readRecord(
    record.access,
    'MOBILE_RESOLVED_CAPABILITY_INVALID',
  );

  return {
    id: readString(
      record.id,
      MAX_ID_LENGTH,
      'MOBILE_RESOLVED_CAPABILITY_INVALID',
    ),
    key: readString(record.key, 128, 'MOBILE_RESOLVED_CAPABILITY_INVALID'),
    semanticType: readString(
      record.semanticType,
      128,
      'MOBILE_RESOLVED_CAPABILITY_INVALID',
    ),
    dataType: readString(
      record.dataType,
      64,
      'MOBILE_RESOLVED_CAPABILITY_INVALID',
    ),
    unit: readNullableString(
      record.unit,
      32,
      'MOBILE_RESOLVED_CAPABILITY_INVALID',
    ),
    constraints: {
      ...(readOptionalFiniteNumber(constraints.min) === undefined
        ? {}
        : { min: readOptionalFiniteNumber(constraints.min) }),
      ...(readOptionalFiniteNumber(constraints.max) === undefined
        ? {}
        : { max: readOptionalFiniteNumber(constraints.max) }),
      ...(readOptionalInteger(constraints.precision, 0, 12) === undefined
        ? {}
        : {
            precision: readOptionalInteger(constraints.precision, 0, 12),
          }),
      ...(constraints.enumValues === undefined
        ? {}
        : {
            enumValues: readArray(
              constraints.enumValues,
              100,
              'MOBILE_RESOLVED_CAPABILITY_INVALID',
            ).map((item) =>
              readString(item, 128, 'MOBILE_RESOLVED_CAPABILITY_INVALID'),
            ),
          }),
    },
    access: {
      readable: readBoolean(
        access.readable,
        'MOBILE_RESOLVED_CAPABILITY_INVALID',
      ),
      writable: readBoolean(
        access.writable,
        'MOBILE_RESOLVED_CAPABILITY_INVALID',
      ),
      reportable: readBoolean(
        access.reportable,
        'MOBILE_RESOLVED_CAPABILITY_INVALID',
      ),
    },
  };
}

function parseWidgetBindingData(payload: unknown): MobileWidgetBindingData {
  const record = readRecord(payload, 'MOBILE_WIDGET_BINDING_DATA_INVALID');
  return {
    id: readString(
      record.id,
      MAX_ID_LENGTH,
      'MOBILE_WIDGET_BINDING_DATA_INVALID',
    ),
    alias: readString(
      record.alias,
      MAX_ALIAS_LENGTH,
      'MOBILE_WIDGET_BINDING_DATA_INVALID',
    ),
    mode: readEnum(record.mode, modes, 'MOBILE_WIDGET_BINDING_DATA_INVALID'),
    state: readEnum(
      record.state,
      dataStates,
      'MOBILE_WIDGET_BINDING_DATA_INVALID',
    ),
    reasonCode: readNullableString(
      record.reasonCode,
      MAX_REASON_CODE_LENGTH,
      'MOBILE_WIDGET_BINDING_DATA_INVALID',
    ),
    observedAt: readNullableString(
      record.observedAt,
      MAX_DATE_LENGTH,
      'MOBILE_WIDGET_BINDING_DATA_INVALID',
    ),
    data: readNullableSafeObject(
      record.data,
      'MOBILE_WIDGET_BINDING_DATA_INVALID',
    ),
  };
}

function readRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MobileDashboardValidationError(code);
  }
  return value as Record<string, unknown>;
}

function readSafeObject(value: unknown, code: string): Record<string, unknown> {
  const record = readRecord(value, code);
  const serialized = JSON.stringify(record);
  if (serialized.length > MAX_SAFE_OBJECT_BYTES) {
    throw new MobileDashboardValidationError(code);
  }
  return record;
}

function readNullableSafeObject(
  value: unknown,
  code: string,
): Record<string, unknown> | null {
  return value === null || value === undefined
    ? null
    : readSafeObject(value, code);
}

function readArray(value: unknown, max: number, code: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new MobileDashboardValidationError(code);
  }
  return value;
}

function readString(value: unknown, maxLength: number, code: string): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maxLength
  ) {
    throw new MobileDashboardValidationError(code);
  }
  return value;
}

function readNullableString(
  value: unknown,
  maxLength: number,
  code: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new MobileDashboardValidationError(code);
  }
  return value;
}

function readInteger(
  value: unknown,
  min: number,
  max: number,
  code: string,
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new MobileDashboardValidationError(code);
  }
  return value as number;
}

function readOptionalInteger(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    return undefined;
  }
  return value as number;
}

function readOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readBoolean(value: unknown, code: string): boolean {
  if (typeof value !== 'boolean') {
    throw new MobileDashboardValidationError(code);
  }
  return value;
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  code: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new MobileDashboardValidationError(code);
  }
  return value as T;
}
