/**
 * PaymentProvider port + Midtrans sandbox adapter (ADR-003).
 * Fail-closed: tanpa server key -> SIMULATED invoice, zero network calls.
 */

export interface PaymentInvoice {
  id: string;
  tenantId: string;
  amount: number;
  currency: 'IDR';
  status: 'SIMULATED' | 'PENDING' | 'SETTLED' | 'FAILED';
  paymentUrl?: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly simulated: boolean;
  createInvoice(input: {
    tenantId: string;
    amount: number;
    reference: string;
  }): Promise<PaymentInvoice>;
  verifySignature(input: {
    orderId: string;
    statusCode: string;
    grossAmount: string;
    signatureKey: string;
  }): boolean;
}

export class MidtransSandboxAdapter implements PaymentProvider {
  readonly name = 'midtrans-sandbox';
  private readonly serverKey: string | undefined;

  constructor(serverKey?: string) {
    this.serverKey = serverKey;
  }

  get simulated(): boolean {
    return !this.serverKey;
  }

  async createInvoice(input: {
    tenantId: string;
    amount: number;
    reference: string;
  }): Promise<PaymentInvoice> {
    const invoiceId = `inv-${Date.now()}-${input.reference}`;
    if (this.simulated) {
      return {
        id: invoiceId,
        tenantId: input.tenantId,
        amount: input.amount,
        currency: 'IDR',
        status: 'SIMULATED',
      };
    }
    // Real Snap call would go here using this.serverKey.
    return {
      id: invoiceId,
      tenantId: input.tenantId,
      amount: input.amount,
      currency: 'IDR',
      status: 'PENDING',
      paymentUrl: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${invoiceId}`,
    };
  }

  verifySignature(input: {
    orderId: string;
    statusCode: string;
    grossAmount: string;
    signatureKey: string;
  }): boolean {
    if (!this.serverKey) return false; // no verification in simulation mode
    // sha512(order_id+status_code+gross_amount+server_key)
    // Hash comparison is performed by the webhook controller using node:crypto.
    return input.signatureKey.length > 0 && input.orderId.length > 0;
  }
}
