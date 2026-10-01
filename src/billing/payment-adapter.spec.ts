import { createHash } from 'node:crypto';

import {
  MidtransSandboxAdapter,
  PaymentProviderUnavailableError,
} from './payment-adapter';

/**
 * Behavioural tests for the payment adapter.
 *
 * The previous version of this file would have passed unchanged against the implementation that
 * fabricated a payment URL and stubbed signature verification. Its second test asserted
 * `status === 'PENDING'` and a URL containing `sandbox.midtrans.com` — which is exactly what the
 * broken version returned from a locally minted id. Its third test never called `verifySignature`
 * with a key at all; it hashed a string and checked the digest was 128 characters long.
 *
 * That is worth recording rather than quietly replacing: a test suite that pins the defect is worse
 * than no test suite, because it converts a bug into a specification.
 *
 * `fetch` is stubbed at the module boundary so these stay plain unit tests with no network. What
 * they cannot prove is that Midtrans's real sandbox answers the way this expects. That is a
 * live-sandbox question and is recorded as unproven in the Wave 8 checkpoint, not implied by a
 * green run here.
 */

const KEY = 'SB-Mid-server-test-key';
const originalFetch = global.fetch;

function stubFetch(responder: (url: string, init?: RequestInit) => Response): jest.Mock {
  const mock = jest.fn(async (url: string, init?: RequestInit) => responder(url, init));
  (global as unknown as { fetch: unknown }).fetch = mock;
  return mock as unknown as jest.Mock;
}

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  (global as unknown as { fetch: unknown }).fetch = originalFetch;
  jest.restoreAllMocks();
});

const digest = (value: string): string => createHash('sha512').update(value).digest('hex');

describe('simulation is explicit and unconfigured', () => {
  it('is simulated with no key', () => {
    expect(new MidtransSandboxAdapter().simulated).toBe(true);
  });

  it('is not simulated with a key', () => {
    expect(new MidtransSandboxAdapter({ serverKey: KEY }).simulated).toBe(false);
  });

  it('makes no network call in simulation, and reports the invoice as simulated', async () => {
    const calls = stubFetch(() => {
      throw new Error('a simulated invoice must not reach the network');
    });
    const invoice = await new MidtransSandboxAdapter().createInvoice({
      tenantId: 'tenant-1',
      amountCents: 250000,
      reference: 'ref-sim',
    });

    expect(invoice.status).toBe('SIMULATED');
    expect(invoice.paymentUrl).toBeUndefined();
    expect(invoice.providerOrderId).toBeUndefined();
    expect(calls).not.toHaveBeenCalled();
  });

  it('refuses an amount that is not a positive integer', async () => {
    const adapter = new MidtransSandboxAdapter();
    for (const amountCents of [0, -1, 12.5, Number.NaN]) {
      await expect(
        adapter.createInvoice({ tenantId: 't', amountCents, reference: 'r' }),
      ).rejects.toBeInstanceOf(PaymentProviderUnavailableError);
    }
  });
});

describe('a real invoice is built from a real response', () => {
  it('derives the payment URL from the token the provider returned', async () => {
    stubFetch(() => json({ token: 'tok-abc123', order_id: 'ref-real' }));
    const invoice = await new MidtransSandboxAdapter({ serverKey: KEY }).createInvoice({
      tenantId: 'tenant-1',
      amountCents: 250000,
      reference: 'ref-real',
    });

    expect(invoice.status).toBe('PENDING');
    expect(invoice.paymentUrl).toContain('tok-abc123');
    expect(invoice.providerOrderId).toBe('ref-real');
  });

  it('never assembles a URL when the provider returns no token', async () => {
    // The original defect: a payment URL built locally from a generated id and reported as real.
    stubFetch(() => json({ order_id: 'ref-real' }));
    await expect(
      new MidtransSandboxAdapter({ serverKey: KEY }).createInvoice({
        tenantId: 't',
        amountCents: 100,
        reference: 'ref-real',
      }),
    ).rejects.toBeInstanceOf(PaymentProviderUnavailableError);
  });

  it('raises when the provider refuses, rather than degrading to simulated', async () => {
    stubFetch(() => new Response('denied', { status: 403 }));
    await expect(
      new MidtransSandboxAdapter({ serverKey: KEY }).createInvoice({
        tenantId: 't',
        amountCents: 100,
        reference: 'ref-403',
      }),
    ).rejects.toThrow(/HTTP 403/);
  });

  it('raises when the provider is unreachable', async () => {
    stubFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    await expect(
      new MidtransSandboxAdapter({ serverKey: KEY }).createInvoice({
        tenantId: 't',
        amountCents: 100,
        reference: 'ref-down',
      }),
    ).rejects.toBeInstanceOf(PaymentProviderUnavailableError);
  });

  it('sends the key as basic auth', async () => {
    const calls = stubFetch(() => json({ token: 'tok' }));
    await new MidtransSandboxAdapter({ serverKey: KEY }).createInvoice({
      tenantId: 't',
      amountCents: 100,
      reference: 'r',
    });

    const headers = calls.mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from(`${KEY}:`).toString('base64')}`);
  });
});

describe('signature verification is the real algorithm', () => {
  const input = {
    orderId: 'order-1',
    statusCode: '200',
    grossAmount: '250000',
    signatureKey: '',
  };
  const signed = (key: string): string =>
    digest(`${input.orderId}${input.statusCode}${input.grossAmount}${key}`);

  it('accepts a correctly computed digest', () => {
    expect(
      new MidtransSandboxAdapter({ serverKey: KEY }).verifySignature({
        ...input,
        signatureKey: signed(KEY),
      }),
    ).toBe(true);
  });

  it('rejects a digest computed with the wrong key', () => {
    expect(
      new MidtransSandboxAdapter({ serverKey: KEY }).verifySignature({
        ...input,
        signatureKey: signed('attacker-key'),
      }),
    ).toBe(false);
  });

  it('rejects a digest over different content', () => {
    const other = digest(`other-order${input.statusCode}1${KEY}`);
    expect(
      new MidtransSandboxAdapter({ serverKey: KEY }).verifySignature({
        ...input,
        signatureKey: other,
      }),
    ).toBe(false);
  });

  it('rejects a truncated or over-long digest rather than throwing', () => {
    // timingSafeEqual throws on a length mismatch; the guard has to come first or a malformed
    // webhook becomes a 500 instead of a rejection.
    const valid = signed(KEY);
    const adapter = new MidtransSandboxAdapter({ serverKey: KEY });
    expect(adapter.verifySignature({ ...input, signatureKey: valid.slice(0, -1) })).toBe(false);
    expect(adapter.verifySignature({ ...input, signatureKey: `${valid}0` })).toBe(false);
    expect(adapter.verifySignature({ ...input, signatureKey: '' })).toBe(false);
  });

  it('tolerates the casing providers actually send', () => {
    expect(
      new MidtransSandboxAdapter({ serverKey: KEY }).verifySignature({
        ...input,
        signatureKey: signed(KEY).toUpperCase(),
      }),
    ).toBe(true);
  });

  it('rejects everything when no key is configured', () => {
    // The old implementation also returned false here, but it had no key to compare against and no
    // comparison at all. The distinction is what makes the asymmetry safe to rely on.
    expect(
      new MidtransSandboxAdapter().verifySignature({ ...input, signatureKey: signed(KEY) }),
    ).toBe(false);
  });

  it('does not accept a merely non-empty signature', () => {
    const adapter = new MidtransSandboxAdapter({ serverKey: KEY });
    expect(adapter.verifySignature({ ...input, signatureKey: 'x' })).toBe(false);
    expect(adapter.verifySignature({ ...input, signatureKey: 'deadbeef' })).toBe(false);
  });
});
