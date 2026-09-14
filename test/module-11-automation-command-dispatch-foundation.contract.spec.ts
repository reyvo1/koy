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

describe('Module 11 automation command dispatch foundation selection contract', () => {
  const documentation = read(
    'docs/module-11-automation-command-dispatch-foundation.md',
  );
  const policy = readJson<{
    contractClasses: Record<string, string>;
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const profiles = readJson<{ profiles: Record<string, ValidationStep[]> }>(
    'tools/module-runner/profiles/validation-profiles.json',
  );
  const transitionRepository = read(
    'src/automation/automation-execution-transition.repository.ts',
  );
  const commandService = read('src/device/command.service.ts');
  const sourceCheck = read('tools/module-runner/check-sources.mjs');

  it('binds selection to the immutable remote-green Slice 11.7 closure record', () => {
    expect(documentation).toContain('035bdc5106b6ae58f9c5d84c742f419d45301d2b');
    expect(documentation).toContain('30913013664');
    expect(documentation).toContain('SELECTION_INVARIANT_SLICE118_SCHEMA=1');
    expect(documentation).toContain(
      'SELECTION_INVARIANT_SLICE118_IMPLEMENTED=false',
    );
  });

  it('binds dispatch to the existing transition and CommandService boundaries', () => {
    expect(transitionRepository).toContain('claimNextPendingAction');
    expect(transitionRepository).toContain(
      'automationActionCommandIdempotencyKey',
    );
    expect(commandService).toContain('async publish(');
    expect(documentation).toContain('`CommandService.publish`');
    expect(documentation).toContain('`automation:<executionId>:<actionId>`');
    expect(documentation).toContain('`{ [capabilityKey]: value }`');
    expect(documentation).toContain('Direct MQTT publication is forbidden');
  });

  it('keeps the selected slice inactive, retry-free, and unreachable from telemetry', () => {
    for (const marker of [
      'SELECTION_INVARIANT_SLICE118_RUNTIME_ACTIVE=false',
      'SELECTION_INVARIANT_SLICE118_TELEMETRY_COORDINATOR_ACTIVE=false',
      'SELECTION_INVARIANT_SLICE118_RETRY_ACTIVE=false',
      'SELECTION_INVARIANT_SLICE118_AUTOMATION_ENABLED=false',
      'SELECTION_INVARIANT_SLICE118_MODULE12_ACTIVATED=false',
      'SELECTION_INVARIANT_SLICE118_PRODUCTION_DEPLOYMENT_APPROVED=false',
    ]) {
      expect(documentation).toContain(marker);
    }
  });

  it('registers the stable contract and immutable selection record', () => {
    const contractPath =
      'test/module-11-automation-command-dispatch-foundation.contract.spec.ts';
    expect(policy.contractClasses[contractPath]).toBe('stable-contract');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      'docs/module-11-automation-command-dispatch-foundation.md',
    );
  });

  it('runs fail-fast policy and shared compatibility gates before broad proof', () => {
    const profile =
      profiles.profiles[
        'module-11-automation-command-dispatch-foundation-selection'
      ];
    const labels = profile.map((step) => step.label);
    const sourceIndex = labels.indexOf('Module Execution Kit source checks');
    const mobileIndex = labels.indexOf(
      'Shared mobile compatibility gate with iOS native proof deferred',
    );
    const focusedIndex = labels.indexOf(
      'Focused Slice 11.8 selection, iOS release policy, and transition-safety tests',
    );
    const integrationIndex = labels.indexOf(
      'PostgreSQL automation regression integration',
    );
    const fullJestIndex = labels.indexOf(
      'Full Jest suite once for the exact candidate',
    );

    expect(profile).toBeDefined();
    expect(sourceIndex).toBeGreaterThanOrEqual(0);
    expect(mobileIndex).toBeGreaterThan(sourceIndex);
    expect(focusedIndex).toBeGreaterThan(mobileIndex);
    expect(integrationIndex).toBeGreaterThan(focusedIndex);
    expect(fullJestIndex).toBeGreaterThan(integrationIndex);
    expect(profile[mobileIndex]).toMatchObject({
      command: 'npm',
      args: ['run', 'mobile:validate'],
    });
    expect(sourceCheck).toContain('validateAutomationCommandDispatchSelection');
  });
});
