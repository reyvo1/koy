import { Inject, Injectable } from '@nestjs/common';

import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaymentProvider,
  PaymentProviderUnavailableError,
} from './payment-adapter';
import { PAYMENT_PROVIDER } from './tokens';

/**
 * The invoice lifecycle: OPEN → PENDING → SETTLED | FAILED, plus metering for a period.
 *
 * ## Why the row is written before the provider is called
 *
 * A provider that accepts a payment and a database that then fails to record it is the worst outcome
 * available: money moved, no record. So the invoice is inserted as `PENDING` first and the provider
 * is called second. A crash in between leaves a `PENDING` invoice no webhook has confirmed — the
 * honest state, and exactly what a reconciliation is shaped to find. The opposite ordering leaves
 * money moved with nothing at all to look for.
 *
 * ## Why the settle is conditional
 *
 * Provider webhooks are at-least-once and arrive out of order. A late duplicate must not be able to
 * overwrite a newer `FAILED` with an older `SETTLED`, so the update names the status it is replacing
 * and treats "no row changed" as already-final rather than as an error. Arrival order is not event
 * order, and only a precondition can tell the difference.
 *
 * ## Why the amount is compared
 *
 * The webhook carries a gross amount and the invoice carries one. If they disagree this does not
 * settle: a settlement of a different amount is a financial discrepancy, not a rounding note, and
 * quietly accepting it is how a tenant ends up with a ledger nobody can reconcile.
 */

export interface OpenInvoiceInput {
  tenantId: string;
  /** Minor units. Integers only. */
  amountCents: number;
  /** Stable and caller-supplied. Becomes the provider order id and the webhook's lookup key. */
  reference: string;
}

export interface SettleInvoiceInput {
  tenantId: string;
  providerOrderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
}

export type SettleOutcome =
  | { outcome: 'SETTLED'; invoiceId: string }
  | { outcome: 'ALREADY_FINAL' }
  | { outcome: 'REJECTED_UNVERIFIED' }
  | { outcome: 'REJECTED_AMOUNT_MISMATCH'; invoiced: number; notified: string };

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** True when no real payment provider is configured. Surfaced, not assumed by callers. */
  get simulated(): boolean {
    return this.provider.simulated;
  }

  async openInvoice(input: OpenInvoiceInput): Promise<{
    id: string;
    status: string;
    paymentUrl: string | null;
    simulated: boolean;
    /** True when an invoice for this reference already existed and was returned unchanged. */
    alreadyBilled: boolean;
  }> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      // Checked here as well as in the adapter. The adapter's check protects the provider call; this
      // one stops an unusable invoice row being created in the first place.
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        'amountCents harus bilangan bulat positif.',
      );
    }
    if (!input.reference) {
      throw new DomainBadRequestException(ERROR_CODES.BadRequest, 'reference wajib diisi.');
    }

    // Checked before the create, not caught after it. The reference is derived from
    // (tenant, period), so billing a period twice must return the invoice that already exists
    // rather than collide on its primary key — which is what happened before: the second attempt
    // came back as an opaque 500 from the unique violation. A retry has to be able to ask "did this
    // already bill?" and get an answer.
    const existing = await this.prisma.invoice.findFirst({
      where: { tenantId: input.tenantId, providerOrderId: input.reference },
      select: { id: true, status: true, paymentUrl: true },
    });
    if (existing) {
      if (existing.status === 'SETTLED' || existing.status === 'FAILED') {
        // A settled or failed period is a conversation for a human, not something to quietly re-bill.
        throw new DomainConflictException(
          ERROR_CODES.BillingInvoiceAlreadyFinal,
          `Invoice ${existing.id} untuk periode ini sudah ${existing.status}.`,
        );
      }
      return {
        id: existing.id,
        status: existing.status,
        paymentUrl: existing.paymentUrl,
        simulated: existing.status === 'SIMULATED',
        alreadyBilled: true,
      };
    }

    // The first write. See the class comment for why this precedes the provider call.
    const invoice = await this.prisma.invoice.create({
      data: {
        id: input.reference,
        tenantId: input.tenantId,
        providerOrderId: input.reference,
        amountCents: input.amountCents,
        status: 'PENDING',
        paymentUrl: null,
      },
    });

    try {
      const payment = await this.provider.createInvoice({
        tenantId: input.tenantId,
        amountCents: input.amountCents,
        reference: input.reference,
      });

      // The URL comes from the provider's response or it is not stored. The previous adapter
      // assembled one locally, which is how a configured deployment handed out dead payment links.
      const updated = await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: payment.status === 'SIMULATED' ? 'SIMULATED' : 'PENDING',
          paymentUrl: payment.paymentUrl ?? null,
          providerRef: payment.providerOrderId ?? null,
        },
      });

      return {
        id: updated.id,
        status: updated.status,
        paymentUrl: updated.paymentUrl,
        simulated: payment.status === 'SIMULATED',
        alreadyBilled: false,
      };
    } catch (cause) {
      // The row stays. An invoice that was attempted and failed is evidence; deleting it would erase
      // the only trace that a payment was ever requested.
      await this.prisma.invoice.updateMany({
        where: { id: invoice.id, tenantId: input.tenantId, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      throw cause instanceof PaymentProviderUnavailableError
        ? new DomainConflictException(
            ERROR_CODES.BillingPaymentUnavailable,
            `Pembayaran gagal dibuat: ${cause.message}`,
          )
        : cause;
    }
  }

  async settleFromWebhook(input: SettleInvoiceInput): Promise<SettleOutcome> {
    // Verified first. A webhook whose signature does not check out is not evidence of anything, and
    // writing before this point would let a forged notification settle an invoice.
    if (!this.provider.verifySignature({
      orderId: input.providerOrderId,
      statusCode: input.statusCode,
      grossAmount: input.grossAmount,
      signatureKey: input.signatureKey,
    })) {
      return { outcome: 'REJECTED_UNVERIFIED' };
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { tenantId: input.tenantId, providerOrderId: input.providerOrderId },
    });
    if (!invoice) {
      throw new DomainNotFoundException(
        ERROR_CODES.BillingInvoiceNotFound,
        'Invoice tidak ditemukan untuk tenant ini.',
      );
    }

    const notifiedAmount = Number.parseInt(input.grossAmount, 10);
    if (Number.isInteger(notifiedAmount) && notifiedAmount !== invoice.amountCents) {
      // Recorded as rejected, not settled, and not corrected. A discrepancy is for a human.
      return {
        outcome: 'REJECTED_AMOUNT_MISMATCH',
        invoiced: invoice.amountCents,
        notified: input.grossAmount,
      };
    }

    // The precondition is the whole point: a replayed webhook finds no PENDING row to replace and
    // reports that it is already final, rather than rewriting a newer FAILED with an older SETTLED.
    const updated = await this.prisma.invoice.updateMany({
      where: { id: invoice.id, tenantId: input.tenantId, status: 'PENDING' },
      data: { status: 'SETTLED', settledAt: new Date() },
    });

    if (updated.count === 0) {
      return { outcome: 'ALREADY_FINAL' };
    }
    return { outcome: 'SETTLED', invoiceId: invoice.id };
  }

  /**
   * Record metered usage for one device in one period.
   *
   * An upsert, not an insert: a period that is recounted must move the existing number rather than
   * append a second row, or a re-run bills the tenant twice for the same period.
   */
  async recordUsage(input: {
    tenantId: string;
    deviceId: string;
    periodStart: Date;
    quantity: number;
  }): Promise<{ quantity: number }> {
    if (!Number.isInteger(input.quantity) || input.quantity < 0) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        'quantity harus bilangan bulat non-negatif.',
      );
    }

    const row = await this.prisma.meteringRecord.upsert({
      where: {
        tenantId_deviceId_periodStart: {
          tenantId: input.tenantId,
          deviceId: input.deviceId,
          periodStart: input.periodStart,
        },
      },
      create: {
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        periodStart: input.periodStart,
        quantity: input.quantity,
      },
      update: { quantity: input.quantity },
    });
    return { quantity: row.quantity };
  }

  /** Total usage for a tenant across a period. Scoped by tenant, never across it. */
  async totalUsage(tenantId: string, periodStart: Date): Promise<number> {
    const result = await this.prisma.meteringRecord.aggregate({
      where: { tenantId, periodStart },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  /**
   * The amount to bill for a tenant's current subscription period.
   *
   * Read from the plan rather than passed in by a caller, because two call sites inventing an amount
   * will eventually disagree and only one of them will be reconciled.
   */
  async currentPeriodChargeCents(tenantId: string): Promise<number> {
    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { tenantId },
      include: { plan: { select: { monthlyPriceCents: true } } },
    });
    return subscription?.plan.monthlyPriceCents ?? 0;
  }
}
