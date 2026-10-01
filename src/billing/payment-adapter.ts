import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * PaymentProvider port + Midtrans sandbox adapter (ADR-003).
 *
 * ## What this adapter will not do
 *
 * It does not report a payment as pending unless a payment was actually created. An earlier version
 * took a server key, flipped `simulated` to `false`, made no network call, and returned a `PENDING`
 * invoice whose `paymentUrl` was assembled from a locally minted `inv-${Date.now()}-…` id. A
 * configured deployment would therefore have handed a customer a dead link and reported a genuine
 * invoice awaiting payment. The docblock at the time said "fail-closed"; the code failed open with
 * money attached.
 *
 * So the two rules now are structural:
 *
 *  1. **No key, no real mode.** {@link MidtransSandboxAdapter.simulated} is assigned in the
 *     constructor and is true unless a key was passed. Nothing recomputes it from mutable state.
 *  2. **A call either yields a provider token, or it raises.** There is no path that returns a
 *     `PENDING` invoice built from local data. If the provider is unreachable it throws, and the
 *     caller decides — it never learns a payment was started that does not exist.
 *
 * ## Signature verification
 *
 * `verifySignature` was `signatureKey.length > 0 && orderId.length > 0` — a test for emptiness, not
 * a verification. Its comment claimed a webhook controller performed the comparison; no such
 * controller existed. It is now the real thing: SHA-512 over the documented concatenation, compared
 * with `timingSafeEqual` so a patient caller cannot recover the digest a byte at a time.
 *
 * When no key is configured it returns `false` rather than throwing. That asymmetry is deliberate:
 * an unverifiable webhook must not settle an invoice, and returning `false` lets the caller reject
 * it explicitly instead of catching an exception to mean the same thing.
 */

export interface PaymentInvoice {
  id: string;
  tenantId: string;
  amountCents: number;
  currency: 'IDR';
  status: 'SIMULATED' | 'PENDING' | 'SETTLED' | 'FAILED';
  /** Only ever set from a provider response. Never synthesised locally. */
  paymentUrl?: string;
  /** The provider's own order id. Absent on a simulated invoice because none was ever issued. */
  providerOrderId?: string;
}

export interface CreateInvoiceInput {
  tenantId: string;
  amountCents: number;
  reference: string;
}

export interface VerifySignatureInput {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly simulated: boolean;
  createInvoice(input: CreateInvoiceInput): Promise<PaymentInvoice>;
  verifySignature(input: VerifySignatureInput): boolean;
}

export class PaymentProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderUnavailableError';
  }
}

export const MIDTRANS_SANDBOX_BASE_URL = 'https://app.sandbox.midtrans.com';
export const MIDTRANS_PRODUCTION_BASE_URL = 'https://app.midtrans.com';

export class MidtransSandboxAdapter implements PaymentProvider {
  readonly name = 'midtrans-sandbox';

  /** Assigned once, in the constructor. No getter recomputes it. */
  readonly simulated: boolean;

  private readonly serverKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: {
    serverKey?: string;
    baseUrl?: string;
    timeoutMs?: number;
  } = {}) {
    this.serverKey = options.serverKey;
    this.baseUrl = options.baseUrl ?? MIDTRANS_SANDBOX_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    // Real mode requires a key. A base URL on its own is not a configuration.
    this.simulated = !options.serverKey;
  }

  async createInvoice(input: CreateInvoiceInput): Promise<PaymentInvoice> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new PaymentProviderUnavailableError(
        'amountCents must be a positive integer; refusing to bill a fractional or zero amount.',
      );
    }

    if (this.simulated) {
      // Explicitly not a provider invoice. No order id and no payment URL, because there is no
      // payment. A caller that needs a real invoice has to configure a key.
      return {
        id: `simulated-${input.reference}`,
        tenantId: input.tenantId,
        amountCents: input.amountCents,
        currency: 'IDR',
        status: 'SIMULATED',
      };
    }

    const response = await this.post('/snap/v1/transactions', {
      transaction_details: {
        order_id: input.reference,
        // IDR has no minor unit in circulation, so minor units are the major units. The conversion is
        // exact, which is why `currency` is pinned to 'IDR' rather than left open for a currency
        // with decimals.
        gross_amount: input.amountCents,
      },
    });

    const token = response.token;
    if (typeof token !== 'string' || token.length === 0) {
      // No token means no payment page exists. Fabricating a URL here is the exact defect this
      // rewrite removes.
      throw new PaymentProviderUnavailableError(
        'provider accepted the request but returned no token; no payment URL can be derived.',
      );
    }

    return {
      // The order id the caller supplied, echoed alongside the provider's own so a webhook can find
      // this invoice later.
      id: input.reference,
      providerOrderId:
        typeof response.order_id === 'string' ? response.order_id : input.reference,
      tenantId: input.tenantId,
      amountCents: input.amountCents,
      currency: 'IDR',
      status: 'PENDING',
      paymentUrl: `${this.baseUrl}/snap/v2/vtweb/${encodeURIComponent(token)}`,
    };
  }

  verifySignature(input: VerifySignatureInput): boolean {
    // No key, no verification. Returning false is how the caller learns to reject the webhook.
    if (!this.serverKey) return false;

    const expected = this.digest(
      `${input.orderId}${input.statusCode}${input.grossAmount}${this.serverKey}`,
    );
    const provided = this.normalise(input.signatureKey);

    // timingSafeEqual throws on a length mismatch, so lengths are compared first. That reveals only
    // the digest's length, which is fixed at 128 hex characters for SHA-512 regardless of input.
    if (provided.length !== expected.length) return false;

    return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
  }

  private digest(value: string): string {
    return createHash('sha512').update(value).digest('hex');
  }

  /** Midtrans sends the digest lowercased, sometimes uppercased, sometimes with stray spaces. */
  private normalise(signature: string): string {
    return signature.trim().replace(/\s+/g, '').toLowerCase();
  }

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        // The provider said no. Surfacing that as a throw is the point: the caller must not record
        // an invoice for a payment that was refused.
        throw new PaymentProviderUnavailableError(
          `provider responded HTTP ${response.status} for POST ${path}`,
        );
      }
      return (await response.json()) as Record<string, unknown>;
    } catch (cause) {
      if (cause instanceof PaymentProviderUnavailableError) throw cause;
      throw new PaymentProviderUnavailableError(
        `provider call to ${path} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}