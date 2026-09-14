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

describe('Module 11 automation action-state transition foundation contract', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read(
    'prisma/migrations/20260804010000_module_11_automation_action_state_transition_foundation/migration.sql',
  );
  const repository = read(
    'src/automation/automation-execution-transition.repository.ts',
  );
  const repositorySpec = read(
    'src/automation/automation-execution-transition.repository.spec.ts',
  );
  const integration = read(
    'test/integration/automation-action-state-transition.integration-spec.ts',
  );
  const reservationRepository = read(
    'src/automation/automation-execution.repository.ts',
  );
  const documentation = read(
    'docs/module-11-automation-action-state-transition-foundation.md',
  );
  const closure = read(
    'docs/module-11-automation-action-state-transition-foundation-closure.md',
  );
  const policy = readJson<{
    contractClasses: Record<string, string>;
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const profiles = readJson<{ profiles: Record<string, ValidationStep[]> }>(
    'tools/module-runner/profiles/validation-profiles.json',
  );

  it('adds additive PostgreSQL-authored transition timestamps and state-shape constraints', () => {
    expect(schema).toContain('dispatchStartedAt');
    expect(schema).toContain('completedAt');
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
    expect(migration).toContain('automation_executions_transition_shape_check');
    expect(migration).toContain(
      'automation_execution_actions_transition_shape_check',
    );
    expect(migration).toContain("'SUPPRESSED_COOLDOWN'");
    expect(migration).toContain("'PARTIALLY_FAILED'");
  });

  it('serializes claims and preserves persisted position order', () => {
    expect(repository).toContain('pg_advisory_xact_lock');
    expect(repository).toContain('clock_timestamp()');
    expect(repository).toContain('claimNextPendingAction');
    expect(repository).toContain('action.position < next.position');
    expect(repository).toContain('AutomationExecutionActionStatus.SUCCEEDED');
    expect(repositorySpec).toContain(
      'replays the currently dispatching action instead of advancing concurrently',
    );
    expect(integration).toContain('Promise.all');
    expect(integration).toContain("'APPLIED'");
    expect(integration).toContain("'REPLAYED'");
  });

  it('uses deterministic command identity without creating or publishing commands', () => {
    expect(repository).toContain('automationActionCommandIdempotencyKey');
    expect(repository).toContain('`automation:${executionId}:${actionId}`');
    expect(repository).toContain('transaction.deviceCommand.findFirst');
    expect(repository).not.toContain('CommandService');
    expect(repository).not.toContain('mqttService');
    expect(documentation).toContain(
      'This slice does not create or publish commands',
    );
    expect(documentation).toContain(
      'Future dispatch must call the existing `CommandService`',
    );
  });

  it('uses literal structured event names compatible with the repository logging contract', () => {
    for (const eventName of [
      'automation.execution.action.claimed',
      'automation.execution.action.succeeded',
      'automation.execution.action.failed',
    ]) {
      expect(repository).toContain(`event: '${eventName}'`);
    }
    expect(repository).not.toMatch(/this\.logger\.log\(\{\s*event,/);
    expect(documentation).toContain(
      'ACTION_TRANSITION_STRUCTURED_LOG_LITERAL_EVENTS=true',
    );
  });

  it('finalizes success and first-failure semantics without retry', () => {
    expect(repository).toContain('recordActionSucceeded');
    expect(repository).toContain('recordActionFailed');
    expect(repository).toContain('PRIOR_ACTION_FAILED');
    expect(repository).toContain('AutomationExecutionStatus.PARTIALLY_FAILED');
    expect(integration).toContain(
      'finalizes the execution only after the last action',
    );
    expect(integration).toContain('skips later actions');
    expect(integration).toContain("'PARTIALLY_FAILED'");
    expect(documentation).toContain('No automatic retry is introduced');
  });

  it('keeps suppressed reservations terminal and auditable', () => {
    expect(reservationRepository).toContain("'EXECUTION_SUPPRESSED_COOLDOWN'");
    expect(reservationRepository).toContain("'EXECUTION_SUPPRESSED_LOOP'");
    expect(reservationRepository).toMatch(
      /automationExecutionAction\.createMany\([\s\S]*?createdAt:\s*databaseNow,[\s\S]*?completedAt:\s*suppressed \? databaseNow : null/,
    );
    expect(integration).toContain('rejects suppressed execution claims');
  });

  it('registers the stable contract, immutable document, and full validation profile', () => {
    const contractPath =
      'test/module-11-automation-action-state-transition-foundation.contract.spec.ts';
    const documentPath =
      'docs/module-11-automation-action-state-transition-foundation.md';
    expect(policy.contractClasses[contractPath]).toBe('stable-contract');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      documentPath,
    );
    const profile =
      profiles.profiles[
        'module-11-automation-action-state-transition-foundation'
      ];
    expect(profile).toBeDefined();
    const commandText = profile
      .map((step) => `${step.label} ${step.args.join(' ')}`)
      .join('\n');
    for (const required of [
      'module:runner:check',
      'lint:check',
      'prisma validate',
      'prisma generate',
      'run build',
      'test:integration:db',
      'test:historical-contract-transitions',
    ]) {
      expect(commandText).toContain(required);
    }
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
    expect(databaseIntegrationIndex).toBeGreaterThanOrEqual(0);
    expect(profile[databaseIntegrationIndex]?.env).toEqual({
      NODE_ENV: 'test',
      DATABASE_INTEGRATION_TESTS_ALLOWED: 'true',
    });
    expect(profile[databaseIntegrationIndex]?.requiredEnv).toEqual([
      'TEST_DATABASE_URL',
    ]);
    expect(profile[databaseIntegrationIndex]?.env).not.toHaveProperty(
      'TEST_DATABASE_URL',
    );
    const structuredLoggingIndex = profile.findIndex((step) =>
      step.args.includes(
        'src/common/logging/structured-logging.contract.spec.ts',
      ),
    );
    const focusedIndex = profile.findIndex((step) =>
      step.label.startsWith('Focused Module 11 action-state transition'),
    );
    const buildIndex = profile.findIndex(
      (step) =>
        step.command === 'npm' &&
        JSON.stringify(step.args) === JSON.stringify(['run', 'build']),
    );
    expect(structuredLoggingIndex).toBeGreaterThanOrEqual(0);
    expect(structuredLoggingIndex).toBeLessThan(focusedIndex);
    expect(focusedIndex).toBeLessThan(buildIndex);
    expect(buildIndex).toBeLessThan(databaseIntegrationIndex);
    expect(databaseIntegrationIndex).toBeLessThan(fullJestIndex);
  });

  it('binds the remote-green Slice 11.7 closure to machine-readable safety invariants', () => {
    const closurePath =
      'docs/module-11-automation-action-state-transition-foundation-closure.md';
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      closurePath,
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_7_SCHEMA=1',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_7_ACTION_STATE_TRANSITION_FOUNDATION_CLOSED=true',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_7_NORMAL_AUTOMATION_WRITE_ENABLED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_7_AUTOMATION_RUNTIME_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_7_TELEMETRY_COORDINATOR_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_7_COMMAND_DISPATCH_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_7_RETRY_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_7_LATER_MODULE_11_SLICE_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_7_MODULE_12_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_7_PRODUCTION_DEPLOYMENT_APPROVED=false',
    );

    const profile =
      profiles.profiles[
        'module-11-automation-action-state-transition-foundation-closure'
      ];
    expect(profile).toBeDefined();
    const structuredLoggingIndex = profile.findIndex((step) =>
      step.args.includes(
        'src/common/logging/structured-logging.contract.spec.ts',
      ),
    );
    const focusedIndex = profile.findIndex((step) =>
      step.label.startsWith(
        'Focused Module 11 action-state transition closure',
      ),
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
    expect(focusedIndex).toBeLessThan(databaseIntegrationIndex);
    expect(databaseIntegrationIndex).toBeLessThan(fullJestIndex);
    expect(profile[databaseIntegrationIndex]?.env).toEqual({
      NODE_ENV: 'test',
      DATABASE_INTEGRATION_TESTS_ALLOWED: 'true',
    });
    expect(profile[databaseIntegrationIndex]?.requiredEnv).toEqual([
      'TEST_DATABASE_URL',
    ]);
  });

  it('keeps coordination, dispatch, retry, activation, Module 12, and deployment outside the slice', () => {
    const nonScope = documentation.slice(
      documentation.indexOf('## Explicit Non-Scope'),
    );
    for (const boundary of [
      'telemetry subscriber',
      'evaluator coordinator',
      '`CommandService` invocation',
      'direct MQTT publication',
      'retry policy',
      'Module 12 activation',
      'Production deployment remains **NOT APPROVED**',
    ]) {
      expect(nonScope).toContain(boundary);
    }
  });
});
