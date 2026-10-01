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
    expect(result).toEqual({
      allowed: true,
      quota: 10,
      currentCount: 8,
      reason: null,
    });
  });

  it('denies when the additional devices would exceed quota and warns', async () => {
    const result = await service.checkDeviceQuota({ tenantId, additionalDevices: 5 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('QUOTA_EXCEEDED');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not count revoked devices, so revoke frees quota', async () => {
    await service.checkDeviceQuota({ tenantId, additionalDevices: 1 });
    // `PATCH /devices/:id/revoke` is the only way to retire a device — the product has no
    // DELETE route — so revoke is the tenant's only relief valve. Counting revoked devices
    // made an exceeded quota permanent.
    expect(deviceCount).toHaveBeenCalledWith({
      where: { tenantId, status: { not: 'REVOKED' } },
    });
  });

  it('denies when no subscription exists, and says why', async () => {
    // This test previously asserted `{ allowed: true, quota: null }` — it encoded the
    // fail-open behaviour as correct. That was a defect, proven live: with zero
    // `billing_subscriptions` rows in the database, a tenant created 13 devices past its
    // FREE quota of 10 and nothing refused it, while the Quotas screen showed the plan's
    // deviceQuota as though it were in force. The assertion is inverted deliberately.
    subFindUnique.mockResolvedValueOnce(null);

    const result = await service.checkDeviceQuota({ tenantId });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('NO_SUBSCRIPTION');
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
