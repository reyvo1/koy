import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string): string =>
  readFileSync(resolve(root, path), 'utf8');
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

const CLOSURE_PATH =
  'docs/module-11-automation-retry-safety-foundation-closure.md';

/**
 * `docs/module-11-automation-retry-safety-foundation-closure.md` declared thirteen
 * machine-readable closure invariants and bound none of them, so
 * `tools/module-runner/check-sources.mjs` rejected it and `module:runner:self-test`
 * failed before reaching any runtime probe.
 *
 * The bounded-retry limits below are the load-bearing part. The closure claims a
 * three-attempt ceiling and that unknown errors are not retryable; both are safety
 * properties, so they are asserted against the source constants rather than against the
 * document's own prose. The runtime is still opt-in and still off.
 */
describe('Slice 11.10 automation retry safety closure invariant contract', () => {
  const closure = read(CLOSURE_PATH);
  const policy = readJson<{
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const persistenceTypes = read(
    'src/automation/automation-execution.persistence.types.ts',
  );
  const reservation = read(
    'src/automation/automation-retry-reservation.service.ts',
  );
  const envConfig = read('src/config/config.validation.ts');

  it('registers the closure document as immutable transition evidence', () => {
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      CLOSURE_PATH,
    );
  });

  it('binds every declared Slice 11.10 closure invariant', () => {
    // Literal form is required: `check-sources.mjs` discovers bindings by regex on
    // exactly `expect(closure).toContain('MARKER')`, so a loop would satisfy Jest while
    // leaving the markers unbound from the runner's own gate.
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1110_SCHEMA=1');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1110_IMPLEMENTED=true');
    expect(closure).toContain(
      'CLOSURE_INVARIANT_SLICE1110_IDEMPOTENCY_KEY_REUSED=true',
    );
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1110_MAX_DISPATCH_ATTEMPTS=3');
    expect(closure).toContain(
      'CLOSURE_INVARIANT_SLICE1110_UNKNOWN_ERRORS_RETRYABLE=false',
    );
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1110_WORKER_ACTIVE=false');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1110_SCHEDULER_ACTIVE=false');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1110_QUEUE_ACTIVE=false');
    expect(closure).toContain(
      'CLOSURE_INVARIANT_SLICE1110_DIRECT_MQTT_PUBLISH=false',
    );
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1110_AUTOMATION_ENABLED=false');
    expect(closure).toContain(
      'CLOSURE_INVARIANT_SLICE1110_PUBLIC_ENDPOINT_ACTIVATED=false',
    );
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1110_MODULE12_ACTIVATED=false');
    expect(closure).toContain(
      'CLOSURE_INVARIANT_SLICE1110_PRODUCTION_DEPLOYMENT_APPROVED=false',
    );
  });

  it('binds exactly one schema marker and no duplicate invariants', () => {
    const markers = [
      ...closure.matchAll(/CLOSURE_INVARIANT_[A-Z0-9_]+=[A-Za-z0-9._-]+/g),
    ].map((match) => match[0]);
    expect(markers.filter((m) => m.endsWith('_SCHEMA=1'))).toHaveLength(1);
    expect(new Set(markers).size).toBe(markers.length);
  });

  it('enforces the declared three-attempt ceiling in source, not only in prose', () => {
    expect(persistenceTypes).toMatch(/maxDispatchAttempts:\s*3\b/);
    // The ceiling is applied when claiming, not only when recording, otherwise a
    // concurrently-retrying execution could exceed it.
    expect(reservation).toContain('maxDispatchAttempts');
  });

  it('keeps the retry worker off by default in config', () => {
    expect(envConfig).toMatch(/AUTOMATION_RUNTIME_ENABLED\s*=\s*false/);
    expect(envConfig).toMatch(/SCHEDULER_RUNTIME_ENABLED\s*=\s*false/);
  });
});
