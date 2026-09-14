import { Test } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { MetricsModule } from './metrics.module';
import { MetricsService } from './metrics.service';

describe('MetricsModule', () => {
  it('resolves the metrics registry and endpoint', async () => {
    const module = await Test.createTestingModule({
      imports: [MetricsModule],
    }).compile();

    expect(module.get(MetricsService)).toBeDefined();
    expect(module.get(MetricsController)).toBeDefined();

    await module.close();
  });
});
