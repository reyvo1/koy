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

describe('Module 11 automation telemetry coordination foundation selection contract', () => {
  const documentation = read(
    'docs/module-11-automation-telemetry-coordination-foundation.md',
  );
  const policy = readJson<{
    contractClasses: Record<string, string>;
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const profiles = readJson<{ profiles: Record<string, ValidationStep[]> }>(
    'tools/module-runner/profiles/validation-profiles.json',
  );
  const telemetryService = read('src/telemetry/telemetry.service.ts');
  const evaluator = read('src/automation/automation-evaluator.ts');
  const executionRepository = read(
    'src/automation/automation-execution.repository.ts',
  );
  const dispatcher = read('src/automation/automation-command-dispatcher.ts');
  const sourceCheck = read('tools/module-runner/check-sources.mjs');

  it('binds selection to the immutable remote-green Slice 11.8 closure record', () => {
    expect(documentation).toContain('89c75d62c25290b20c635490d9e5faf617d429ac');
    expect(documentation).toContain('30968372456');
    expect(documentation).toContain('SELECTION_INVARIANT_SLICE119_SCHEMA=1');
    expect(documentation).toContain(
      'SELECTION_INVARIANT_SLICE119_IMPLEMENTED=false',
    );
  });

  it('binds future coordination to existing trusted service boundaries', () => {
    expect(telemetryService).toContain('async ingest(');
    expect(evaluator).toContain('evaluate(input: unknown)');
    expect(executionRepository).toContain('async reserveMatchedExecution(');
    expect(dispatcher).toContain('async dispatchExecution(');
    expect(documentation).toContain('`TelemetryService.ingest`');
    expect(documentation).toContain('`AutomationEvaluator.evaluate`');
    expect(documentation).toContain(
      '`AutomationExecutionRepository.reserveMatchedExecution`',
    );
    expect(documentation).toContain(
      '`AutomationCommandDispatcher.dispatchExecution`',
    );
  });

  it('keeps coordination inactive and all later authority separately gated', () => {
    for (const marker of [
      'SELECTION_INVARIANT_SLICE119_COORDINATOR_ACTIVE=false',
      'SELECTION_INVARIANT_SLICE119_AUTOMATION_ENABLED=false',
      'SELECTION_INVARIANT_SLICE119_DISPATCH_RUNTIME_REACHABLE=false',
      'SELECTION_INVARIANT_SLICE119_RETRY_ACTIVE=false',
      'SELECTION_INVARIANT_SLICE119_DIRECT_MQTT_SUBSCRIBER=false',
      'SELECTION_INVARIANT_SLICE119_PUBLIC_ENDPOINT_ACTIVE=false',
      'SELECTION_INVARIANT_SLICE119_MODULE12_ACTIVATED=false',
      'SELECTION_INVARIANT_SLICE119_PRODUCTION_DEPLOYMENT_APPROVED=false',
    ]) {
      expect(documentation).toContain(marker);
    }
  });

  it('registers the stable contract and immutable selection record', () => {
    const contractPath =
      'test/module-11-automation-telemetry-coordination-foundation.contract.spec.ts';
    expect(policy.contractClasses[contractPath]).toBe('stable-contract');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      'docs/module-11-automation-telemetry-coordination-foundation.md',
    );
  });

  it('orders cheap, focused, shared-mobile, database, and broad proof gates', () => {
    const profile =
      profiles.profiles[
        'module-11-automation-telemetry-coordination-foundation-selection'
      ];
    const labels = profile.map((step) => step.label);
    const sourceIndex = labels.indexOf('Module Execution Kit source checks');
    const focusedIndex = labels.indexOf(
      'Focused Slice 11.9 selection, telemetry, automation, policy, and transition-safety tests',
    );
    const mobileIndex = labels.indexOf(
      'Shared mobile compatibility gate with iOS native proof deferred',
    );
    const integrationIndex = labels.indexOf(
      'PostgreSQL telemetry and automation regression integration',
    );
    const fullJestIndex = labels.indexOf(
      'Full Jest suite once for the exact candidate',
    );

    expect(profile).toBeDefined();
    expect(sourceIndex).toBeGreaterThanOrEqual(0);
    expect(focusedIndex).toBeGreaterThan(sourceIndex);
    expect(mobileIndex).toBeGreaterThan(focusedIndex);
    expect(integrationIndex).toBeGreaterThan(mobileIndex);
    expect(fullJestIndex).toBeGreaterThan(integrationIndex);
    expect(sourceCheck).toContain(
      'validateAutomationTelemetryCoordinationSelection',
    );
  });
});
