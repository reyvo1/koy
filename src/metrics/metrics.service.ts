import { Injectable } from '@nestjs/common';
import {
  CommandMetricEvent,
  MetricLabels,
  MqttPublisherPublishOutcome,
  MqttPublisherState,
  OverallReadinessStatus,
  ReadinessStatus,
  TelemetryMetricOutcome,
} from './metrics.types';

interface CounterDefinition {
  help: string;
  values: Map<string, { labels: MetricLabels; value: number }>;
}

interface HistogramValue {
  labels: MetricLabels;
  buckets: number[];
  bucketCounts: number[];
  count: number;
  sum: number;
}

interface HistogramDefinition {
  help: string;
  values: Map<string, HistogramValue>;
}

const HTTP_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
];
const READINESS_DURATION_BUCKETS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5,
];

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, CounterDefinition>();
  private readonly histograms = new Map<string, HistogramDefinition>();

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = {
      method: method.toUpperCase(),
      route,
      status_code: String(statusCode),
    };

    this.incrementCounter(
      'iot_http_requests_total',
      'Total HTTP requests handled by the IoT Platform API.',
      labels,
    );
    this.observeHistogram(
      'iot_http_request_duration_seconds',
      'HTTP request duration in seconds.',
      labels,
      durationSeconds,
      HTTP_DURATION_BUCKETS,
    );
  }

  recordTelemetryIngestion(outcome: TelemetryMetricOutcome, value = 1): void {
    this.incrementCounter(
      'iot_telemetry_ingestion_total',
      'Total telemetry ingestion outcomes.',
      { outcome },
      value,
    );
  }

  recordTelemetryAggregation(
    outcome: 'succeeded' | 'failed',
    bucket: '15m' | '1h' | '1d',
    durationSeconds: number,
  ): void {
    const labels = { outcome, bucket };

    this.incrementCounter(
      'iot_telemetry_aggregation_queries_total',
      'Total bounded telemetry aggregation query outcomes.',
      labels,
    );
    this.observeHistogram(
      'iot_telemetry_aggregation_duration_seconds',
      'Telemetry aggregation SQL execution duration in seconds.',
      labels,
      durationSeconds,
      HTTP_DURATION_BUCKETS,
    );
  }

  /**
   * Wave 10 retention runs. Labels stay bounded: the outcome and whether the pass stopped on its
   * budget. Tenant and device are deliberately absent -- retention is per tenant, so either would
   * be an unbounded label set.
   */
  recordTelemetryRetention(
    outcome: 'succeeded' | 'failed' | 'skipped' | 'dry_run',
    durationSeconds: number,
    rowsPruned = 0,
    bucketsWritten = 0,
    stoppedEarly = false,
  ): void {
    const labels = { outcome, stopped_early: String(stoppedEarly) };

    this.incrementCounter(
      'iot_telemetry_retention_runs_total',
      'Total telemetry retention run outcomes.',
      labels,
    );
    this.incrementCounter(
      'iot_telemetry_retention_rows_pruned_total',
      'Telemetry rows pruned by retention runs.',
      labels,
      rowsPruned,
    );
    this.incrementCounter(
      'iot_telemetry_retention_rollup_buckets_total',
      'Telemetry rollup buckets written by retention runs.',
      labels,
      bucketsWritten,
    );
    this.observeHistogram(
      'iot_telemetry_retention_duration_seconds',
      'Telemetry retention run duration in seconds.',
      labels,
      durationSeconds,
      HTTP_DURATION_BUCKETS,
    );
  }

  recordCommandLifecycle(event: CommandMetricEvent, value = 1): void {
    this.incrementCounter(
      'iot_device_command_lifecycle_total',
      'Total device command lifecycle transitions and outcomes.',
      { event },
      value,
    );
  }

  recordDependencyReadiness(
    dependency: 'postgres' | 'redis' | 'mqtt',
    status: ReadinessStatus,
    durationSeconds: number,
  ): void {
    const labels = { dependency, status };

    this.incrementCounter(
      'iot_dependency_readiness_checks_total',
      'Total readiness dependency checks.',
      labels,
    );
    this.observeHistogram(
      'iot_dependency_readiness_duration_seconds',
      'Readiness dependency check duration in seconds.',
      labels,
      durationSeconds,
      READINESS_DURATION_BUCKETS,
    );
  }

  recordOverallReadiness(status: OverallReadinessStatus): void {
    this.incrementCounter(
      'iot_readiness_results_total',
      'Total overall readiness results.',
      { status },
    );
  }

  recordMqttPublisherState(state: MqttPublisherState): void {
    this.incrementCounter(
      'iot_mqtt_publisher_state_transitions_total',
      'Total MQTT publisher state transitions.',
      { state },
    );
  }

  recordMqttPublisherReconnect(): void {
    this.incrementCounter(
      'iot_mqtt_publisher_reconnects_total',
      'Total MQTT publisher reconnect attempts.',
      {},
    );
  }

  recordMqttPublisherPublish(
    outcome: MqttPublisherPublishOutcome,
    durationSeconds: number,
  ): void {
    const labels = { outcome };

    this.incrementCounter(
      'iot_mqtt_publisher_publish_total',
      'Total MQTT publisher outcomes.',
      labels,
    );
    this.observeHistogram(
      'iot_mqtt_publisher_publish_duration_seconds',
      'MQTT broker publish confirmation duration in seconds.',
      labels,
      durationSeconds,
      READINESS_DURATION_BUCKETS,
    );
  }

  /**
   * Structured snapshot of the recorded counters and histograms.
   *
   * The platform console needs to render runtime state as typed JSON rather than scrape the
   * Prometheus text, but it must not invent worker health: this returns only values that
   * were genuinely recorded, with an explicit `recorded: false` for a metric family that
   * has seen no events yet, so "no data" is never rendered as "zero" or "healthy".
   */
  snapshot(): {
    recordedAt: string;
    families: Array<{
      name: string;
      help: string;
      type: 'counter' | 'histogram';
      recorded: boolean;
      series: Array<{ labels: Record<string, string>; value: number; count?: number; sum?: number }>;
    }>;
  } {
    const families: Array<{
      name: string;
      help: string;
      type: 'counter' | 'histogram';
      recorded: boolean;
      series: Array<{ labels: Record<string, string>; value: number; count?: number; sum?: number }>;
    }> = [];

    for (const name of Array.from(this.counters.keys()).sort()) {
      const definition = this.counters.get(name)!;
      families.push({
        name,
        help: definition.help,
        type: 'counter',
        recorded: definition.values.size > 0,
        series: Array.from(definition.values.values())
          .sort((left, right) =>
            this.serializeLabels(left.labels).localeCompare(
              this.serializeLabels(right.labels),
            ),
          )
          .map((entry) => ({
            labels: entry.labels as Record<string, string>,
            value: entry.value,
          })),
      });
    }

    for (const name of Array.from(this.histograms.keys()).sort()) {
      const definition = this.histograms.get(name)!;
      families.push({
        name,
        help: definition.help,
        type: 'histogram',
        recorded: definition.values.size > 0,
        series: Array.from(definition.values.values())
          .sort((left, right) =>
            this.serializeLabels(left.labels).localeCompare(
              this.serializeLabels(right.labels),
            ),
          )
          .map((entry) => ({
            labels: entry.labels as Record<string, string>,
            value: entry.count,
            count: entry.count,
            sum: entry.sum,
          })),
      });
    }

    return { recordedAt: new Date().toISOString(), families };
  }

  renderPrometheus(): string {
    const lines: string[] = [
      '# HELP iot_platform_info Static information about the IoT Platform service.',
      '# TYPE iot_platform_info gauge',
      'iot_platform_info{service="iot-platform",version="1.0.0"} 1',
    ];

    for (const name of [...this.counters.keys()].sort()) {
      const definition = this.counters.get(name)!;
      lines.push(`# HELP ${name} ${definition.help}`);
      lines.push(`# TYPE ${name} counter`);

      for (const value of [...definition.values.values()].sort((left, right) =>
        this.serializeLabels(left.labels).localeCompare(
          this.serializeLabels(right.labels),
        ),
      )) {
        lines.push(
          `${name}${this.formatLabels(value.labels)} ${this.formatNumber(value.value)}`,
        );
      }
    }

    for (const name of [...this.histograms.keys()].sort()) {
      const definition = this.histograms.get(name)!;
      lines.push(`# HELP ${name} ${definition.help}`);
      lines.push(`# TYPE ${name} histogram`);

      for (const value of [...definition.values.values()].sort((left, right) =>
        this.serializeLabels(left.labels).localeCompare(
          this.serializeLabels(right.labels),
        ),
      )) {
        value.buckets.forEach((bucket, index) => {
          lines.push(
            `${name}_bucket${this.formatLabels({ ...value.labels, le: String(bucket) })} ${value.bucketCounts[index]}`,
          );
        });
        lines.push(
          `${name}_bucket${this.formatLabels({ ...value.labels, le: '+Inf' })} ${value.count}`,
        );
        lines.push(
          `${name}_sum${this.formatLabels(value.labels)} ${this.formatNumber(value.sum)}`,
        );
        lines.push(
          `${name}_count${this.formatLabels(value.labels)} ${value.count}`,
        );
      }
    }

    return `${lines.join('\n')}\n`;
  }

  private incrementCounter(
    name: string,
    help: string,
    labels: MetricLabels,
    value = 1,
  ): void {
    if (!Number.isFinite(value) || value < 0) {
      return;
    }

    const definition = this.counters.get(name) ?? {
      help,
      values: new Map<string, { labels: MetricLabels; value: number }>(),
    };
    const key = this.serializeLabels(labels);
    const existing = definition.values.get(key);

    definition.values.set(key, {
      labels: this.normalizeLabels(labels),
      value: (existing?.value ?? 0) + value,
    });
    this.counters.set(name, definition);
  }

  private observeHistogram(
    name: string,
    help: string,
    labels: MetricLabels,
    value: number,
    buckets: number[],
  ): void {
    if (!Number.isFinite(value) || value < 0) {
      return;
    }

    const definition = this.histograms.get(name) ?? {
      help,
      values: new Map<string, HistogramValue>(),
    };
    const key = this.serializeLabels(labels);
    const existing = definition.values.get(key) ?? {
      labels: this.normalizeLabels(labels),
      buckets: [...buckets],
      bucketCounts: buckets.map(() => 0),
      count: 0,
      sum: 0,
    };

    existing.buckets.forEach((bucket, index) => {
      if (value <= bucket) {
        existing.bucketCounts[index] += 1;
      }
    });
    existing.count += 1;
    existing.sum += value;

    definition.values.set(key, existing);
    this.histograms.set(name, definition);
  }

  private normalizeLabels(labels: MetricLabels): MetricLabels {
    return Object.keys(labels)
      .sort()
      .reduce<Record<string, string>>((result, key) => {
        result[key] = labels[key];
        return result;
      }, {});
  }

  private serializeLabels(labels: MetricLabels): string {
    return JSON.stringify(Object.entries(this.normalizeLabels(labels)));
  }

  private formatLabels(labels: MetricLabels): string {
    const entries = Object.entries(this.normalizeLabels(labels));

    if (entries.length === 0) {
      return '';
    }

    return `{${entries
      .map(([key, value]) => `${key}="${this.escapeLabel(value)}"`)
      .join(',')}}`;
  }

  private escapeLabel(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/"/g, '\\"');
  }

  private formatNumber(value: number): string {
    return Number.isInteger(value)
      ? String(value)
      : String(Number(value.toFixed(9)));
  }
}
