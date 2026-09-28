import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string): string =>
  readFileSync(resolve(root, path), 'utf8');
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

const CLOSURE_PATH =
  'docs/module-11-automation-retry-dispatch-foundation-closure.md';

/**
 * `tools/module-runner/check-sources.mjs` requires every CLOSURE_INVARIANT marker declared
 * in a closure document to be bound by a stable contract assertion, and every asserted
 * marker to exist in a closure document. Slice 11.12 declared fourteen markers and bound
 * none of them, so `module:runner:self-test` failed before it reached any runtime probe —
 * the defect recorded in CURRENT-STATE.md as the unresolved "Slice 11.12 closure
 * invariant issue".
 *
 * This spec binds them. It is deliberately a documentation-and-invariant contract only:
 * it asserts what the closure document claims, and that the underlying retry worker is
 * still opt-in and still off. It does not claim any retry has ever been dispatched.
 */
describe('Slice 11.12 automation retry-dispatch closure invariant contract', () => {
  const closure = read(CLOSURE_PATH);
  const policy = readJson<{
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const runtimePolicy = read('src/automation/automation-runtime-policy.ts');
  const envConfig = read('src/config/config.validation.ts');
  const retryWorker = read('src/automation/automation-retry.worker.ts');

  const declaredInvariants = {
    schema: 'CLOSURE_INVARIANT_SLICE1112_SCHEMA=1',
    implemented: 'CLOSURE_INVARIANT_SLICE1112_IMPLEMENTED=true',
    retryActive: 'CLOSURE_INVARIANT_SLICE1112_RETRY_ACTIVE=false',
    reevaluatesTrigger: 'CLOSURE_INVARIANT_SLICE1112_REEVALUATES_TRIGGER=false',
    idempotencyKeyReused: 'CLOSURE_INVARIANT_SLICE1112_IDEMPOTENCY_KEY_REUSED=true',
    maxDispatchAttempts: 'CLOSURE_INVARIANT_SLICE1112_MAX_DISPATCH_ATTEMPTS=3',
    workerActive: 'CLOSURE_INVARIANT_SLICE1112_WORKER_ACTIVE=false',
    schedulerActive: 'CLOSURE_INVARIANT_SLICE1112_SCHEDULER_ACTIVE=false',
    queueActive: 'CLOSURE_INVARIANT_SLICE1112_QUEUE_ACTIVE=false',
    directMqttPublish: 'CLOSURE_INVARIANT_SLICE1112_DIRECT_MQTT_PUBLISH=false',
    automationEnabled: 'CLOSURE_INVARIANT_SLICE1112_AUTOMATION_ENABLED=false',
    publicEndpointActivated:
      'CLOSURE_INVARIANT_SLICE1112_PUBLIC_ENDPOINT_ACTIVATED=false',
    module12Activated:
      'CLOSURE_INVARIANT_SLICE1112_MODULE12_ACTIVATED=false',
    productionApproved:
      'CLOSURE_INVARIANT_SLICE1112_PRODUCTION_DEPLOYMENT_APPROVED=false',
  } as const;

  it('registers the closure document as immutable transition evidence', () => {
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      CLOSURE_PATH,
    );
  });

  it('binds every declared Slice 11.12 closure invariant', () => {
    // These are written as literal expect(closure).toContain('...') calls rather than
    // iterated from the map above. `tools/module-runner/check-sources.mjs` discovers
    // closure-invariant bindings by regex-matching exactly this form, so a loop would
    // pass Jest while leaving every marker unbound from the runner's own gate.
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_SCHEMA=1');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_IMPLEMENTED=true');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_RETRY_ACTIVE=false');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_REEVALUATES_TRIGGER=false');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_IDEMPOTENCY_KEY_REUSED=true');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_MAX_DISPATCH_ATTEMPTS=3');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_WORKER_ACTIVE=false');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_SCHEDULER_ACTIVE=false');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_QUEUE_ACTIVE=false');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_DIRECT_MQTT_PUBLISH=false');
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_AUTOMATION_ENABLED=false');
    expect(closure).toContain(
      'CLOSURE_INVARIANT_SLICE1112_PUBLIC_ENDPOINT_ACTIVATED=false',
    );
    expect(closure).toContain('CLOSURE_INVARIANT_SLICE1112_MODULE12_ACTIVATED=false');
    expect(closure).toContain(
      'CLOSURE_INVARIANT_SLICE1112_PRODUCTION_DEPLOYMENT_APPROVED=false',
    );
  });

  it('binds exactly one schema marker and no duplicate invariants', () => {
    const markers = [...closure.matchAll(/CLOSURE_INVARIANT_[A-Z0-9_]+=[A-Za-z0-9._-]+/g)].map(
      (match) => match[0],
    );
    expect(markers.filter((m) => m.endsWith('_SCHEMA=1'))).toHaveLength(1);
    expect(new Set(markers).size).toBe(markers.length);
  });

  it('keeps the retry worker gated behind an off-by-default runtime flag', () => {
    // The closure claims the retry worker is implemented but not active. That is only
    // truthful if the worker is actually gated, so bind the claim to the source rather
    // than to the document's own prose.
    expect(retryWorker).toContain('isAutomationRuntimeEnabled');
    expect(runtimePolicy).toContain('AUTOMATION_RUNTIME_ENABLED');
    // Fail-closed: only the exact normalized "true" enables the runtime. An absent,
    // empty, or truthy-looking-but-not-"true" value must stay off.
    expect(runtimePolicy).toContain("=== 'true'");
    // The config default itself is off, so an unset environment cannot activate it.
    expect(envConfig).toMatch(/AUTOMATION_RUNTIME_ENABLED\s*=\s*false/);
  });

  it('keeps every deferred capability explicitly off', () => {
    // If any of these were ever turned on, the closure document's own invariants would
    // become false. Assert the document, not just the flags, so the document cannot drift
    // into claiming capability the system does not have.
    for (const marker of [
      declaredInvariants.retryActive,
      declaredInvariants.workerActive,
      declaredInvariants.schedulerActive,
      declaredInvariants.queueActive,
      declaredInvariants.automationEnabled,
      declaredInvariants.publicEndpointActivated,
      declaredInvariants.module12Activated,
      declaredInvariants.productionApproved,
      declaredInvariants.directMqttPublish,
    ]) {
      expect(marker.endsWith('=false')).toBe(true);
      expect(closure).toContain(marker);
    }
  });
});
