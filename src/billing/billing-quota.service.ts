import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  async checkDeviceQuota(input: {
    tenantId: string;
    additionalDevices?: number;
  }): Promise<{
    allowed: boolean;
    quota: number | null;
    currentCount: number;
  }> {
    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { tenantId: input.tenantId },
      include: { plan: true },
    });
    if (!subscription) {
      // No subscription = no enforced quota yet.
      return { allowed: true, quota: null, currentCount: -1 };
    }

    const deviceCount = await this.prisma.device.count({
      where: { tenantId: input.tenantId },
    });
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
    };
  }

  async ensureSubscription(input: {
    tenantId: string;
    planTier: 'FREE' | 'STANDARD' | 'ENTERPRISE';
  }): Promise<void> {
    const plan = await this.prisma.billingPlan.findUnique({
      where: { tier: input.planTier },
    });
    if (!plan) {
      throw Object.assign(new Error('plan not found'), {
        code: 'BILLING_PLAN_NOT_FOUND',
      });
    }
    await this.prisma.billingSubscription.upsert({
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
