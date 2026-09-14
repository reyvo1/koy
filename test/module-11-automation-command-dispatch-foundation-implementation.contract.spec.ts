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

describe('Module 11 automation command dispatch foundation implementation contract', () => {
  const selection = read(
    'docs/module-11-automation-command-dispatch-foundation.md',
  );
  const implementation = read(
    'docs/module-11-automation-command-dispatch-foundation-implementation.md',
  );
  const closure = read(
    'docs/module-11-automation-command-dispatch-foundation-closure.md',
  );
  const dispatcher = read('src/automation/automation-command-dispatcher.ts');
  const dispatcherTests = read(
    'src/automation/automation-command-dispatcher.spec.ts',
  );
  const integrationTests = read(
    'test/integration/automation-command-dispatch.integration-spec.ts',
  );
  const commandService = read('src/device/command.service.ts');
  const transitionRepository = read(
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

  it('preserves immutable selection evidence and binds the implementation checkpoint', () => {
    expect(selection).toContain(
      'SELECTION_INVARIANT_SLICE118_IMPLEMENTED=false',
    );
    for (const marker of [
      'IMPLEMENTATION_INVARIANT_SLICE118_SCHEMA=1',
      'IMPLEMENTATION_INVARIANT_SLICE118_IMPLEMENTED=true',
      'IMPLEMENTATION_INVARIANT_SLICE118_RUNTIME_ACTIVE=false',
      'IMPLEMENTATION_INVARIANT_SLICE118_DIRECT_MQTT_PUBLISH=false',
      'IMPLEMENTATION_INVARIANT_SLICE118_RETRY_ACTIVE=false',
      'IMPLEMENTATION_INVARIANT_SLICE118_TELEMETRY_COORDINATOR_ACTIVE=false',
      'IMPLEMENTATION_INVARIANT_SLICE118_PUBLIC_ENDPOINT_ACTIVE=false',
      'IMPLEMENTATION_INVARIANT_SLICE118_AUTOMATION_ENABLED=false',
      'IMPLEMENTATION_INVARIANT_SLICE118_MODULE12_ACTIVATED=false',
      'IMPLEMENTATION_INVARIANT_SLICE118_PRODUCTION_DEPLOYMENT_APPROVED=false',
    ]) {
      expect(implementation).toContain(marker);
    }
    expect(implementation).toContain(
      '9ee57b6614fa3d673180c8cf9cde8278c2144308',
    );
    expect(implementation).toContain('83875019767');
  });

  it('uses only transition and CommandService boundaries with deterministic identity', () => {
    expect(dispatcher).toContain('AutomationExecutionTransitionRepository');
    expect(dispatcher).toContain('claimNextPendingAction');
    expect(dispatcher).toContain('recordActionSucceeded');
    expect(dispatcher).toContain('recordActionFailed');
    expect(dispatcher).toContain('automationActionCommandIdempotencyKey');
    expect(dispatcher).toContain('CommandService');
    expect(dispatcher).toContain('this.commands.publish(');
    expect(dispatcher).toContain('findTenantDeviceCommandByIdempotencyKey');
    expect(commandService).toContain(
      'async findTenantDeviceCommandByIdempotencyKey(',
    );
    expect(dispatcher).not.toContain('MqttService');
    expect(dispatcher).not.toMatch(/from ['"].*mqtt/i);
  });

  it('keeps dispatch internal, bounded, retry-free, and unreachable', () => {
    expect(automationModule).toContain('AutomationCommandDispatcher');
    expect(automationModule).toContain('DeviceModule');
    expect(dispatcher).not.toContain('@Controller');
    expect(dispatcher).not.toContain('@Cron');
    expect(dispatcher).not.toContain('@Interval');
    expect(dispatcher).not.toContain('@OnEvent');
    expect(dispatcher).toContain('AUTOMATION_DOMAIN_LIMITS.maxActions');
    expect(dispatcher).toContain(
      "event: 'automation.command_dispatch.action_succeeded'",
    );
    expect(dispatcher).toContain(
      "event: 'automation.command_dispatch.action_failed'",
    );
    expect(dispatcher).toContain(
      "event: 'automation.command_dispatch.completed'",
    );
  });

  it('proves success, replay, failure recovery, ordering, and first-failure stop', () => {
    for (const proof of [
      'dispatches one action through CommandService with deterministic idempotency',
      'completes an idempotent replay without publishing a second command',
      'recovers a failed command identity after CommandService publish failure',
      'records a bounded domain rejection without inventing a command identity',
      'normalizes unexpected failures and stops after the first failed action',
      'continues in persisted order and stops on a later failure',
      'fails closed when CommandService returns a non-terminal command',
      'binds timed-out terminal commands to the failed action',
    ]) {
      expect(dispatcherTests).toContain(proof);
    }
    expect(integrationTests).toContain('binds exact command identities');
    expect(integrationTests).toContain(
      'recovers a failed command identity and stops after the first failed action',
    );
    expect(transitionRepository).toContain('CommandStatus.TIMED_OUT');
  });

  it('binds the remote-green Slice 11.8 closure to machine-readable safety invariants', () => {
    const closurePath =
      'docs/module-11-automation-command-dispatch-foundation-closure.md';
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      closurePath,
    );
    expect(closure).toContain('d831149f920e1d5497cd1bb810f57266fe67fd17');
    expect(closure).toContain('30938901883');
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_SCHEMA=1',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_COMMAND_DISPATCH_FOUNDATION_CLOSED=true',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_NORMAL_AUTOMATION_WRITE_ENABLED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_AUTOMATION_RUNTIME_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_TELEMETRY_COORDINATOR_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_COMMAND_DISPATCH_RUNTIME_REACHABLE=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_DIRECT_MQTT_PUBLISH_ENABLED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_RETRY_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_PUBLIC_ENDPOINT_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_LATER_MODULE_11_SLICE_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_MODULE_12_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_8_PRODUCTION_DEPLOYMENT_APPROVED=false',
    );

    const profile =
      profiles.profiles[
        'module-11-automation-command-dispatch-foundation-closure'
      ];
    expect(profile).toBeDefined();
    const structuredLoggingIndex = profile.findIndex((step) =>
      step.args.includes(
        'src/common/logging/structured-logging.contract.spec.ts',
      ),
    );
    const focusedIndex = profile.findIndex((step) =>
      step.label.startsWith('Focused Slice 11.8 closure'),
    );
    const mobileIndex = profile.findIndex((step) =>
      step.args.includes('mobile:validate'),
    );
    const databaseIntegrationIndex = profile.findIndex(
      (step) =>
        step.command === 'npm' &&
        step.args[0] === 'run' &&
        step.args[1] === 'test:integration:db',
    );
    const fullJestIndex = profile.findIndex(
      (step) =>
        step.command === 'npm' &&
        JSON.stringify(step.args) ===
          JSON.stringify(['test', '--', '--runInBand']),
    );
    expect(structuredLoggingIndex).toBeGreaterThanOrEqual(0);
    expect(structuredLoggingIndex).toBeLessThan(focusedIndex);
    expect(focusedIndex).toBeLessThan(mobileIndex);
    expect(mobileIndex).toBeLessThan(databaseIntegrationIndex);
    expect(databaseIntegrationIndex).toBeLessThan(fullJestIndex);
    expect(profile[databaseIntegrationIndex]?.env).toEqual({
      NODE_ENV: 'test',
      DATABASE_INTEGRATION_TESTS_ALLOWED: 'true',
    });
    expect(profile[databaseIntegrationIndex]?.requiredEnv).toEqual([
      'TEST_DATABASE_URL',
    ]);
  });

  it('registers immutable evidence and runs cheap policy proof before expensive gates', () => {
    const contractPath =
      'test/module-11-automation-command-dispatch-foundation-implementation.contract.spec.ts';
    const evidencePath =
      'docs/module-11-automation-command-dispatch-foundation-implementation.md';
    expect(policy.contractClasses[contractPath]).toBe('stable-contract');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      evidencePath,
    );

    const profile =
      profiles.profiles['module-11-automation-command-dispatch-foundation'];
    const labels = profile.map((step) => step.label);
    const sourceIndex = labels.indexOf('Module Execution Kit source checks');
    const focusedIndex = labels.indexOf(
      'Focused Slice 11.8 dispatcher, policy, logging, and transition tests',
    );
    const mobileIndex = labels.indexOf(
      'Shared mobile compatibility gate with iOS native proof deferred',
    );
    const integrationIndex = labels.indexOf(
      'PostgreSQL automation command dispatch integration',
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
      'validateAutomationCommandDispatchImplementation',
    );
  });
});
