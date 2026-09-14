import { Injectable, Optional } from '@nestjs/common';
import { DashboardBindingMode } from '@prisma/client';
import { TelemetryAggregationService } from '../telemetry/telemetry-aggregation.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import {
  DashboardResolvedBinding,
  DashboardResolvedWidget,
} from './dashboard-widget-resolution.types';
import {
  DashboardWidgetBindingDataResult,
  DashboardWidgetDataResult,
  DashboardWidgetDataState,
  DashboardWidgetDataSummary,
} from './dashboard-widget-query.types';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const QUERY_FAILED_REASON = 'TELEMETRY_QUERY_FAILED';
const EMPTY_REASON = 'NO_TELEMETRY_DATA';
const STALE_REASON = 'TELEMETRY_DATA_STALE';
const COMMAND_DEFERRED_REASON = 'COMMAND_QUERY_DEFERRED';

type DashboardWidgetQueryClock = () => Date;

@Injectable()
export class DashboardWidgetQueryService {
  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly aggregationService: TelemetryAggregationService,
    @Optional() private readonly clock?: DashboardWidgetQueryClock,
  ) {}

  async queryWidget(
    tenantId: string,
    widget: DashboardResolvedWidget,
  ): Promise<DashboardWidgetDataResult> {
    const generatedAt = this.now();

    if (widget.state !== 'READY') {
      const bindings = widget.bindings.map((binding) =>
        this.unavailableBinding(
          binding,
          widget.state,
          widget.reasonCode,
          widget.message,
        ),
      );

      return this.toWidgetResult(widget, generatedAt, bindings);
    }

    const bindings = await Promise.all(
      widget.bindings.map((binding) =>
        this.queryBinding(tenantId, widget, binding, generatedAt),
      ),
    );

    return this.toWidgetResult(widget, generatedAt, bindings);
  }

  private async queryBinding(
    tenantId: string,
    widget: DashboardResolvedWidget,
    binding: DashboardResolvedBinding,
    generatedAt: Date,
  ): Promise<DashboardWidgetBindingDataResult> {
    try {
      switch (binding.mode) {
        case DashboardBindingMode.DEVICE_STATUS:
          return this.deviceStatus(binding);
        case DashboardBindingMode.LATEST:
          return await this.latest(tenantId, widget, binding, generatedAt);
        case DashboardBindingMode.HISTORY:
          return await this.history(tenantId, widget, binding, generatedAt);
        case DashboardBindingMode.AGGREGATE:
          return await this.aggregate(tenantId, binding, generatedAt);
        case DashboardBindingMode.COMMAND:
          return this.unavailableBinding(
            binding,
            'UNSUPPORTED',
            COMMAND_DEFERRED_REASON,
            'Command execution is deferred to a later Module 10 slice',
          );
        default:
          return this.unavailableBinding(
            binding,
            'UNSUPPORTED',
            'QUERY_MODE_UNSUPPORTED',
            'Widget query mode is not supported',
          );
      }
    } catch {
      return this.unavailableBinding(
        binding,
        'ERROR',
        QUERY_FAILED_REASON,
        'Telemetry query failed',
      );
    }
  }

  private deviceStatus(
    binding: DashboardResolvedBinding,
  ): DashboardWidgetBindingDataResult {
    if (!binding.device) {
      return this.unavailableBinding(
        binding,
        'ERROR',
        QUERY_FAILED_REASON,
        'Device metadata is unavailable',
      );
    }

    return {
      ...this.bindingIdentity(binding),
      state: 'READY',
      reasonCode: null,
      message: null,
      observedAt: null,
      data: {
        status: binding.device.status,
      },
    };
  }

  private async latest(
    tenantId: string,
    widget: DashboardResolvedWidget,
    binding: DashboardResolvedBinding,
    generatedAt: Date,
  ): Promise<DashboardWidgetBindingDataResult> {
    const target = this.requireTelemetryTarget(binding);
    const telemetry = await this.telemetryService.getLatest(
      tenantId,
      target.deviceId,
    );

    if (!telemetry) {
      return this.emptyBinding(binding);
    }

    const value = this.extractCapabilityValue(
      telemetry.payload,
      target.capabilityKey,
    );

    if (value === undefined) {
      return this.emptyBinding(binding);
    }

    const observedAt = telemetry.createdAt.toISOString();
    const stale = this.isStale(
      telemetry.createdAt,
      widget.presentation.staleAfterSeconds,
      generatedAt,
    );

    return {
      ...this.bindingIdentity(binding),
      state: stale ? 'STALE' : 'READY',
      reasonCode: stale ? STALE_REASON : null,
      message: stale ? 'Telemetry data is stale' : null,
      observedAt,
      data: { value },
    };
  }

  private async history(
    tenantId: string,
    widget: DashboardResolvedWidget,
    binding: DashboardResolvedBinding,
    generatedAt: Date,
  ): Promise<DashboardWidgetBindingDataResult> {
    const target = this.requireTelemetryTarget(binding);
    const limit = this.integerFrom(binding.query.limit, 50);
    const history = await this.telemetryService.getHistory(
      tenantId,
      target.deviceId,
      limit,
    );
    const points = history.items.flatMap((telemetry) => {
      const value = this.extractCapabilityValue(
        telemetry.payload,
        target.capabilityKey,
      );

      return value === undefined
        ? []
        : [
            {
              observedAt: telemetry.createdAt.toISOString(),
              value,
            },
          ];
    });

    if (points.length === 0) {
      return {
        ...this.emptyBinding(binding),
        data: {
          points: [],
          nextCursor: history.nextCursor,
        },
      };
    }

    const newestObservedAt = new Date(points[0].observedAt);
    const stale = this.isStale(
      newestObservedAt,
      widget.presentation.staleAfterSeconds,
      generatedAt,
    );

    return {
      ...this.bindingIdentity(binding),
      state: stale ? 'STALE' : 'READY',
      reasonCode: stale ? STALE_REASON : null,
      message: stale ? 'Telemetry data is stale' : null,
      observedAt: points[0].observedAt,
      data: {
        points,
        nextCursor: history.nextCursor,
      },
    };
  }

  private async aggregate(
    tenantId: string,
    binding: DashboardResolvedBinding,
    generatedAt: Date,
  ): Promise<DashboardWidgetBindingDataResult> {
    const target = this.requireTelemetryTarget(binding);
    const rangeHours = this.integerFrom(binding.query.rangeHours, 24);
    const bucket = this.stringFrom(binding.query.bucket, '1h');
    const to = generatedAt.toISOString();
    const from = new Date(
      generatedAt.getTime() - rangeHours * MILLISECONDS_PER_HOUR,
    ).toISOString();
    const aggregate = await this.aggregationService.getAggregate(
      tenantId,
      target.deviceId,
      target.capabilityKey,
      from,
      to,
      bucket,
    );

    if (aggregate.buckets.length === 0) {
      return {
        ...this.emptyBinding(binding),
        data: {
          from: aggregate.from,
          to: aggregate.to,
          bucket: aggregate.bucket,
          buckets: [],
        },
      };
    }

    const lastBucket = aggregate.buckets[aggregate.buckets.length - 1];

    return {
      ...this.bindingIdentity(binding),
      state: 'READY',
      reasonCode: null,
      message: null,
      observedAt: lastBucket?.end ?? null,
      data: {
        from: aggregate.from,
        to: aggregate.to,
        bucket: aggregate.bucket,
        buckets: aggregate.buckets,
      },
    };
  }

  private toWidgetResult(
    widget: DashboardResolvedWidget,
    generatedAt: Date,
    bindings: DashboardWidgetBindingDataResult[],
  ): DashboardWidgetDataResult {
    const summary = this.summarize(bindings);
    const state = this.widgetState(widget.state, summary);

    return {
      widgetId: widget.id,
      kind: widget.kind,
      title: widget.title,
      state,
      reasonCode: widget.state === 'READY' ? null : widget.reasonCode,
      message: widget.state === 'READY' ? null : widget.message,
      generatedAt: generatedAt.toISOString(),
      summary,
      bindings,
    };
  }

  private widgetState(
    resolutionState: DashboardResolvedWidget['state'],
    summary: DashboardWidgetDataSummary,
  ): DashboardWidgetDataState {
    if (resolutionState !== 'READY') {
      return resolutionState;
    }
    if (summary.error > 0) {
      return 'ERROR';
    }
    if (summary.unsupported > 0) {
      return 'UNSUPPORTED';
    }
    if (summary.invalid > 0) {
      return 'INVALID';
    }
    if (summary.stale > 0) {
      return 'STALE';
    }
    if (summary.total > 0 && summary.empty === summary.total) {
      return 'EMPTY';
    }
    return 'READY';
  }

  private summarize(
    bindings: DashboardWidgetBindingDataResult[],
  ): DashboardWidgetDataSummary {
    const count = (state: DashboardWidgetDataState) =>
      bindings.filter((binding) => binding.state === state).length;

    return {
      total: bindings.length,
      ready: count('READY'),
      empty: count('EMPTY'),
      stale: count('STALE'),
      invalid: count('INVALID'),
      unsupported: count('UNSUPPORTED'),
      error: count('ERROR'),
    };
  }

  private unavailableBinding(
    binding: DashboardResolvedBinding,
    state: DashboardWidgetDataState,
    reasonCode: string | null,
    message: string | null,
  ): DashboardWidgetBindingDataResult {
    return {
      ...this.bindingIdentity(binding),
      state,
      reasonCode,
      message,
      observedAt: null,
      data: null,
    };
  }

  private emptyBinding(
    binding: DashboardResolvedBinding,
  ): DashboardWidgetBindingDataResult {
    return {
      ...this.bindingIdentity(binding),
      state: 'EMPTY',
      reasonCode: EMPTY_REASON,
      message: 'No telemetry data is available',
      observedAt: null,
      data: null,
    };
  }

  private bindingIdentity(binding: DashboardResolvedBinding) {
    return {
      id: binding.id,
      alias: binding.alias,
      mode: binding.mode,
    };
  }

  private requireTelemetryTarget(binding: DashboardResolvedBinding): {
    deviceId: string;
    capabilityKey: string;
  } {
    if (!binding.device || !binding.capability) {
      throw new Error('Telemetry target metadata is unavailable');
    }

    return {
      deviceId: binding.device.id,
      capabilityKey: binding.capability.key,
    };
  }

  private extractCapabilityValue(
    payload: unknown,
    capabilityKey: string,
  ): unknown | undefined {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(record, capabilityKey)
      ? record[capabilityKey]
      : undefined;
  }

  private isStale(
    observedAt: Date,
    staleAfterSeconds: unknown,
    generatedAt: Date,
  ): boolean {
    if (
      !Number.isInteger(staleAfterSeconds) ||
      (staleAfterSeconds as number) < 1
    ) {
      return false;
    }

    return (
      generatedAt.getTime() - observedAt.getTime() >
      (staleAfterSeconds as number) * 1000
    );
  }

  private integerFrom(value: unknown, fallback: number): number {
    return Number.isInteger(value) ? (value as number) : fallback;
  }

  private stringFrom(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}
