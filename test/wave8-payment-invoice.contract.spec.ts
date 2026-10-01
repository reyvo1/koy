import { readFileSync } from 'node:fs';

/**
 * Wave 8 steps 1 and 2: make the payment adapter tell the truth, then give invoices somewhere to live.
 *
 * ## Why the adapter is the first thing in this wave
 *
 * `payment-adapter.ts` claimed "Fail-closed: tanpa server key -> SIMULATED invoice, zero network
 * calls". It was the opposite. With a server key configured, `simulated` flipped to `false`,
 * `createInvoice` skipped the network call entirely — the source said so in a comment — and returned
 * a `PENDING` invoice whose `paymentUrl` was assembled from a locally generated id. A configured
 * integration would therefore hand a customer a dead payment link and report a genuine invoice
 * awaiting payment. Building an invoice lifecycle on top of that is building on a liar.
 *
 * `verifySignature` was worse in a quieter way: it returned
 * `signatureKey.length > 0 && orderId.length > 0`. That is "the string is not empty", not
 * "the signature is valid". Its comment claimed a webhook controller performed the hash comparison;
 * no such controller exists. `src/webhook/` is the outbound webhook surface, a different thing.
 *
 * These contracts are source contracts, not mocks, because the defects were structural — a missing
 * call and a stubbed return value. Behavioural tests for the signature maths live in the adapter's
 * own spec; what is pinned here is that the maths is *wired* and that the fail-closed claim is real.
 */

const ROOT = '/home/ivo/Desktop/program/iot';
const read = (relative: string): string => readFileSync(`${ROOT}/${relative}`, 'utf8');
const exists = (relative: string): boolean => {
  try {
    readFileSync(`${ROOT}/${relative}`, 'utf8');
    return true;
  } catch {
    return false;
  }
};

const ADAPTER = read('src/billing/payment-adapter.ts');
const SCHEMA = read('prisma/schema.prisma');
const MODULE = read('src/billing/billing.module.ts');

describe('the adapter cannot claim to be real while doing nothing', () => {
  it('a configured server key must not be enough to leave simulation', () => {
    // Before: `simulated` was exactly `!serverKey`, so a configured key meant "real" while the body
    // of createInvoice still made no call.
    expect(ADAPTER).not.toMatch(/get simulated\(\):\s*boolean\s*\{\s*return\s*!this\.serverKey;\s*\}/);
  });

  it('simulation is a distinct, explicit state, not an inferred one', () => {
    expect(ADAPTER).toMatch(/simulated\s*=/);
  });

  it('createInvoice cannot return PENDING without having performed a call', () => {
    // The shape of the old defect: a `PENDING` return with no network call above it.
    const body = ADAPTER.slice(ADAPTER.indexOf('async createInvoice'));
    const end = body.indexOf('\n  }');
    const method = body.slice(0, end);
    expect(method).toMatch(/PENDING/);
    // If PENDING is reachable, a request must be in the same method.
    expect(method).toMatch(/fetch\(|request\(|snap|https:\/\//i);
  });

  it('a failed call does not degrade into a simulated invoice reported as real', () => {
    const body = ADAPTER.slice(ADAPTER.indexOf('async createInvoice'));
    const end = body.indexOf('\n  }');
    expect(body.slice(0, end)).toMatch(/throw|catch/);
  });

  it('it refuses to run unconfigured rather than inventing an id', () => {
    // `inv-${Date.now()}-${reference}` was a locally minted identifier presented as a provider's.
    // Scoped to the method body, not the file: this file's own header quotes that expression when
    // explaining the defect, so a whole-file search matches the explanation rather than the code.
    const body = ADAPTER.slice(ADAPTER.indexOf('async createInvoice'));
    expect(body.slice(0, body.indexOf('\n  }'))).not.toMatch(/inv-\$\{Date\.now\(\)\}/);
  });
});

describe('signature verification is real verification', () => {
  it('computes a digest instead of testing for emptiness', () => {
    expect(ADAPTER).toMatch(/createHash|sha512|hmac/i);
  });

  it('mixes the server key into the digest', () => {
    const method = ADAPTER.slice(ADAPTER.indexOf('verifySignature'));
    expect(method).toMatch(/this\.serverKey/);
  });

  it('compares in constant time', () => {
    // A plain `===` on a digest leaks it a byte at a time to a patient attacker.
    expect(ADAPTER).toMatch(/timingSafeEqual/);
  });

  it('cannot return true with no server key configured', () => {
    const method = ADAPTER.slice(ADAPTER.indexOf('verifySignature'));
    expect(method).not.toMatch(/if \(!this\.serverKey\) return false;[\s\S]*?return true/);
  });

  it('and it is no longer a bare emptiness test', () => {
    // Same scoping reason as above: the header quotes `signatureKey.length > 0 && orderId.length > 0`
    // verbatim, so only the method body is evidence.
    const method = ADAPTER.slice(ADAPTER.indexOf('verifySignature('));
    expect(method.slice(0, method.indexOf('\n  }'))).not.toMatch(/length > 0 &&/);
  });
});

describe('the adapter is reachable rather than decorative', () => {
  it('is provided by the billing module', () => {
    expect(MODULE).toMatch(/MidtransSandboxAdapter/);
  });

  it('is exported by the module so a consumer can inject the port', () => {
    // The module exports the token, not the class name -- that is the point. Asserting the literal
    // word `PaymentProvider` here was checking for an identifier the correct code does not use.
    const exports = MODULE.slice(MODULE.indexOf('exports:'));
    expect(exports).toMatch(/PAYMENT_PROVIDER/);
  });

  it('has an injection token for the port, not a concrete class dependency', () => {
    // Depending on the concrete adapter is what let it sit unused for a wave: nothing in the graph
    // required it. The port is the thing that should be injected.
    expect(exists('src/billing/tokens.ts')).toBe(true);
    expect(MODULE).toMatch(/provide:\s*PAYMENT_PROVIDER,\s*useExisting:/);
  });
});

describe('invoices have somewhere to live', () => {
  it('an Invoice model exists', () => {
    expect(SCHEMA).toMatch(/model Invoice \{/);
  });

  it('scoped to a tenant, because every read of it will be', () => {
    const model = SCHEMA.slice(
      SCHEMA.indexOf('model Invoice {'),
      SCHEMA.indexOf('}', SCHEMA.indexOf('model Invoice {')),
    );
    expect(model).toMatch(/tenantId/);
    expect(model).toMatch(/@@unique\(\[id, tenantId\]\)/);
  });

  it('keyed by the order id the provider assigns, so a webhook can find it', () => {
    // Without a unique external reference, a webhook has no way to locate the invoice it is
    // confirming and would have to match on something the platform minted.
    expect(SCHEMA).toMatch(/providerOrderId/);
  });

  it('amounts are integers, never floats', () => {
    // Money as a float is the defect that shows up years later in a reconciliation.
    const model = SCHEMA.slice(
      SCHEMA.indexOf('model Invoice {'),
      SCHEMA.indexOf('}', SCHEMA.indexOf('model Invoice {')),
    );
    expect(model).toMatch(/amountCents\s+Int/);
    expect(model).not.toMatch(/amount\s+Float/);
  });

  it('a metering record exists, so a period has a quantity', () => {
    expect(SCHEMA).toMatch(/model MeteringRecord \{/);
    expect(SCHEMA).toMatch(/quantity\s+Int/);
  });

  it('metering is unique per tenant, device and period', () => {
    // Without this, a re-run of a period double-counts against the tenant.
    const model = SCHEMA.slice(
      SCHEMA.indexOf('model MeteringRecord {'),
      SCHEMA.indexOf('}', SCHEMA.indexOf('model MeteringRecord {')),
    );
    expect(model).toMatch(/@@unique\(\[/);
  });

  it('and both are declared in a migration, not only in the schema', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const out = execSync("ls prisma/migrations | tail -3", { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/\d+_billing/);
  });
});
