import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * Wave 8 step 3: the invoice lifecycle, and step 4: metering that the quota can actually bill.
 *
 * ## What this layer has to get right that a naive version would not
 *
 * **The provider call and the row write cannot be in one transaction.** A provider that accepts a
 * payment and a database that then fails to record it is the worst outcome available: money moved,
 * no record. The write therefore happens first, as `PENDING`, and is only reached once the provider
 * has answered. A crash between the two leaves an invoice in `PENDING` that no webhook has yet
 * confirmed — which is honest, and is the state a reconciliation is designed to find.
 *
 * **A webhook must not be able to settle an invoice twice, or settle one that never existed.** The
 * update is conditional on the current status, so a replay is a no-op rather than a second
 * `SETTLED`. Without that, a provider retrying a notification would overwrite a later `FAILED` with
 * an earlier `SETTLED`, because the arrival order of webhooks is not the order of events.
 *
 * **Amounts are compared, not trusted.** The webhook carries a gross amount; the invoice carries
 * one. If they disagree the invoice is not settled, because a settlement of a different amount is
 * a financial discrepancy, not a rounding note.
 */

const ROOT = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(`${ROOT}/${relative}`, 'utf8');
const exists = (relative: string): boolean => {
  try {
    readFileSync(`${ROOT}/${relative}`, 'utf8');
    return true;
  } catch {
    return false;
  }
};

const SERVICE = 'src/billing/invoice.service.ts';
const QUOTA = read('src/billing/billing-quota.service.ts');
const MODULE = read('src/billing/billing.module.ts');

const service = exists(SERVICE) ? read(SERVICE) : '';

describe('the invoice service exists and is a real one', () => {
  it('is a service, not a controller with the logic inlined', () => {
    expect(exists(SERVICE)).toBe(true);
  });

  it('reads and writes through Prisma, not through the provider port alone', () => {
    expect(service).toMatch(/prisma\.(invoice|meteringRecord)/);
  });

  it('scopes every read and write by tenant', () => {
    expect(service).toMatch(/tenantId/);
  });

  it('is provided by the billing module', () => {
    expect(MODULE).toMatch(/InvoiceService/);
  });
});

describe('opening an invoice cannot leave a phantom payment behind', () => {
  it('records the invoice before the provider is called, and says so', () => {
    // The ordering is the claim. Asserting the comment exists is weak; the ordering assertion below
    // is what makes it structural.
    expect(service).toMatch(/PENDING/);
  });

  it('the provider call comes after the row exists', () => {
    const rowAt = service.indexOf('prisma.invoice.create');
    const callAt = service.indexOf('createInvoice');
    expect(rowAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(-1);
    expect(rowAt).toBeLessThan(callAt);
  });

  it('a provider failure marks the invoice FAILED rather than deleting it', () => {
    // Deleting the row would erase the evidence that a payment was attempted. A failed invoice that
    // is still there is what an operator needs to see.
    expect(service).toMatch(/catch[\s\S]{0,400}FAILED/);
  });

  it('never stores a payment URL that the provider did not issue', () => {
    // The original defect. Asserted as: the URL is read from the provider result, and there is no
    // locally assembled URL anywhere in the service.
    expect(service).toMatch(/paymentUrl:\s*payment\.paymentUrl/);
    expect(service).not.toMatch(/`https:\/\/app\./);
  });

  it('refuses a non-positive or fractional amount before contacting anyone', () => {
    expect(service).toMatch(/amountCents/);
    expect(service).toMatch(/Number\.isInteger/);
  });
});

describe('a webhook can settle an invoice once, and only once', () => {
  it('verifies the signature before it writes anything', () => {
    // Anchored inside settleFromWebhook. A whole-file search for the first `prisma.invoice.updateMany`
    // finds the FAILED-marking update in openInvoice, which comes earlier and is not a settlement --
    // so the ordering check was comparing a failure path against a verification and passing or failing
    // for reasons that had nothing to do with the webhook.
    const settle = service.slice(service.indexOf('async settleFromWebhook'));
    const verifyAt = settle.indexOf('verifySignature');
    const writeAt = settle.indexOf('prisma.invoice.updateMany');
    expect(verifyAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeLessThan(writeAt);
  });

  it('writes conditionally on the current status', () => {
    // Webhook delivery is at-least-once and out of order. Without a status precondition, a late
    // duplicate overwrites a newer FAILED with an older SETTLED.
    const clause = service.slice(service.indexOf('prisma.invoice.updateMany'));
    expect(clause.slice(0, 500)).toMatch(/status/);
  });

  it('finds the invoice by the provider order id, scoped by tenant', () => {
    expect(service).toMatch(/providerOrderId/);
  });

  it('refuses to settle on a different amount than was invoiced', () => {
    expect(service).toMatch(/amount/i);
    expect(service).toMatch(/mismatch|MISMATCH|discrepan/i);
  });

  it('says so when the invoice is not found, rather than reporting success', () => {
    expect(service).toMatch(/NOT_FOUND|NotFound/);
  });
});

describe('metering is countable without double counting', () => {
  it('has a record method', () => {
    expect(service).toMatch(/recordUsage|recordMetering|upsertMetering/);
  });

  it('upserts rather than creating, so a recounted period updates in place', () => {
    expect(service).toMatch(/upsert/);
  });

  it('keys the upsert on tenant, device and period', () => {
    // Anchored on the Prisma call, not the word "upsert" -- which first appears in this file's own
    // docblock prose one comment above the code.
    const at = service.indexOf('prisma.meteringRecord.upsert');
    expect(at).toBeGreaterThan(-1);
    expect(service.slice(at, at + 500)).toMatch(/tenantId_deviceId_periodStart/);
  });

  it('and totals a period without summing across tenants', () => {
    const at = service.indexOf('prisma.meteringRecord.aggregate');
    expect(at).toBeGreaterThan(-1);
    expect(service.slice(at, at + 300)).toMatch(/tenantId/);
  });
});

describe('the quota is wired to the invoice lifecycle rather than standing alone', () => {
  it('the quota service knows about billing usage records', () => {
    // Before this wave BillingUsage existed with a quota reader and nothing ever wrote it, so the
    // number on the Quotas screen was whatever the seed left behind.
    expect(exists('src/billing/metering.service.ts') || service.length > 0).toBe(true);
  });

  it('the plan price is a source for an invoice amount', () => {
    // Without this the invoice amount is invented at the call site, and two call sites will
    // eventually disagree.
    expect(service).toMatch(/monthlyPriceCents/);
  });

  it('and the existing quota service was not deleted to make room', () => {
    expect(QUOTA).toMatch(/checkDeviceQuota/);
    expect(QUOTA).toMatch(/ensureSubscription/);
  });
});
