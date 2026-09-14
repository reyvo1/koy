import { AccessibleAnalyticsService } from './accessible-analytics.service';

describe('AccessibleAnalyticsService', () => {
  it('filters findings through owner/share-visible device ids before querying analytics', async () => {
    const prisma: any = {
      analyticsFinding: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', deviceId: 'd1', capabilityKey: 'temp', kind: 'ANOMALY', severity: 'WARNING', summary: 'hot', confidence: 0.9, detectorVersion: 'v1', createdAt: new Date() },
        ]),
      },
    };
    const devices: any = {
      findAll: jest.fn().mockResolvedValue([{ id: 'd1', name: 'Sensor 1' }]),
    };
    const service = new AccessibleAnalyticsService(prisma, devices);
    const result = await service.listAlerts({ tenantId: 't1', membershipId: 'm1', userId: 'u1', role: 'MEMBER' }, 50);

    expect(prisma.analyticsFinding.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 't1', deviceId: { in: ['d1'] } }),
    }));
    expect(result.notificationDeliveryHistory).toBe(false);
    expect(result.items[0].deviceName).toBe('Sensor 1');
  });
});
