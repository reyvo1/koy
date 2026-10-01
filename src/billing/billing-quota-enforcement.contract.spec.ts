import { DeviceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingQuotaService } from './billing-quota.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const plan = { tier: 'FREE', deviceQuota: 10 };

function prismaDouble(over: Record<string, any> = {}) {
  return {
    device: { count: jest.fn().mockResolvedValue(0) },
    billingPlan: { findUnique: jest.fn().mockResolvedValue(plan) },
    billingSubscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    ...over,
  } as unknown as PrismaService;
}

/**
 * The device quota is a control the console displays. It is only a control if it stops a
 * device that exceeds the plan's allowance.
 *
 * Two holes, both reachable in a real deployment:
 *
 *  1. **Fail-open on a missing subscription.** `checkDeviceQuota` returned
 *     `{ allowed: true, quota: null }` when no subscription row existed, and nothing ever
 *     created one — `ensureSubscription` had zero callers. A freshly created tenant was
 *     therefore unmetered forever, while the Quotas screen showed the plan's deviceQuota as
 *     though it were in force.
 *  2. **Revoked devices still consumed quota.** The count was `where: { tenantId }` with no
 *     status filter, and the product has no `DELETE /devices/:id` route. Once a tenant passed
 *     its quota the only reachable state was 402 forever, with no way to reclaim capacity.
 */
describe('BillingQuotaService — the quota is a real control', () => {
  it('refuses a device for a tenant that has no subscription', async () => {
    const svc = new BillingQuotaService(prismaDouble());

    const result = await svc.checkDeviceQuota({ tenantId, additionalDevices: 1 });

    expect(result.allowed).toBe(false);
  });

  it('makes a missing subscription distinguishable from a working quota', async () => {
    // `quota: null` on its own reads as "no limit configured" in every consumer, which is
    // how a control that is switched off looks identical to one that is working. The reason
    // is what removes the ambiguity — the quota itself stays null because there is genuinely
    // no plan to quote a number from.
    const svc = new BillingQuotaService(prismaDouble());

    const result = await svc.checkDeviceQuota({ tenantId, additionalDevices: 1 });

    expect(result).toMatchObject({ allowed: false, quota: null, reason: 'NO_SUBSCRIPTION' });
  });

  it('does not let a revoked device consume quota', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const svc = new BillingQuotaService(
      prismaDouble({
        device: { count },
        billingSubscription: {
          findUnique: jest.fn().mockResolvedValue({ plan }),
          upsert: jest.fn(),
        },
      }),
    );

    await svc.checkDeviceQuota({ tenantId, additionalDevices: 1 });

    expect(count).toHaveBeenCalledWith({
      where: { tenantId, status: { not: DeviceStatus.REVOKED } },
    });
  });

  it('still refuses when live devices are exactly at the plan limit', async () => {
    const svc = new BillingQuotaService(
      prismaDouble({
        device: { count: jest.fn().mockResolvedValue(plan.deviceQuota) },
        billingSubscription: {
          findUnique: jest.fn().mockResolvedValue({ plan }),
          upsert: jest.fn(),
        },
      }),
    );

    const result = await svc.checkDeviceQuota({ tenantId, additionalDevices: 1 });

    expect(result).toMatchObject({ allowed: false, currentCount: plan.deviceQuota, quota: 10 });
    expect(result.reason).toBe('QUOTA_EXCEEDED');
  });

  it('allows a device while there is headroom', async () => {
    const svc = new BillingQuotaService(
      prismaDouble({
        device: { count: jest.fn().mockResolvedValue(3) },
        billingSubscription: {
          findUnique: jest.fn().mockResolvedValue({ plan }),
          upsert: jest.fn(),
        },
      }),
    );

    const result = await svc.checkDeviceQuota({ tenantId, additionalDevices: 1 });

    expect(result).toMatchObject({ allowed: true, currentCount: 3, quota: 10 });
    expect(result.reason).toBeNull();
  });
});
