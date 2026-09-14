import { PrismaService } from '../prisma/prisma.service';
import { BillingQuotaService } from './billing-quota.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('BillingQuotaService', () => {
  let subFindUnique: jest.Mock;
  let deviceCount: jest.Mock;
  let planFindUnique: jest.Mock;
  let upsert: jest.Mock;
  let warn: jest.Mock;
  let service: BillingQuotaService;

  beforeEach(() => {
    subFindUnique = jest.fn().mockResolvedValue({
      tenantId,
      status: 'ACTIVE',
      plan: { tier: 'FREE', deviceQuota: 10 },
    });
    deviceCount = jest.fn().mockResolvedValue(8);
    planFindUnique = jest.fn().mockResolvedValue({ id: 'plan-free' });
    upsert = jest.fn().mockResolvedValue({});
    service = new BillingQuotaService({
      billingSubscription: { findUnique: subFindUnique, upsert },
      billingPlan: { findUnique: planFindUnique },
      device: { count: deviceCount },
    } as unknown as PrismaService);
    // silence logger warnings
    (service as any).logger = { warn: jest.fn(), log: jest.fn() };
    warn = (service as any).logger.warn;
  });

  it('allows when usage is within quota', async () => {
    const result = await service.checkDeviceQuota({ tenantId, additionalDevices: 2 });
    expect(result).toEqual({ allowed: true, quota: 10, currentCount: 8 });
  });

  it('denies when the additional devices would exceed quota and warns', async () => {
    const result = await service.checkDeviceQuota({ tenantId, additionalDevices: 5 });
    expect(result.allowed).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('skips enforcement when no subscription exists', async () => {
    subFindUnique.mockResolvedValueOnce(null);
    const result = await service.checkDeviceQuota({ tenantId });
    expect(result).toEqual({ allowed: true, quota: null, currentCount: -1 });
  });

  it('ensures a subscription idempotently by tenant', async () => {
    await service.ensureSubscription({ tenantId, planTier: 'STANDARD' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId },
        update: expect.objectContaining({ planId: 'plan-free' }),
      }),
    );
  });
});
