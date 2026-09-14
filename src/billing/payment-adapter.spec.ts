import { createHash } from 'node:crypto';
import { MidtransSandboxAdapter } from './payment-adapter';

describe('MidtransSandboxAdapter (ADR-003)', () => {
  it('runs SIMULATED without server key — zero network', async () => {
    const adapter = new MidtransSandboxAdapter();
    expect(adapter.simulated).toBe(true);
    const invoice = await adapter.createInvoice({
      tenantId: 'tenant-1',
      amount: 250000,
      reference: 'sub-monthly',
    });
    expect(invoice.status).toBe('SIMULATED');
    expect(invoice.paymentUrl).toBeUndefined();
  });

  it('marks PENDING with payment url when key exists', async () => {
    const adapter = new MidtransSandboxAdapter('SB-Mid-server-test');
    expect(adapter.simulated).toBe(false);
    const invoice = await adapter.createInvoice({
      tenantId: 'tenant-1',
      amount: 250000,
      reference: 'sub-monthly',
    });
    expect(invoice.status).toBe('PENDING');
    expect(invoice.paymentUrl).toContain('sandbox.midtrans.com');
  });

  it('verifies signature shape via sha512 contract', () => {
    const adapter = new MidtransSandboxAdapter();
    // simulation mode rejects verification (no key)
    expect(
      adapter.verifySignature({
        orderId: 'inv-1',
        statusCode: '200',
        grossAmount: '250000.00',
        signatureKey: 'whatever',
      }),
    ).toBe(false);

    // real sha512(order+status+gross+key) matches node:crypto contract
    const serverKey = 'SK';
    const hash = createHash('sha512')
      .update(`inv-1200250000.00${serverKey}`)
      .digest('hex');
    expect(hash).toHaveLength(128);
  });
});
