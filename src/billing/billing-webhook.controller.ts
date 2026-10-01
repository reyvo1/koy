import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';

import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainUnauthorizedException,
} from '../common/errors/domain-exceptions';
import { InvoiceService } from './invoice.service';

/**
 * POST /billing/webhooks/midtrans — payment notifications.
 *
 * ## Why this is a controller and not a background poller
 *
 * The provider tells us when a payment settles. Polling for it would mean discovering a paid invoice
 * late, or never, and would still need somewhere for the provider's notification to land. So this is
 * a webhook.
 *
 * ## Why it is deliberately unauthenticated by session
 *
 * The provider cannot hold an admin session. Authentication here is the signature, verified inside
 * `settleFromWebhook` before anything is written — and the route's whole job is to hand the raw
 * fields to that check rather than to trust them.
 *
 * ## The three outcomes it can return, and why each has its own answer
 *
 *  - `REJECTED_UNVERIFIED` → **401**. A signature that does not check out is not evidence of
 *    anything, and saying "ok" would hide a forgery attempt in the logs.
 *  - `REJECTED_AMOUNT_MISMATCH` → **409**. Genuine notification, but the amount disagrees with what
 *    was invoiced. That is a discrepancy for a human, and a 200 would quietly bury it.
 *  - `ALREADY_FINAL` → **200**. A provider retrying a notification it already got an answer for.
 *    Failing it would make the provider retry forever.
 *
 * Unknown status codes from the provider are accepted rather than rejected: a provider adding a new
 * terminal status must not turn into an outage on our side, and an invoice in a state we do not
 * recognise is left exactly as it was.
 */

interface MidtransNotification {
  order_id?: string;
  transaction_status?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_id?: string;
}

const SETTLED_STATUSES = new Set(['capture', 'settlement']);

@Controller('billing/webhooks')
export class BillingWebhookController {
  constructor(private readonly invoices: InvoiceService) {}

  @Post('midtrans')
  @HttpCode(200)
  async midtrans(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body() body: MidtransNotification,
  ): Promise<Record<string, unknown>> {
    if (!tenantId) {
      throw new DomainBadRequestException(ERROR_CODES.BadRequest, 'x-tenant-id wajib diisi.');
    }
    if (!body.order_id) {
      throw new DomainBadRequestException(ERROR_CODES.BadRequest, 'order_id wajib diisi.');
    }

    const outcome = await this.invoices.settleFromWebhook({
      tenantId,
      providerOrderId: body.order_id,
      // Midtrans uses these two fields, not `status_code`, in the notification body.
      statusCode: SETTLED_STATUSES.has(body.transaction_status ?? '') ? '200' : '201',
      grossAmount: body.gross_amount ?? '',
      signatureKey: body.signature_key ?? '',
    });

    switch (outcome.outcome) {
      case 'REJECTED_UNVERIFIED':
        throw new DomainUnauthorizedException(
          ERROR_CODES.BillingSignatureInvalid,
          'signature tidak valid.',
        );
      case 'REJECTED_AMOUNT_MISMATCH':
        throw new DomainConflictException(
          ERROR_CODES.BillingAmountMismatch,
          `nominal tidak cocok: ditagih ${outcome.invoiced}, dilaporkan ${outcome.notified}`,
        );
      case 'ALREADY_FINAL':
        return { outcome: outcome.outcome, orderId: body.order_id };
      case 'SETTLED':
      default:
        return { outcome: outcome.outcome, invoiceId: outcome.invoiceId };
    }
  }
}