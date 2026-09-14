import {
  MetricsController,
  PROMETHEUS_CONTENT_TYPE,
} from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  it('returns Prometheus text with the correct content type', () => {
    const metrics = new MetricsService();
    metrics.recordTelemetryIngestion('accepted');
    const controller = new MetricsController(metrics);
    const reply = {
      header: jest.fn(),
    } as any;

    const result = controller.getMetrics(reply);

    expect(reply.header).toHaveBeenCalledWith(
      'Content-Type',
      PROMETHEUS_CONTENT_TYPE,
    );
    expect(result).toContain('# TYPE iot_telemetry_ingestion_total counter');
  });
});
