import { Injectable, Logger } from '@nestjs/common';
import { DeviceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type BillingDbClient = Pick<Prisma.TransactionClient, 'billingPlan' | 'billingSubscription'>;

/**
 * Why a quota check answered the way it did. `null` means there was headroom.
 *
 * `NO_SUBSCRIPTION` is its own value rather than a null quota because a null quota reads as
 * "no limit configured" in every consumer, which is exactly how a control that is switched
 * off looks identical to one that is working.
 */
export type QuotaRefusalReason = 'QUOTA_EXCEEDED' | 'NO_SUBSCRIPTION';

/**
 * Module 27 Slice 27.1 — quota enforcement foundation.
 * Checks a tenant's device count against its plan's device quota. Plans are
 * seeded (FREE=10, STANDARD=250, ENTERPRISE=10000). Payment processing is
 * explicitly out of scope; this is quota accounting only.
 */
@Injectable()
export class BillingQuotaService {
  private readonly logger = new Logger(BillingQuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Revoked devices do not consume quota.
   *
   * The product has no `DELETE /devices/:id` route — `PATCH /devices/:id/revoke` is the only
   * way to retire a device, and it exists to keep the telemetry and command history intact.
   * That makes revoke the only relief valve a tenant has. If the count included revoked
   * devices, a tenant that once exceeded its plan could never get back under it: every
   * further create answers 402 and the state is permanent.
   */
  async checkDeviceQuota(input: {
    tenantId: string;
    additionalDevices?: number;
  }): Promise<{
    allowed: boolean;
    quota: number | null;
    currentCount: number;
    reason: QuotaRefusalReason | null;
  }> {
    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { tenantId: input.tenantId },
      include: { plan: true },
    });

    const deviceCount = await this.prisma.device.count({
      where: { tenantId: input.tenantId, status: { not: DeviceStatus.REVOKED } },
    });

    if (!subscription) {
      // Fail closed, and loudly.
      //
      // This used to return `{ allowed: true, quota: null }` on the assumption that a tenant
      // without a subscription is one that has not been billed yet. Nothing ever created that
      // subscription — `ensureSubscription` had zero callers — so in a database with no
      // `billing_subscriptions` rows at all, which is what a fresh deployment looks like, every
      // tenant was unmetered while the Quotas screen showed each plan's deviceQuota as though
      // it were in force. A control that reports success without enforcing anything is worse
      // than no control, so the answer is now a refusal the caller can act on, with the reason
      // distinguishable from a genuine over-quota.
      this.logger.warn({
        event: 'billing.quota.no_subscription',
        outcome: 'denied',
        tenantId: input.tenantId,
        deviceCount,
      });
      return {
        allowed: false,
        quota: null,
        currentCount: deviceCount,
        reason: 'NO_SUBSCRIPTION',
      };
    }

    const requested = deviceCount + Math.max(input.additionalDevices ?? 0, 0);
    const allowed = requested <= subscription.plan.deviceQuota;

    if (!allowed) {
      this.logger.warn({
        event: 'billing.quota.exceeded',
        outcome: 'denied',
        tenantId: input.tenantId,
        currentCount: deviceCount,
        quota: subscription.plan.deviceQuota,
      });
    }
    return {
      allowed,
      quota: subscription.plan.deviceQuota,
      currentCount: deviceCount,
      reason: allowed ? null : 'QUOTA_EXCEEDED',
    };
  }

  async ensureSubscription(
    input: {
      tenantId: string;
      planTier: 'FREE' | 'STANDARD' | 'ENTERPRISE';
    },
    database: BillingDbClient = this.prisma,
  ): Promise<void> {
    const plan = await database.billingPlan.findUnique({
      where: { tier: input.planTier },
    });
    if (!plan) {
      throw Object.assign(new Error('plan not found'), {
        code: 'BILLING_PLAN_NOT_FOUND',
      });
    }
    await database.billingSubscription.upsert({
      where: { tenantId: input.tenantId },
      create: {
        tenantId: input.tenantId,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
      update: { planId: plan.id },
    });
  }
}
