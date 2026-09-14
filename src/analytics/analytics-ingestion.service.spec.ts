import { AnalyticsSeverity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsIngestionService } from './analytics-ingestion.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('AnalyticsIngestionService', () => {
  let create: jest.Mock;
  let findMany: jest.Mock;
  let service: AnalyticsIngestionService;

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({ id: 'f1' });
    findMany = jest.fn().mockResolvedValue([]);
    service = new AnalyticsIngestionService({
      analyticsFinding: { create, findMany },
    } as unknown as PrismaService);
  });

  const valid = () => ({
    tenantId,
    deviceId: 'd1',
    capabilityKey: 'temperature',
    kind: 'ANOMALY' as const,
    severity: 'WARNING' as keyof typeof AnalyticsSeverity,
    summary: 'Temperature spiked above rolling mean',
    confidence: 0.82,
    detectorVersion: 'heuristic-v1',
  });

  it('persists a bounded finding', async () => {
    const result = await service.ingestFinding(valid());
    expect(result.id).toBe('f1');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ confidence: 0.82 }),
      }),
    );
  });

  it('rejects out-of-range confidence (no false accuracy claims)', async () => {
    await expect(
      service.ingestFinding({ ...valid(), confidence: 1.5 }),
    ).rejects.toMatchObject({ code: 'ANALYTICS_CONFIDENCE_INVALID' });
    await expect(
      service.ingestFinding({ ...valid(), confidence: -0.1 }),
    ).rejects.toMatchObject({ code: 'ANALYTICS_CONFIDENCE_INVALID' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects over-long summaries and bad detector versions', async () => {
    await expect(
      service.ingestFinding({ ...valid(), summary: 'x'.repeat(513) }),
    ).rejects.toMatchObject({ code: 'ANALYTICS_SUMMARY_INVALID' });
    await expect(
      service.ingestFinding({ ...valid(), detectorVersion: 'bad version!' }),
    ).rejects.toMatchObject({ code: 'ANALYTICS_DETECTOR_VERSION_INVALID' });
  });

  it('bounds recent-list queries to 100', async () => {
    await expect(service.listRecent(tenantId, 101)).rejects.toThrow(
      /limit/,
    );
    await service.listRecent(tenantId, 50);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });
});
