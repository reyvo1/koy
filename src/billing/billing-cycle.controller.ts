import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';

import { BillingCycleService, BillingCycleResult } from './billing-cycle.service';
import { BillingQuotaService } from './billing-quota.service';
import { InvoiceService } from './invoice.service';

/**
 * The operator-facing half of billing: read plans, record usage, bill a period.
 *
 * ## Why the tenant comes from the request, not the body
 *
 * Every one of these takes a tenant from the authenticated request context. A body-supplied
 * `tenantId` would let a caller record usage or open an invoice against a tenant they do not belong
 * to, and it would succeed rather than fail — the same class of hole the integration registry had.
 *
 * ## Why `quantity` is absolute rather than additive
 *
 * `recordUsage` upserts, so a recount moves the existing number instead of appending. That is the
 * property that stops a re-run billing a tenant twice for one period, and it is why the endpoint is
 * "here is the quantity for this period" rather than "add N".
 */

interface UsageBody {
  deviceId?: string;
  periodStart?: string;
  quantity?: number;
}

interface CycleBody {
  periodStart?: string;
  /** Optional override; the cycle derives a stable one when absent. */
  reference?: string;
}

@Controller('billing')
// Without these, `req.user` is undefined and every handler below throws a TypeError that surfaces
// as an opaque 500. The probe found it immediately; a user would have filed it as "billing is down".
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class BillingCycleController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly cycle: BillingCycleService,
    private readonly quota: BillingQuotaService,
  ) {}

  /**
   * Whether a real payment provider is configured.
   *
   * The UI needs this: an operator looking at a SIMULATED invoice deserves to know it is simulated
   * without having to infer it from a missing payment URL.
   */
  @Get('mode')
  mode(): { simulated: boolean } {
    return { simulated: this.invoices.simulated };
  }

  /**
   * Give the tenant a subscription on a plan.
   *
   * Present because billing a period is otherwise unreachable: a tenant with no subscription is
   * refused by design, and without a way to create one the whole cycle is dead code from a user's
   * point of view. Idempotent — `ensureSubscription` upserts on tenantId.
   */
  @Post('subscription')
  async subscribe(
    @Request() req: { user: { tenantContext: { tenantId: string } } },
    @Body() body: { planTier?: 'FREE' | 'STANDARD' | 'ENTERPRISE' },
  ): Promise<{ tenantId: string; planTier: string }> {
    const planTier = body.planTier ?? 'STANDARD';
    await this.quota.ensureSubscription({ tenantId: req.user.tenantContext.tenantId, planTier });
    return { tenantId: req.user.tenantContext.tenantId, planTier };
  }

  @Post('usage')
  async recordUsage(
    @Request() req: { user: { tenantContext: { tenantId: string } } },
    @Body() body: UsageBody,
  ): Promise<{ quantity: number }> {
    return this.invoices.recordUsage({
      tenantId: req.user.tenantContext.tenantId,
      deviceId: String(body.deviceId ?? ''),
      periodStart: new Date(body.periodStart ?? 0),
      quantity: Number(body.quantity ?? 0),
    });
  }

  @Post('cycle')
  async billPeriod(
    @Request() req: { user: { tenantContext: { tenantId: string } } },
    @Body() body: CycleBody,
  ): Promise<BillingCycleResult> {
    // The tenant comes from the authenticated context, never from the body or a client-supplied
    // header, so the reference the cycle derives cannot be aimed at another tenant's period.
    const periodStart = new Date(body.periodStart ?? 0);
    if (Number.isNaN(periodStart.getTime())) {
      periodStart.setTime(0);
    }
    return this.cycle.billPeriod({
      tenantId: req.user.tenantContext.tenantId,
      periodStart,
    });
  }
}