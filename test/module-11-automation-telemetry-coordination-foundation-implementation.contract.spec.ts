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

describe('Module 11 automation telemetry coordination implementation contract', () => {
  const documentation = read(
    'docs/module-11-automation-telemetry-coordination-foundation-implementation.md',
  );
  const coordinator = read(
    'src/automation/automation-telemetry-coordinator.ts',
  );
  const coordinatorTypes = read(
    'src/automation/automation-telemetry-coordination.types.ts',
  );
  const runtimeReads = read(
    'src/automation/automation-runtime-read.repository.ts',
  );
  const telemetryModule = read('src/telemetry/telemetry.module.ts');
  const evaluator = read('src/automation/automation-evaluator.ts');
  const evaluationTypes = read('src/automation/automation-evaluation.types.ts');
  const automationModule = read('src/automation/automation.module.ts');
  const telemetryService = read('src/telemetry/telemetry.service.ts');
  const sourceCheck = read('tools/module-runner/check-sources.mjs');
  const unitTests = read(
    'src/automation/automation-telemetry-coordinator.spec.ts',
  );
  const integration = read(
    'test/integration/automation-telemetry-coordination.integration-spec.ts',
  );
  const policy = readJson<{
    contractClasses: Record<string, string>;
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const profiles = readJson<{ profiles: Record<string, ValidationStep[]> }>(
    'tools/module-runner/profiles/validation-profiles.json',
  );

  it('binds implementation to exact remote-green selection evidence and inactive invariants', () => {
    expect(documentation).toContain('5781c65014c24fb5498b02fb611eaf885eea2c85');
    expect(documentation).toContain('30971468421');
    for (const marker of [
      'IMPLEMENTATION_INVARIANT_SLICE119_SCHEMA=1',
      'IMPLEMENTATION_INVARIANT_SLICE119_IMPLEMENTED=true',
      'IMPLEMENTATION_INVARIANT_SLICE119_COORDINATOR_ACTIVE=false',
      'IMPLEMENTATION_INVARIANT_SLICE119_AUTOMATION_DEFAULT_ENABLED=false',
      'IMPLEMENTATION_INVARIANT_SLICE119_RUNTIME_REACHABLE=false',
      'IMPLEMENTATION_INVARIANT_SLICE119_TELEMETRY_SERVICE_WIRED=false',
      'IMPLEMENTATION_INVARIANT_SLICE119_DIRECT_MQTT_SUBSCRIBER=false',
      'IMPLEMENTATION_INVARIANT_SLICE119_RETRY_ACTIVE=false',
      'IMPLEMENTATION_INVARIANT_SLICE119_MODULE12_ACTIVATED=false',
      'IMPLEMENTATION_INVARIANT_SLICE119_PRODUCTION_DEPLOYMENT_APPROVED=false',
    ]) {
      expect(documentation).toContain(marker);
    }
  });

  it('defines one exact bounded trusted telemetry envelope and deterministic processing', () => {
    expect(coordinatorTypes).toContain('maxReports: 32');
    expect(coordinatorTypes).toContain('maxCandidatesPerReport: 64');
    expect(coordinatorTypes).toContain("'EXTERNAL_ACCEPTED'");
    expect(coordinatorTypes).toContain("'AUTOMATION_DERIVED'");
    expect(coordinator).toContain('validateEnvelope(input)');
    expect(coordinator).toContain('sortReports(envelope.reports)');
    expect(coordinator).toContain(
      'automation-derived telemetry requires ancestry evidence',
    );
    expect(unitTests).toContain(
      'processes reports in deterministic capability order',
    );
    expect(unitTests).toContain(
      'isolates a candidate failure and continues with the next candidate',
    );
  });

  it('uses only trusted PostgreSQL, evaluator, reservation, and dispatcher boundaries', () => {
    expect(runtimeReads).toContain('assertAcceptedTelemetry(');
    expect(runtimeReads).toContain('findEnabledCandidatesForReport(');
    expect(runtimeReads).toContain('collectLatestValueTargets(');
    expect(runtimeReads).toContain('loadLatestValues(');
    expect(runtimeReads).toContain('jsonb_typeof(payload ->');
    expect(runtimeReads).toContain('ORDER BY "createdAt" DESC, id DESC');
    expect(coordinator).toContain('this.evaluator.evaluate(');
    expect(coordinator).toContain("'APPROVED_RUNTIME'");
    expect(coordinator).toContain('this.executions.reserveMatchedExecution({');
    expect(coordinator).toContain('this.dispatcher.dispatchExecution({');
    expect(coordinator).toContain(
      'status !== AutomationExecutionStatus.RESERVED',
    );
    expect(coordinator).toContain(
      'status !== AutomationExecutionStatus.DISPATCHING',
    );
  });

  it('preserves preview evaluation while requiring explicit enabled runtime mode', () => {
    expect(evaluationTypes).toContain("'DISABLED_DEFINITION_PREVIEW'");
    expect(evaluationTypes).toContain("'APPROVED_RUNTIME'");
    expect(evaluator).toContain('mode: AutomationEvaluationMode =');
    expect(evaluator).toContain(
      "mode === 'DISABLED_DEFINITION_PREVIEW' && candidate.enabled",
    );
    expect(evaluator).toContain(
      "mode === 'APPROVED_RUNTIME' && !candidate.enabled",
    );
  });

  it('registers the automation telemetry coordinator as a reachable runtime seam', () => {
    expect(automationModule).toContain('AutomationRuntimeReadRepository');
    expect(automationModule).toContain('AutomationTelemetryCoordinator');
    const exportsBlock = automationModule.slice(
      automationModule.indexOf('exports: ['),
      automationModule.indexOf('],', automationModule.indexOf('exports: [')),
    );
    // AutomationRuntimeReadRepository stays internal: the coordinator consumes it
    // directly, so nothing else should be able to import it.
    expect(exportsBlock).not.toContain('AutomationRuntimeReadRepository');
    // AutomationTelemetryCoordinator MUST be exported. It used not to be, and
    // TelemetryModule did not import AutomationModule either, so TelemetryService's
    // @Optional() injection silently resolved to undefined and no automation could ever
    // fire from real telemetry. That is a proven runtime failure, not a design
    // preference, and test/telemetry-automation-wiring.contract.spec.ts locks the wiring.
    expect(exportsBlock).toContain('AutomationTelemetryCoordinator');
    expect(telemetryModule).toContain(
      "import { AutomationModule } from '../automation/automation.module'",
    );
    // Slice 11.13 — the ingestion wiring is allowed but must stay gated off
    // by default and fully failure-isolated from the ingest path.
    expect(telemetryService).toContain('AUTOMATION_RUNTIME_ENABLED');
    expect(telemetryService).toContain('isAutomationRuntimeEnabled()');
    const runtimePolicy = read('src/automation/automation-runtime-policy.ts');
    expect(runtimePolicy).toContain(".toLowerCase() === 'true'");
    expect(telemetryService).toContain('@Optional()');
    expect(telemetryService).toContain(
      'coordinateAutomationsSafely',
    );
    expect(telemetryService).not.toContain('MqttService');
    expect(telemetryService).toMatch(
      /coordinateAutomationsSafely[\s\S]*catch/,
    );
    for (const forbidden of [
      'MqttService',
      '@Controller',
      'setInterval(',
      'setTimeout(',
      'RedisService',
    ]) {
      expect(coordinator).not.toContain(forbidden);
      expect(runtimeReads).not.toContain(forbidden);
    }
  });

  it('proves tenant isolation, latest values, replay, suppression, and dispatcher handoff', () => {
    for (const proof of [
      'coordinates exact tenant telemetry, latest values, dispatch, and replay',
      'uses only the latest required value and skips a non-match without reservation',
      'persists cooldown and ancestry suppression without command dispatch',
      'rejects a cross-tenant envelope before candidate lookup or execution',
    ]) {
      expect(integration).toContain(proof);
    }
  });

  it('registers immutable evidence and an optimized mandatory runtime validation profile', () => {
    const contractPath =
      'test/module-11-automation-telemetry-coordination-foundation-implementation.contract.spec.ts';
    expect(policy.contractClasses[contractPath]).toBe('stable-contract');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      'docs/module-11-automation-telemetry-coordination-foundation-implementation.md',
    );

    const profile =
      profiles.profiles[
        'module-11-automation-telemetry-coordination-foundation'
      ];
    const labels = profile.map((step) => step.label);
    const requiredOrder = [
      'Module Execution Kit source checks',
      'Structured logging contract regression gate',
      'Focused Slice 11.9 coordinator, runtime-read, evaluator, reservation, dispatch, and policy tests',
      'Shared mobile compatibility gate with iOS native proof deferred',
      'Nest application build',
      'PostgreSQL automation telemetry coordination integration',
      'Full Jest suite once for the exact candidate',
      'Checkpoint-aware lifecycle and state-sensitive contract matrix',
    ];
    let previous = -1;
    for (const label of requiredOrder) {
      const index = labels.indexOf(label);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
    expect(sourceCheck).toContain(
      'validateAutomationTelemetryCoordinationImplementation',
    );
  });
});
