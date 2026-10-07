import { Injectable, Logger } from '@nestjs/common';
import {
  DashboardBindingIntent,
  DashboardBindingMode,
  DashboardWidgetKind,
  Prisma,
} from '@prisma/client';
import {
  DASHBOARD_PERSISTENCE_ERROR_CODES,
  DashboardPersistenceError,
} from './dashboard.persistence.error';
import {
  DashboardResolutionBindingInput,
  DashboardResolutionCapability,
  DashboardResolutionWidgetInput,
  DashboardResolvedBinding,
  DashboardResolvedCapability,
  DashboardResolvedWidget,
} from './dashboard-widget-resolution.types';

const WIDGET_SCHEMA_VERSION = '1.0.0';
const MAX_HISTORY_LIMIT = 100;
const MAX_AGGREGATION_RANGE_HOURS = 31 * 24;
const MAX_AGGREGATION_BUCKETS = 744;
const SUPPORTED_STATES = [
  'LOADING',
  'EMPTY',
  'STALE',
  'UNAUTHORIZED',
  'OFFLINE',
  'ERROR',
] as const;
const NUMERIC_DATA_TYPES = new Set(['integer', 'number']);
const AGGREGATION_BUCKET_HOURS = {
  '15m': 0.25,
  '1h': 1,
  '1d': 24,
} as const;

class WidgetResolutionIssue extends Error {
  constructor(
    readonly state: 'INVALID' | 'UNSUPPORTED',
    readonly reasonCode: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class DashboardWidgetResolver {
  private readonly logger = new Logger(DashboardWidgetResolver.name);

  assertPersistable(widgets: DashboardResolutionWidgetInput[]): void {
    for (const widget of widgets) {
      const resolved = this.resolveWidget(widget);
      if (resolved.state !== 'READY') {
        this.logger.warn({
          event: 'dashboard.widget_resolution.rejected',
          outcome: 'rejected',
          kind: widget.kind,
          reason: resolved.reasonCode,
        });
        throw new DashboardPersistenceError(
          DASHBOARD_PERSISTENCE_ERROR_CODES.WidgetResolutionInvalid,
          resolved.message ?? 'Dashboard widget resolution failed',
        );
      }
    }
  }

  resolveWidgets(
    widgets: DashboardResolutionWidgetInput[],
  ): DashboardResolvedWidget[] {
    const resolved = widgets.map((widget) => this.resolveWidget(widget));
    const failed = resolved.filter((widget) => widget.state !== 'READY').length;

    this.logger.log({
      event: 'dashboard.widget_resolution.completed',
      outcome: failed === 0 ? 'succeeded' : 'partial',
      widgetCount: resolved.length,
      failedWidgetCount: failed,
    });

    return resolved;
  }

  private resolveWidget(
    widget: DashboardResolutionWidgetInput,
  ): DashboardResolvedWidget {
    try {
      if (widget.schemaVersion !== WIDGET_SCHEMA_VERSION) {
        this.invalid('WIDGET_SCHEMA_UNSUPPORTED', 'Unsupported widget schema');
      }

      const presentation = this.validatePresentation(widget);
      const bindings = widget.bindings.map((binding) =>
        this.resolveBinding(binding),
      );

      switch (widget.kind) {
        case DashboardWidgetKind.CARD:
          this.validateCard(widget, bindings);
          break;
        case DashboardWidgetKind.SWITCH:
          this.validateSwitch(widget, bindings);
          break;
        case DashboardWidgetKind.GAUGE:
          this.validateGauge(widget, bindings, presentation);
          break;
        case DashboardWidgetKind.CHART:
          this.validateChart(widget, bindings);
          break;
        case DashboardWidgetKind.MAP:
          if (presentation.coordinateSource === 'DEVICE_LOCATION_V1') {
            this.requireBindingCount(widget, 1, 16);
            for (const binding of bindings) if (binding.mode !== DashboardBindingMode.DEVICE_STATUS || binding.intent !== DashboardBindingIntent.READ) this.invalid('MAP_BINDING_INVALID', 'Map requires READ device location bindings.');
            break;
          }
          this.unsupported(
            'MAP_SEMANTICS_NOT_APPROVED',
            'Map widget resolution is disabled until a coordinate semantic contract is approved',
          );
          break;
        case DashboardWidgetKind.TABLE:
          this.validateTable(widget, bindings, presentation);
          break;
        case DashboardWidgetKind.STATUS:
          this.validateStatus(widget, bindings);
          break;
        default:
          this.invalid('WIDGET_KIND_UNSUPPORTED', 'Unsupported widget kind');
      }

      return {
        id: widget.id,
        kind: widget.kind,
        title: widget.title,
        state: 'READY',
        reasonCode: null,
        message: null,
        presentation,
        supportedStates: SUPPORTED_STATES,
        bindings,
      };
    } catch (error) {
      if (!(error instanceof WidgetResolutionIssue)) {
        throw error;
      }

      return {
        id: widget.id,
        kind: widget.kind,
        title: widget.title,
        state: error.state,
        reasonCode: error.reasonCode,
        message: error.message,
        presentation: this.lenientObject(widget.presentationConfig),
        supportedStates: SUPPORTED_STATES,
        bindings: widget.bindings.map((binding) =>
          this.resolveBindingLenient(binding),
        ),
      };
    }
  }

  private validateCard(
    widget: DashboardResolutionWidgetInput,
    bindings: DashboardResolvedBinding[],
  ): void {
    this.requireBindingCount(widget, 1, 1);
    const binding = bindings[0];

    if (binding.mode === DashboardBindingMode.DEVICE_STATUS) {
      return;
    }
    if (binding.mode === DashboardBindingMode.LATEST) {
      this.requireCapability(binding);
      this.requireReadableOrReportable(binding);
      return;
    }
    if (binding.mode === DashboardBindingMode.AGGREGATE) {
      this.requireReportableNumeric(binding);
      return;
    }

    this.invalid(
      'CARD_BINDING_INVALID',
      'Card widgets require DEVICE_STATUS, LATEST, or AGGREGATE',
    );
  }

  private validateSwitch(
    widget: DashboardResolutionWidgetInput,
    bindings: DashboardResolvedBinding[],
  ): void {
    this.requireBindingCount(widget, 1, 1);
    const binding = bindings[0];
    if (
      binding.mode !== DashboardBindingMode.COMMAND ||
      binding.intent !== DashboardBindingIntent.WRITE
    ) {
      this.invalid(
        'SWITCH_BINDING_INVALID',
        'Switch widgets require one COMMAND binding with WRITE intent',
      );
    }
    const capability = this.requireCapability(binding);
    if (!capability.access.writable || capability.dataType !== 'boolean') {
      this.invalid(
        'SWITCH_CAPABILITY_INVALID',
        'Switch widgets require a writable boolean capability',
      );
    }
  }

  private validateGauge(
    widget: DashboardResolutionWidgetInput,
    bindings: DashboardResolvedBinding[],
    presentation: Record<string, unknown>,
  ): void {
    this.requireBindingCount(widget, 1, 1);
    const binding = bindings[0];
    if (binding.mode !== DashboardBindingMode.LATEST) {
      this.invalid(
        'GAUGE_BINDING_INVALID',
        'Gauge widgets require one LATEST binding',
      );
    }
    const capability = this.requireReadableOrReportable(binding);
    if (!NUMERIC_DATA_TYPES.has(capability.dataType)) {
      this.invalid(
        'GAUGE_CAPABILITY_INVALID',
        'Gauge widgets require a numeric capability',
      );
    }

    const min = this.numberFrom(presentation.min, capability.constraints.min);
    const max = this.numberFrom(presentation.max, capability.constraints.max);
    if (min === undefined || max === undefined || max <= min) {
      this.invalid(
        'GAUGE_BOUNDS_INVALID',
        'Gauge widgets require valid numeric min and max bounds',
      );
    }
    presentation.min = min;
    presentation.max = max;
    presentation.precision = this.integerFrom(
      presentation.precision,
      capability.constraints.precision,
      0,
      10,
      2,
    );
    presentation.unit = this.stringFrom(presentation.unit, capability.unit, 32);
  }

  private validateChart(
    widget: DashboardResolutionWidgetInput,
    bindings: DashboardResolvedBinding[],
  ): void {
    this.requireBindingCount(widget, 1, 16);
    for (const binding of bindings) {
      if (
        binding.mode !== DashboardBindingMode.HISTORY &&
        binding.mode !== DashboardBindingMode.AGGREGATE
      ) {
        this.invalid(
          'CHART_BINDING_INVALID',
          'Chart widgets require HISTORY or AGGREGATE bindings',
        );
      }
      this.requireReportableNumeric(binding);
    }
  }

  private validateTable(
    widget: DashboardResolutionWidgetInput,
    bindings: DashboardResolvedBinding[],
    presentation: Record<string, unknown>,
  ): void {
    this.requireBindingCount(widget, 1, 16);
    for (const binding of bindings) {
      if (
        binding.mode !== DashboardBindingMode.DEVICE_STATUS &&
        binding.mode !== DashboardBindingMode.LATEST
      ) {
        this.invalid(
          'TABLE_BINDING_INVALID',
          'Table widgets support only DEVICE_STATUS and LATEST reads',
        );
      }
      if (binding.mode === DashboardBindingMode.LATEST) {
        this.requireReadableOrReportable(binding);
      }
    }

    const aliases = new Set(bindings.map((binding) => binding.alias));
    const columns = presentation.columns;
    if (columns !== undefined) {
      if (
        !Array.isArray(columns) ||
        columns.length < 1 ||
        columns.length > 16 ||
        columns.some(
          (value) => typeof value !== 'string' || !aliases.has(value),
        ) ||
        new Set(columns).size !== columns.length
      ) {
        this.invalid(
          'TABLE_COLUMNS_INVALID',
          'Table columns must be unique binding aliases',
        );
      }
    }
    if (
      presentation.sortBy !== undefined &&
      (typeof presentation.sortBy !== 'string' ||
        !aliases.has(presentation.sortBy))
    ) {
      this.invalid(
        'TABLE_SORT_INVALID',
        'Table sortBy must reference a binding alias',
      );
    }
  }

  private validateStatus(
    widget: DashboardResolutionWidgetInput,
    bindings: DashboardResolvedBinding[],
  ): void {
    this.requireBindingCount(widget, 1, 1);
    const binding = bindings[0];
    if (binding.mode === DashboardBindingMode.DEVICE_STATUS) {
      return;
    }
    if (binding.mode !== DashboardBindingMode.LATEST) {
      this.invalid(
        'STATUS_BINDING_INVALID',
        'Status widgets require DEVICE_STATUS or LATEST',
      );
    }
    this.requireReadableOrReportable(binding);
  }

  private resolveBinding(
    binding: DashboardResolutionBindingInput,
  ): DashboardResolvedBinding {
    if (!binding.device || binding.device.status === 'REVOKED') {
      this.invalid(
        'BINDING_DEVICE_INVALID',
        'Widget binding device is unavailable or revoked',
      );
    }

    if (binding.mode === DashboardBindingMode.DEVICE_STATUS) {
      if (binding.capabilityId || binding.capability) {
        this.invalid(
          'DEVICE_STATUS_CAPABILITY_FORBIDDEN',
          'DEVICE_STATUS bindings must not reference a capability',
        );
      }
    } else if (!binding.capability) {
      this.invalid(
        'BINDING_CAPABILITY_REQUIRED',
        'Capability metadata is required for this binding mode',
      );
    }

    const capability = binding.capability
      ? this.toResolvedCapability(binding.capability)
      : null;
    this.validateIntent(binding, capability);

    return {
      id: binding.id,
      alias: binding.alias,
      intent: binding.intent,
      mode: binding.mode,
      device: {
        id: binding.device.id,
        status: binding.device.status,
      },
      capability,
      query: this.validateQueryConfig(binding.mode, binding.queryConfig),
    };
  }

  private resolveBindingLenient(
    binding: DashboardResolutionBindingInput,
  ): DashboardResolvedBinding {
    return {
      id: binding.id,
      alias: binding.alias,
      intent: binding.intent,
      mode: binding.mode,
      device: binding.device
        ? { id: binding.device.id, status: binding.device.status }
        : null,
      capability: binding.capability
        ? this.toResolvedCapabilityLenient(binding.capability)
        : null,
      query: this.lenientObject(binding.queryConfig),
    };
  }

  private validateIntent(
    binding: DashboardResolutionBindingInput,
    capability: DashboardResolvedCapability | null,
  ): void {
    if (binding.mode === DashboardBindingMode.DEVICE_STATUS) {
      if (binding.intent !== DashboardBindingIntent.READ) {
        this.invalid(
          'DEVICE_STATUS_INTENT_INVALID',
          'DEVICE_STATUS bindings require READ intent',
        );
      }
      return;
    }

    if (!capability) {
      this.invalid(
        'BINDING_CAPABILITY_REQUIRED',
        'Capability metadata is required',
      );
    }

    if (
      binding.intent === DashboardBindingIntent.READ &&
      !capability.access.readable
    ) {
      this.invalid(
        'CAPABILITY_NOT_READABLE',
        'READ intent requires a readable capability',
      );
    }
    if (
      binding.intent === DashboardBindingIntent.REPORT &&
      !capability.access.reportable
    ) {
      this.invalid(
        'CAPABILITY_NOT_REPORTABLE',
        'REPORT intent requires a reportable capability',
      );
    }
    if (
      binding.intent === DashboardBindingIntent.WRITE &&
      !capability.access.writable
    ) {
      this.invalid(
        'CAPABILITY_NOT_WRITABLE',
        'WRITE intent requires a writable capability',
      );
    }
    if (
      binding.mode === DashboardBindingMode.COMMAND &&
      binding.intent !== DashboardBindingIntent.WRITE
    ) {
      this.invalid(
        'COMMAND_INTENT_INVALID',
        'COMMAND bindings require WRITE intent',
      );
    }
    if (
      binding.mode !== DashboardBindingMode.COMMAND &&
      binding.intent === DashboardBindingIntent.WRITE
    ) {
      this.invalid(
        'WRITE_MODE_INVALID',
        'WRITE intent is reserved for COMMAND bindings',
      );
    }
    if (
      (binding.mode === DashboardBindingMode.HISTORY ||
        binding.mode === DashboardBindingMode.AGGREGATE) &&
      binding.intent !== DashboardBindingIntent.REPORT
    ) {
      this.invalid(
        'REPORT_MODE_INVALID',
        'HISTORY and AGGREGATE bindings require REPORT intent',
      );
    }
  }

  private validateQueryConfig(
    mode: DashboardBindingMode,
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> {
    const config = this.safeObject(value);

    if (
      mode === DashboardBindingMode.DEVICE_STATUS ||
      mode === DashboardBindingMode.LATEST ||
      mode === DashboardBindingMode.COMMAND
    ) {
      this.assertKnownKeys(config, []);
      return {};
    }

    if (mode === DashboardBindingMode.HISTORY) {
      this.assertKnownKeys(config, ['limit']);
      return {
        limit: this.integerFrom(
          config.limit,
          undefined,
          1,
          MAX_HISTORY_LIMIT,
          50,
        ),
      };
    }

    this.assertKnownKeys(config, ['bucket', 'rangeHours']);
    const bucket = config.bucket ?? '1h';
    if (typeof bucket !== 'string' || !(bucket in AGGREGATION_BUCKET_HOURS)) {
      this.invalid(
        'AGGREGATE_BUCKET_INVALID',
        'Aggregate bucket must be 15m, 1h, or 1d',
      );
    }
    const rangeHours = this.integerFrom(
      config.rangeHours,
      undefined,
      1,
      MAX_AGGREGATION_RANGE_HOURS,
      24,
    );
    const duration =
      AGGREGATION_BUCKET_HOURS[bucket as keyof typeof AGGREGATION_BUCKET_HOURS];
    if (Math.ceil(rangeHours / duration) > MAX_AGGREGATION_BUCKETS) {
      this.invalid(
        'AGGREGATE_RANGE_INVALID',
        'Aggregate query must not exceed 744 buckets',
      );
    }
    return { bucket, rangeHours };
  }

  private validatePresentation(
    widget: DashboardResolutionWidgetInput,
  ): Record<string, unknown> {
    const config = this.safeObject(widget.presentationConfig);
    const common = ['staleAfterSeconds'];
    let allowed: string[];

    switch (widget.kind) {
      case DashboardWidgetKind.CARD:
        allowed = [...common, 'label', 'unit', 'precision'];
        break;
      case DashboardWidgetKind.SWITCH:
        allowed = [...common, 'onLabel', 'offLabel', 'confirmCommand'];
        break;
      case DashboardWidgetKind.GAUGE:
        allowed = [...common, 'min', 'max', 'unit', 'precision'];
        break;
      case DashboardWidgetKind.CHART:
        allowed = [...common, 'unit', 'precision'];
        break;
      case DashboardWidgetKind.MAP:
        allowed = [...common, 'coordinateSource'];
        break;
      case DashboardWidgetKind.TABLE:
        allowed = [
          ...common,
          'columns',
          'sortBy',
          'sortDirection',
          'rowLimit',
          'refreshSeconds',
        ];
        break;
      case DashboardWidgetKind.STATUS:
        allowed = [...common, 'labels', 'severityMap'];
        break;
      default:
        allowed = [];
    }

    this.assertKnownKeys(config, allowed);
    this.validateCommonPresentation(config);

    if (widget.kind === DashboardWidgetKind.CARD) {
      this.optionalString(config, 'label', 64);
      this.optionalString(config, 'unit', 32);
      this.optionalInteger(config, 'precision', 0, 10);
    } else if (widget.kind === DashboardWidgetKind.SWITCH) {
      this.optionalString(config, 'onLabel', 64);
      this.optionalString(config, 'offLabel', 64);
      if (
        config.confirmCommand !== undefined &&
        typeof config.confirmCommand !== 'boolean'
      ) {
        this.invalid(
          'SWITCH_PRESENTATION_INVALID',
          'confirmCommand must be boolean',
        );
      }
    } else if (widget.kind === DashboardWidgetKind.GAUGE) {
      this.optionalNumber(config, 'min');
      this.optionalNumber(config, 'max');
      this.optionalString(config, 'unit', 32);
      this.optionalInteger(config, 'precision', 0, 10);
    } else if (widget.kind === DashboardWidgetKind.CHART) {
      this.optionalString(config, 'unit', 32);
      this.optionalInteger(config, 'precision', 0, 10);
    } else if (widget.kind === DashboardWidgetKind.TABLE) {
      this.optionalString(config, 'sortBy', 64);
      if (
        config.sortDirection !== undefined &&
        config.sortDirection !== 'asc' &&
        config.sortDirection !== 'desc'
      ) {
        this.invalid(
          'TABLE_PRESENTATION_INVALID',
          'sortDirection must be asc or desc',
        );
      }
      this.optionalInteger(config, 'rowLimit', 1, 100);
      this.optionalInteger(config, 'refreshSeconds', 5, 3600);
    } else if (widget.kind === DashboardWidgetKind.STATUS) {
      this.optionalStringRecord(config, 'labels', 32, 64);
      this.optionalStringRecord(config, 'severityMap', 32, 32);
    }

    return config;
  }

  private validateCommonPresentation(config: Record<string, unknown>): void {
    this.optionalInteger(config, 'staleAfterSeconds', 5, 86400);
  }

  private requireBindingCount(
    widget: DashboardResolutionWidgetInput,
    min: number,
    max: number,
  ): void {
    if (widget.bindings.length < min || widget.bindings.length > max) {
      this.invalid(
        'WIDGET_BINDING_COUNT_INVALID',
        `Widget ${widget.kind} requires between ${min} and ${max} bindings`,
      );
    }
  }

  private requireCapability(
    binding: DashboardResolvedBinding,
  ): NonNullable<DashboardResolvedBinding['capability']> {
    if (!binding.capability) {
      this.invalid(
        'BINDING_CAPABILITY_REQUIRED',
        'Capability metadata is required',
      );
    }
    return binding.capability;
  }

  private requireReadableOrReportable(
    binding: DashboardResolvedBinding,
  ): NonNullable<DashboardResolvedBinding['capability']> {
    const capability = this.requireCapability(binding);
    if (!capability.access.readable && !capability.access.reportable) {
      this.invalid(
        'CAPABILITY_NOT_READABLE_OR_REPORTABLE',
        'Capability must be readable or reportable',
      );
    }
    return capability;
  }

  private requireReportableNumeric(binding: DashboardResolvedBinding): void {
    const capability = this.requireCapability(binding);
    if (
      !capability.access.reportable ||
      !NUMERIC_DATA_TYPES.has(capability.dataType)
    ) {
      this.invalid(
        'CAPABILITY_NOT_NUMERIC_REPORTABLE',
        'Binding requires a numeric reportable capability',
      );
    }
  }

  private toResolvedCapability(
    capability: DashboardResolutionCapability,
  ): DashboardResolvedCapability {
    if (capability.schemaVersion !== WIDGET_SCHEMA_VERSION) {
      this.invalid(
        'CAPABILITY_SCHEMA_UNSUPPORTED',
        'Unsupported capability schema version',
      );
    }
    return {
      id: capability.id,
      key: capability.key,
      semanticType: capability.semanticType,
      dataType: capability.dataType,
      unit: capability.unit,
      constraints: this.normalizedConstraints(capability.constraints),
      access: {
        readable: capability.isReadable,
        writable: capability.isWritable,
        reportable: capability.isReportable,
      },
    };
  }

  private toResolvedCapabilityLenient(
    capability: DashboardResolutionCapability,
  ): DashboardResolvedCapability {
    return {
      id: capability.id,
      key: capability.key,
      semanticType: capability.semanticType,
      dataType: capability.dataType,
      unit: capability.unit,
      constraints: this.normalizedConstraintsLenient(capability.constraints),
      access: {
        readable: capability.isReadable,
        writable: capability.isWritable,
        reportable: capability.isReportable,
      },
    };
  }

  private normalizedConstraintsLenient(value: Prisma.JsonValue | null): {
    min?: number;
    max?: number;
    precision?: number;
    enumValues?: string[];
  } {
    const source = this.lenientObject(value);
    const result: {
      min?: number;
      max?: number;
      precision?: number;
      enumValues?: string[];
    } = {};
    if (typeof source.min === 'number' && Number.isFinite(source.min)) {
      result.min = source.min;
    }
    if (typeof source.max === 'number' && Number.isFinite(source.max)) {
      result.max = source.max;
    }
    if (
      typeof source.precision === 'number' &&
      Number.isInteger(source.precision) &&
      source.precision >= 0 &&
      source.precision <= 10
    ) {
      result.precision = source.precision;
    }
    if (
      Array.isArray(source.enumValues) &&
      source.enumValues.length <= 64 &&
      source.enumValues.every(
        (entry) => typeof entry === 'string' && entry.length <= 128,
      )
    ) {
      result.enumValues = [...source.enumValues];
    }
    return result;
  }

  private normalizedConstraints(value: Prisma.JsonValue | null): {
    min?: number;
    max?: number;
    precision?: number;
    enumValues?: string[];
  } {
    const source = this.safeObject(value);
    const result: {
      min?: number;
      max?: number;
      precision?: number;
      enumValues?: string[];
    } = {};
    if (typeof source.min === 'number' && Number.isFinite(source.min)) {
      result.min = source.min;
    }
    if (typeof source.max === 'number' && Number.isFinite(source.max)) {
      result.max = source.max;
    }
    if (
      typeof source.precision === 'number' &&
      Number.isInteger(source.precision) &&
      source.precision >= 0 &&
      source.precision <= 10
    ) {
      result.precision = source.precision;
    }
    if (
      Array.isArray(source.enumValues) &&
      source.enumValues.length <= 64 &&
      source.enumValues.every(
        (entry) => typeof entry === 'string' && entry.length <= 128,
      )
    ) {
      result.enumValues = [...source.enumValues];
    }
    return result;
  }

  private lenientObject(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> {
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      return {};
    }
    return { ...(value as Record<string, unknown>) };
  }

  private safeObject(value: Prisma.JsonValue | null): Record<string, unknown> {
    if (value === null || value === undefined) {
      return {};
    }
    if (Array.isArray(value) || typeof value !== 'object') {
      this.invalid(
        'CONFIG_OBJECT_REQUIRED',
        'Widget configuration must be an object',
      );
    }
    return { ...(value as Record<string, unknown>) };
  }

  private assertKnownKeys(
    value: Record<string, unknown>,
    allowed: string[],
  ): void {
    const allowedSet = new Set(allowed);
    const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
    if (unknown) {
      this.invalid(
        'CONFIG_KEY_UNKNOWN',
        `Unknown widget configuration key: ${unknown}`,
      );
    }
  }

  private optionalString(
    value: Record<string, unknown>,
    key: string,
    maxLength: number,
  ): void {
    if (value[key] === undefined) return;
    if (
      typeof value[key] !== 'string' ||
      (value[key] as string).length === 0 ||
      (value[key] as string).length > maxLength
    ) {
      this.invalid('CONFIG_STRING_INVALID', `${key} must be a bounded string`);
    }
  }

  private optionalNumber(value: Record<string, unknown>, key: string): void {
    if (value[key] === undefined) return;
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
      this.invalid('CONFIG_NUMBER_INVALID', `${key} must be a finite number`);
    }
  }

  private optionalInteger(
    value: Record<string, unknown>,
    key: string,
    min: number,
    max: number,
  ): void {
    const candidate = value[key];
    if (candidate === undefined) return;
    if (
      typeof candidate !== 'number' ||
      !Number.isInteger(candidate) ||
      candidate < min ||
      candidate > max
    ) {
      this.invalid(
        'CONFIG_INTEGER_INVALID',
        `${key} must be an integer between ${min} and ${max}`,
      );
    }
  }

  private optionalStringRecord(
    value: Record<string, unknown>,
    key: string,
    maxEntries: number,
    maxValueLength: number,
  ): void {
    if (value[key] === undefined) return;
    const record = value[key];
    if (!record || Array.isArray(record) || typeof record !== 'object') {
      this.invalid('CONFIG_RECORD_INVALID', `${key} must be an object`);
    }
    const entries = Object.entries(record as Record<string, unknown>);
    if (
      entries.length > maxEntries ||
      entries.some(
        ([entryKey, entryValue]) =>
          entryKey.length === 0 ||
          entryKey.length > 64 ||
          typeof entryValue !== 'string' ||
          entryValue.length > maxValueLength,
      )
    ) {
      this.invalid('CONFIG_RECORD_INVALID', `${key} contains invalid entries`);
    }
  }

  private numberFrom(
    primary: unknown,
    fallback: number | undefined,
  ): number | undefined {
    if (typeof primary === 'number' && Number.isFinite(primary)) return primary;
    return fallback;
  }

  private integerFrom(
    primary: unknown,
    fallback: number | undefined,
    min: number,
    max: number,
    defaultValue: number,
  ): number {
    const candidate = primary ?? fallback ?? defaultValue;
    if (
      typeof candidate !== 'number' ||
      !Number.isInteger(candidate) ||
      candidate < min ||
      candidate > max
    ) {
      this.invalid(
        'CONFIG_INTEGER_INVALID',
        `Value must be an integer between ${min} and ${max}`,
      );
    }
    return candidate;
  }

  private stringFrom(
    primary: unknown,
    fallback: string | null,
    maxLength: number,
  ): string | null {
    const candidate = primary ?? fallback;
    if (candidate === null || candidate === undefined) return null;
    if (
      typeof candidate !== 'string' ||
      candidate.length === 0 ||
      candidate.length > maxLength
    ) {
      this.invalid('CONFIG_STRING_INVALID', 'Value must be a bounded string');
    }
    return candidate;
  }

  private invalid(reasonCode: string, message: string): never {
    throw new WidgetResolutionIssue('INVALID', reasonCode, message);
  }

  private unsupported(reasonCode: string, message: string): never {
    throw new WidgetResolutionIssue('UNSUPPORTED', reasonCode, message);
  }
}
