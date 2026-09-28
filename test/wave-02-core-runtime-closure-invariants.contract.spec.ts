import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string): string =>
  readFileSync(resolve(root, path), 'utf8');
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

const CLOSURE_PATH = 'docs/wave-02-core-runtime-closure.md';

/**
 * `docs/wave-02-core-runtime-closure.md` declared no machine-readable closure invariants
 * at all, so `tools/module-runner/check-sources.mjs` rejected it and
 * `module:runner:self-test` failed before reaching any runtime probe.
 *
 * The invariants bound here are deliberately false-valued. Wave 2 being closed green is
 * a claim about Wave 2's own exit criteria; it is not a claim that notification delivery,
 * automation retry, or the scheduler have ever been activated outside a test, and it is
 * not a production approval. Asserting them false here is what stops this document from
 * being read as capability it does not have.
 */
describe('Wave 2 core runtime closure invariant contract', () => {
  const closure = read(CLOSURE_PATH);
  const policy = readJson<{
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const envConfig = read('src/config/config.validation.ts');
  const schema = read('prisma/schema.prisma');

  it('registers the closure document as immutable transition evidence', () => {
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      CLOSURE_PATH,
    );
  });

  it('binds every declared Wave 2 closure invariant', () => {
    // Literal form is required: `check-sources.mjs` discovers bindings by regex on
    // exactly `expect(closure).toContain('MARKER')`, so a loop would satisfy Jest while
    // leaving the markers unbound from the runner's gate.
    expect(closure).toContain(
      'CLOSURE_INVARIANT_WAVE_2_CORE_RUNTIME_CLOSURE_SCHEMA=1',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_WAVE_2_CORE_RUNTIME_CLOSURE_CLOSED=true',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_WAVE_2_NOTIFICATION_DELIVERY_RUNTIME_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_WAVE_2_AUTOMATION_RETRY_RUNTIME_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_WAVE_2_SCHEDULER_RUNTIME_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_WAVE_2_PROVIDER_EMAIL_ADAPTERS_IMPLEMENTED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_WAVE_2_PRODUCTION_DEPLOYMENT_APPROVED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_WAVE_2_PHYSICAL_HARDWARE_PROVEN=false',
    );
  });

  it('binds exactly one schema marker and no duplicate invariants', () => {
    const markers = [
      ...closure.matchAll(/CLOSURE_INVARIANT_[A-Z0-9_]+=[A-Za-z0-9._-]+/g),
    ].map((match) => match[0]);
    expect(markers.filter((m) => m.endsWith('_SCHEMA=1'))).toHaveLength(1);
    expect(new Set(markers).size).toBe(markers.length);
  });

  it('keeps every Wave 2 runtime opt-in flag off by default in config', () => {
    // The document claims these runtimes are not activated. That is only true while the
    // config defaults stay false, so bind the claim to the config source.
    expect(envConfig).toMatch(/AUTOMATION_RUNTIME_ENABLED\s*=\s*false/);
    expect(envConfig).toMatch(/SCHEDULER_RUNTIME_ENABLED\s*=\s*false/);
    expect(envConfig).toMatch(/NOTIFICATION_RUNTIME_ENABLED\s*=\s*false/);
  });

  it('keeps the DELIVERING notification state that the migration introduced', () => {
    // Wave 2's notification runtime rests on a durable DELIVERING state plus lease
    // columns. If a later migration removed them the closure document would be claiming
    // a runtime that no longer has its state machine.
    expect(schema).toContain('DELIVERING');
    expect(schema).toContain('deliveryLeaseId');
    expect(schema).toContain('deliveryLeaseAt');
  });
});
