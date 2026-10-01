import { Injectable, Logger } from '@nestjs/common';

import { ERROR_CODES } from '../common/errors/error-code';
import { DomainBadRequestException } from '../common/errors/domain-exceptions';
import { InvoiceService } from './invoice.service';

/**
 * The billing cycle: turn a tenant's metered usage and plan into one invoice.
 *
 * ## Why this is a service and not a method on InvoiceService
 *
 * It is the piece that decides *what* to bill, and it is the piece with the opinions. Keeping it
 * separate from the lifecycle means the lifecycle cannot grow an opinion about pricing, and this
 * cannot grow an opinion about signature verification.
 *
 * ## The order, and why
 *
 * Usage is totalled, the plan price is read, and only then is an invoice opened. The alternative --
 * opening an invoice and then discovering the tenant has no subscription -- would leave a PENDING
 * row for a charge nobody agreed to, and a webhook could still arrive for it and settle it.
 *
 * ## The reference is derived, not generated randomly
 *
 * A bill for a given period must produce the same reference every time it is attempted, or a retry
 * creates a second invoice for one period. It is `bill-<tenant>-<periodStart ISO date>`, which is
 * stable by construction rather than stable by luck.
 */

export interface BillingCycleResult {
  invoiceId: string;
  status: string;
  paymentUrl: string | null;
  simulated: boolean;
  usageTotal: number;
  planCents: number;
  alreadyBilled: boolean;
}

@Injectable()
export class BillingCycleService {
  private readonly logger = new Logger(BillingCycleService.name);

  constructor(private readonly invoices: InvoiceService) {}

  /** Stable for a (tenant, period) pair, so a retry cannot double-bill. */
  referenceFor(tenantId: string, periodStart: Date): string {
    return `bill-${tenantId}-${periodStart.toISOString().slice(0, 10)}`;
  }

  async billPeriod(input: { tenantId: string; periodStart: Date }): Promise<BillingCycleResult> {
    const { tenantId, periodStart } = input;

    const usageTotal = await this.invoices.totalUsage(tenantId, periodStart);
    const planCents = await this.invoices.currentPeriodChargeCents(tenantId);
    if (planCents <= 0) {
      // Raised before any invoice row exists. A tenant with no subscription has nothing to charge,
      // and an invoice for it would be a PENDING row a webhook could still settle.
      throw new DomainBadRequestException(
        ERROR_CODES.BillingPlanNotFound,
        'Tenant tidak punya subscription aktif; tidak ada yang bisa ditagih.',
      );
    }

    // Usage above the plan is a conversation for a human, not a silent multiplier. Adding a
    // overage rate here would be inventing a pricing policy the product has not decided.
    const amountCents = planCents;

    const reference = this.referenceFor(tenantId, periodStart);
    const opened = await this.invoices.openInvoice({
      tenantId,
      amountCents,
      reference,
    });

    this.logger.log({
      event: 'billing.cycle.invoiced',
      outcome: 'invoiced',
      tenantId,
      reference,
      amountCents,
      usageTotal,
      simulated: opened.simulated,
    });

    return {
      invoiceId: opened.id,
      status: opened.status,
      paymentUrl: opened.paymentUrl,
      simulated: opened.simulated,
      usageTotal,
      planCents: amountCents,
      alreadyBilled: opened.alreadyBilled,
    };
  }
}
