import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string): string =>
  readFileSync(resolve(root, path), 'utf8');
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

type ValidationStep = {
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  requiredEnv?: string[];
};

describe('Module 11 automation retry safety foundation selection contract', () => {
  const closure = read(
    'docs/module-11-automation-telemetry-coordination-foundation-closure.md',
  );
  const selection = read(
    'docs/module-11-automation-retry-safety-foundation.md',
  );
  const dispatcher = read('src/automation/automation-command-dispatcher.ts');
  const transitions = read(
    'src/automation/automation-execution-transition.repository.ts',
  );
  const automationModule = read('src/automation/automation.module.ts');
  const sourceCheck = read('tools/module-runner/check-sources.mjs');
  const policy = readJson<{
    contractClasses: Record<string, string>;
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const profiles = readJson<{ profiles: Record<string, ValidationStep[]> }>(
    'tools/module-runner/profiles/validation-profiles.json',
  );

  it('binds Slice 11.9 closure to exact remote-green evidence', () => {
    expect(closure).toContain('7de76596c6c1d52bd725406f3fad381cc62aedaf');
    expect(closure).toContain('30983551478');
    expect(closure).toContain('8921209639');
    expect(closure).toContain(
      '8ba808d3c9d0e9ece3fbcc81c40fc298406c9b0c242d4b29a5fc69875e3ce9b9',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_SCHEMA=1',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_TELEMETRY_COORDINATION_FOUNDATION_CLOSED=true',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_COORDINATOR_IMPLEMENTED=true',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_COORDINATOR_RUNTIME_REACHABLE=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_TELEMETRY_SERVICE_WIRED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_DIRECT_MQTT_SUBSCRIBER=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_AUTOMATION_DEFAULT_ENABLED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_RETRY_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_PUBLIC_ENDPOINT_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_MODULE_12_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_PRODUCTION_DEPLOYMENT_APPROVED=false',
    );
  });

  it('selects bounded persisted retry semantics without activation', () => {
    for (const marker of [
      'SELECTION_INVARIANT_SLICE1110_SCHEMA=1',
      'SELECTION_INVARIANT_SLICE1110_IMPLEMENTED=false',
      'SELECTION_INVARIANT_SLICE1110_RETRY_ACTIVE=false',
      'SELECTION_INVARIANT_SLICE1110_AUTOMATION_ENABLED=false',
      'SELECTION_INVARIANT_SLICE1110_COORDINATOR_RUNTIME_REACHABLE=false',
      'SELECTION_INVARIANT_SLICE1110_WORKER_ACTIVE=false',
      'SELECTION_INVARIANT_SLICE1110_SCHEDULER_ACTIVE=false',
      'SELECTION_INVARIANT_SLICE1110_QUEUE_ACTIVE=false',
      'SELECTION_INVARIANT_SLICE1110_DIRECT_MQTT_PUBLISH=false',
      'SELECTION_INVARIANT_SLICE1110_IDEMPOTENCY_KEY_REUSED=true',
      'SELECTION_INVARIANT_SLICE1110_MAX_DISPATCH_ATTEMPTS=3',
      'SELECTION_INVARIANT_SLICE1110_UNKNOWN_ERRORS_RETRYABLE=false',
      'SELECTION_INVARIANT_SLICE1110_MODULE12_ACTIVATED=false',
      'SELECTION_INVARIANT_SLICE1110_PRODUCTION_DEPLOYMENT_APPROVED=false',
    ]) {
      expect(selection).toContain(marker);
    }
    expect(selection).toContain(
      'previous activation-preparation candidate is VOID',
    );
  });

  it('reuses existing idempotency and dispatch boundaries', () => {
    expect(transitions).toContain(
      'return `automation:${executionId}:${actionId}`;',
    );
    expect(dispatcher).toContain('automationActionCommandIdempotencyKey(');
    expect(dispatcher).toContain('this.commands.publish(');
    expect(selection).toContain('`automation:<executionId>:<actionId>`');
  });

  it('binds Slice 11.10 implementation to bounded persisted retry semantics', () => {
    const retryService = read(
      'src/automation/automation-retry-reservation.service.ts',
    );
    const retrySpec = read(
      'src/automation/automation-retry-reservation.service.spec.ts',
    );

    // PostgreSQL-authoritative attempt state; no runtime wiring.
    expect(retryService).toContain('dispatchAttemptCount');
    expect(retryService).toContain('retryNextEligibleAt');
    expect(retryService).toContain('clock_timestamp()');
    expect(automationModule).toContain('AutomationRetryReservationService');
    expect(automationModule).not.toContain('Scheduler');
    expect(automationModule).not.toContain('Queue');

    // Bounded policy mirrors the selected invariants.
    expect(read('src/automation/automation-execution.persistence.types.ts')).toContain(
      'maxDispatchAttempts: 3',
    );
    expect(retryService).not.toContain('publish(');
    expect(retrySpec).toContain(
      'marks the failure terminal when the attempt budget is exhausted',
    );
    expect(retrySpec).toContain(
      'never retries non-allowlisted error codes',
    );
  });

  it('registers immutable evidence and the stable contract', () => {
    const contractPath =
      'test/module-11-automation-retry-safety-foundation.contract.spec.ts';
    expect(policy.contractClasses[contractPath]).toBe('stable-contract');
    expect(policy.transitionProof.immutableEvidenceDocuments).toEqual(
      expect.arrayContaining([
        'docs/module-11-automation-telemetry-coordination-foundation-closure.md',
        'docs/module-11-automation-retry-safety-foundation.md',
      ]),
    );
  });

  it('uses the bounded Risk Profile A validation order', () => {
    const profile =
      profiles.profiles[
        'module-11-automation-telemetry-closure-retry-selection'
      ];
    expect(profile).toBeDefined();
    const labels = profile.map((step) => step.label);
    const requiredOrder = [
      'Pre-dependency Module Execution Kit self-test',
      'Module Execution Kit source checks',
      'Clean dependency bootstrap',
      'Changed TypeScript formatting check',
      'Repository non-mutating lint',
      'Current lifecycle validation',
      'Lifecycle simulation through Module 30',
      'Focused Slice 11.9 closure and Slice 11.10 retry selection contracts',
      'Checkpoint-aware lifecycle and state-sensitive contract matrix',
    ];
    let prior = -1;
    for (const label of requiredOrder) {
      const index = labels.indexOf(label);
      expect(index).toBeGreaterThan(prior);
      prior = index;
    }
    expect(labels).not.toContain(
      'Full Jest suite once for the exact candidate',
    );
    expect(
      profile.some((step) => step.args.includes('test:integration:db')),
    ).toBe(false);
    expect(sourceCheck).toContain(
      'validateAutomationTelemetryClosureRetrySelection',
    );
  });
});
