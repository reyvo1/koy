import { MetricsService } from './metrics.service';

describe('telemetry aggregation metrics', () => {
  it('records bounded-cardinality query outcome and duration metrics', () => {
    const service = new MetricsService();

    service.recordTelemetryAggregation('succeeded', '1h', 0.25);

    const output = service.renderPrometheus();

    expect(output).toContain(
      'iot_telemetry_aggregation_queries_total{bucket="1h",outcome="succeeded"} 1',
    );
    expect(output).toContain(
      'iot_telemetry_aggregation_duration_seconds_count{bucket="1h",outcome="succeeded"} 1',
    );
    expect(output).not.toContain('tenantId');
    expect(output).not.toContain('deviceId');
    expect(output).not.toContain('capabilityKey');
  });

  it('ignores invalid duration observations while retaining the counter', () => {
    const service = new MetricsService();

    service.recordTelemetryAggregation('failed', '15m', -1);

    const output = service.renderPrometheus();

    expect(output).toContain(
      'iot_telemetry_aggregation_queries_total{bucket="15m",outcome="failed"} 1',
    );
    expect(output).not.toContain(
      'iot_telemetry_aggregation_duration_seconds_count{bucket="15m",outcome="failed"}',
    );
  });
});
