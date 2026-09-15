import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('renders static platform information', () => {
    const output = service.renderPrometheus();

    expect(output).toContain('# TYPE iot_platform_info gauge');
    expect(output).toContain(
      'iot_platform_info{service="iot-platform",version="1.0.0"} 1',
    );
  });

  it('records HTTP request counters and histograms using bounded labels', () => {
    service.recordHttpRequest('get', '/devices/:id', 200, 0.012);
    service.recordHttpRequest('GET', '/devices/:id', 200, 0.03);

    const output = service.renderPrometheus();

    expect(output).toContain(
      'iot_http_requests_total{method="GET",route="/devices/:id",status_code="200"} 2',
    );
    expect(output).toContain(
      'iot_http_request_duration_seconds_bucket{le="0.01",method="GET",route="/devices/:id",status_code="200"} 0',
    );
    expect(output).toContain(
      'iot_http_request_duration_seconds_bucket{le="0.05",method="GET",route="/devices/:id",status_code="200"} 2',
    );
    expect(output).toContain(
      'iot_http_request_duration_seconds_count{method="GET",route="/devices/:id",status_code="200"} 2',
    );
  });

  it('records telemetry, command, and readiness outcomes', () => {
    service.recordTelemetryIngestion('accepted');
    service.recordTelemetryIngestion('rejected', 2);
    service.recordCommandLifecycle('sent');
    service.recordCommandLifecycle('timed_out', 3);
    service.recordCommandLifecycle('retry_replay');
    service.recordCommandLifecycle('retry_raced');
    service.recordCommandLifecycle('retry_claimed');
    service.recordDependencyReadiness('postgres', 'up', 0.004);
    service.recordOverallReadiness('not_ready');

    const output = service.renderPrometheus();

    expect(output).toContain(
      'iot_telemetry_ingestion_total{outcome="accepted"} 1',
    );
    expect(output).toContain(
      'iot_telemetry_ingestion_total{outcome="rejected"} 2',
    );
    expect(output).toContain(
      'iot_device_command_lifecycle_total{event="sent"} 1',
    );
    expect(output).toContain(
      'iot_device_command_lifecycle_total{event="timed_out"} 3',
    );
    expect(output).toContain(
      'iot_device_command_lifecycle_total{event="retry_replay"} 1',
    );
    expect(output).toContain(
      'iot_device_command_lifecycle_total{event="retry_raced"} 1',
    );
    expect(output).toContain(
      'iot_device_command_lifecycle_total{event="retry_claimed"} 1',
    );
    expect(output).toContain(
      'iot_dependency_readiness_checks_total{dependency="postgres",status="up"} 1',
    );
    expect(output).toContain(
      'iot_readiness_results_total{status="not_ready"} 1',
    );
  });

  it('escapes label values according to the Prometheus text format', () => {
    service.recordHttpRequest('GET', '/quoted/"route"\\path', 500, 0.1);

    expect(service.renderPrometheus()).toContain(
      'route="/quoted/\\"route\\"\\\\path"',
    );
  });

  it('ignores invalid negative increments and observations', () => {
    service.recordTelemetryIngestion('failed', -1);
    service.recordHttpRequest('GET', '/health', 200, -1);

    const output = service.renderPrometheus();

    expect(output).not.toContain('iot_telemetry_ingestion_total');
    expect(output).toContain(
      'iot_http_requests_total{method="GET",route="/health",status_code="200"} 1',
    );
    expect(output).not.toContain('iot_http_request_duration_seconds');
  });
});
