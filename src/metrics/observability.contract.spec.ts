import { readFileSync } from 'fs';
import { join } from 'path';
import { PROMETHEUS_CONTENT_TYPE } from './metrics.controller';
import { MetricsService } from './metrics.service';

const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), 'utf8');

const extractMetricNames = (prometheus: string): string[] =>
  prometheus
    .split('\n')
    .filter((line) => line.startsWith('# TYPE '))
    .map((line) => line.split(' ')[2]);

const extractLabelKeys = (prometheus: string): string[] => {
  const keys = new Set<string>();

  for (const match of prometheus.matchAll(/\{([^}]*)\}/g)) {
    for (const label of match[1].split(',')) {
      const separator = label.indexOf('=');
      if (separator > 0) {
        keys.add(label.slice(0, separator));
      }
    }
  }

  return [...keys].sort();
};

describe('Observability contract', () => {
  const healthControllerSource = readSource('src/health/health.controller.ts');
  const healthServiceSource = readSource('src/health/health.service.ts');
  const mqttServiceSource = readSource('src/mqtt/mqtt.service.ts');
  const metricsControllerSource = readSource(
    'src/metrics/metrics.controller.ts',
  );
  const metricsInterceptorSource = readSource(
    'src/metrics/metrics.interceptor.ts',
  );
  const metricsServiceSource = readSource('src/metrics/metrics.service.ts');
  const observabilityDocumentation = readSource('docs/observability.md');

  const renderRepresentativeMetrics = (): string => {
    const metrics = new MetricsService();

    metrics.recordHttpRequest('GET', '/devices/:id', 200, 0.025);
    metrics.recordTelemetryIngestion('accepted');
    metrics.recordTelemetryIngestion('duplicate');
    metrics.recordTelemetryIngestion('rejected');
    metrics.recordTelemetryIngestion('failed');
    metrics.recordCommandLifecycle('created');
    metrics.recordCommandLifecycle('sent');
    metrics.recordCommandLifecycle('acknowledged');
    metrics.recordCommandLifecycle('timed_out');
    metrics.recordDependencyReadiness('postgres', 'up', 0.01);
    metrics.recordDependencyReadiness('redis', 'up', 0.005);
    metrics.recordDependencyReadiness('mqtt', 'down', 0.001);
    metrics.recordOverallReadiness('not_ready');

    return metrics.renderPrometheus();
  };

  it('keeps the backward-compatible and explicit health routes', () => {
    expect(healthControllerSource).toContain("@Controller('health')");
    expect(healthControllerSource).toContain('@Get()');
    expect(healthControllerSource).toContain("@Get('live')");
    expect(healthControllerSource).toContain("@Get('ready')");
  });

  it('keeps liveness independent from remote dependencies', () => {
    const livenessMethod = healthServiceSource.match(
      /checkLiveness\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(livenessMethod).toBeDefined();
    expect(livenessMethod).not.toMatch(/prisma|redis|mqtt/i);
    expect(livenessMethod).toContain("status: 'ok'");
  });

  it('keeps readiness checks concurrent and independently timed', () => {
    expect(healthServiceSource).toContain('Promise.all([');
    expect(healthServiceSource).toContain("this.checkDependency('postgres'");
    expect(healthServiceSource).toContain("this.checkDependency('redis'");
    expect(healthServiceSource).toContain("this.checkDependency('mqtt'");
    expect(healthServiceSource).toContain('this.withTimeout(check())');
  });

  it('keeps MQTT readiness truthful through the transport adapter', () => {
    const mqttAdapterSource = readSource(
      'src/mqtt/mqtt-js-publisher.adapter.ts',
    );

    expect(mqttServiceSource).toContain('getTransportReadiness()');
    expect(mqttServiceSource).toContain(
      'this.publisherTransport.getReadiness()',
    );
    expect(mqttAdapterSource).toContain('publisher_not_configured');
    expect(mqttAdapterSource).toContain('publisher_connecting');
    expect(mqttAdapterSource).toContain('publisher_disconnected');
    expect(healthServiceSource).toContain('getTransportReadiness()');
    expect(healthServiceSource).toContain(
      "status.reason ?? 'transport_unavailable'",
    );
  });

  it('exposes Prometheus text format on the metrics endpoint', () => {
    expect(metricsControllerSource).toContain("@Controller('metrics')");
    expect(metricsControllerSource).toContain('@Get()');
    expect(PROMETHEUS_CONTENT_TYPE).toBe(
      'text/plain; version=0.0.4; charset=utf-8',
    );
  });

  it('keeps all application metric names under the iot namespace', () => {
    const metricNames = extractMetricNames(renderRepresentativeMetrics());

    expect(metricNames.length).toBeGreaterThan(0);
    expect(metricNames.every((name) => name.startsWith('iot_'))).toBe(true);
  });

  it('keeps counters named with the total suffix', () => {
    const prometheus = renderRepresentativeMetrics();
    const counterNames = prometheus
      .split('\n')
      .filter((line) => line.endsWith(' counter'))
      .map((line) => line.split(' ')[2]);

    expect(counterNames.length).toBeGreaterThan(0);
    expect(counterNames.every((name) => name.endsWith('_total'))).toBe(true);
  });

  it('keeps the required operational metric families', () => {
    const metricNames = extractMetricNames(renderRepresentativeMetrics());

    expect(metricNames).toEqual(
      expect.arrayContaining([
        'iot_platform_info',
        'iot_http_requests_total',
        'iot_http_request_duration_seconds',
        'iot_telemetry_ingestion_total',
        'iot_device_command_lifecycle_total',
        'iot_dependency_readiness_checks_total',
        'iot_dependency_readiness_duration_seconds',
        'iot_readiness_results_total',
      ]),
    );
  });

  it('uses only approved low-cardinality label keys', () => {
    const labelKeys = extractLabelKeys(renderRepresentativeMetrics());
    const approvedKeys = [
      'dependency',
      'event',
      'le',
      'method',
      'outcome',
      'route',
      'service',
      'status',
      'status_code',
      'version',
    ];

    expect(labelKeys).toEqual(expect.arrayContaining(approvedKeys));
    expect(labelKeys.every((key) => approvedKeys.includes(key))).toBe(true);
  });

  it('does not expose high-cardinality identity or payload labels', () => {
    const prometheus = renderRepresentativeMetrics();
    const forbiddenLabels = [
      'tenant_id',
      'tenantId',
      'user_id',
      'userId',
      'device_id',
      'deviceId',
      'command_id',
      'commandId',
      'correlation_id',
      'correlationId',
      'event_id',
      'eventId',
      'payload',
      'topic',
      'url',
    ];

    for (const forbidden of forbiddenLabels) {
      expect(prometheus).not.toContain(`${forbidden}=`);
    }
  });

  it('uses route templates instead of raw request URLs', () => {
    expect(metricsInterceptorSource).toContain('request.routeOptions?.url');
    expect(metricsInterceptorSource).not.toContain('request.routerPath');
    expect(metricsInterceptorSource).not.toContain('request.url');
    expect(metricsInterceptorSource).not.toContain('request.raw.url');
  });

  it('does not recursively instrument the metrics scrape endpoint', () => {
    expect(metricsInterceptorSource).toContain("route === '/metrics'");
  });

  it('uses a bounded label for unmatched routes', () => {
    expect(metricsInterceptorSource).toContain("return 'unmatched'");
  });

  it('keeps metric recording APIs free of tenant and device identity parameters', () => {
    const publicMetricApi = metricsServiceSource.match(
      /recordHttpRequest[\s\S]*?renderPrometheus\(\): string/,
    )?.[0];

    expect(publicMetricApi).toBeDefined();
    expect(publicMetricApi).not.toMatch(
      /tenantId|deviceId|commandId|correlationId|eventId|payload/,
    );
  });

  it('documents the production protection requirement for metrics', () => {
    expect(observabilityDocumentation).toMatch(
      /internal monitoring network|authenticated ingress/i,
    );
    expect(observabilityDocumentation).toContain('publisher_not_configured');
  });
});
