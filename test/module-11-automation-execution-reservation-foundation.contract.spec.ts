import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string): string =>
  readFileSync(resolve(root, path), 'utf8');
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

type ValidationStep = {
  label: string;
  args: string[];
};

describe('Module 11 automation execution reservation foundation contract', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read(
    'prisma/migrations/20260803020000_module_11_automation_execution_reservation_foundation/migration.sql',
  );
  const repository = read('src/automation/automation-execution.repository.ts');
  const repositorySpec = read(
    'src/automation/automation-execution.repository.spec.ts',
  );
  const integration = read(
    'test/integration/automation-execution-reservation.integration-spec.ts',
  );
  const moduleSource = read('src/automation/automation.module.ts');
  const documentation = read(
    'docs/module-11-automation-execution-reservation-foundation.md',
  );
  const closure = read(
    'docs/module-11-automation-execution-reservation-foundation-closure.md',
  );
  const policy = readJson<{
    contractClasses: Record<string, string>;
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const profiles = readJson<{
    profiles: Record<string, ValidationStep[]>;
  }>('tools/module-runner/profiles/validation-profiles.json');

  it('adds tenant-bound immutable execution and ordered action snapshot models', () => {
    expect(schema).toContain('model AutomationExecution {');
    expect(schema).toContain('model AutomationExecutionAction {');
    expect(schema).toContain('enum AutomationExecutionStatus {');
    expect(schema).toContain('enum AutomationExecutionActionStatus {');
    expect(schema).toContain(
      '@@unique([tenantId, automationId, automationRevision, triggerTelemetryId]',
    );
    expect(schema).toContain('fields: [triggerTelemetryId, tenantId]');
    expect(schema).toContain('fields: [executionId, tenantId]');
    expect(schema).toContain('fields: [commandId, tenantId]');
    expect(schema).toContain('SUPPRESSED_LOOP');
    expect(schema).toContain('SUPPRESSED_COOLDOWN');
  });

  it('keeps the migration additive, restrictive, and database-idempotent', () => {
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
    expect(migration).toContain('CREATE TABLE "automation_executions"');
    expect(migration).toContain('CREATE TABLE "automation_execution_actions"');
    expect(migration).toContain('automation_executions_canonical_identity_key');
    expect(migration).toContain(
      'FOREIGN KEY ("triggerTelemetryId", "tenantId")',
    );
    expect(migration).toContain('FOREIGN KEY ("executionId", "tenantId")');
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(migration).toContain('ON DELETE CASCADE ON UPDATE CASCADE');
  });

  it('reserves exact approved evidence and treats canonical replay independently of mutable current state', () => {
    expect(repository).toContain('this.prisma.$transaction');
    expect(repository).toContain('revision: input.automationRevision');
    expect(repository).toContain('enabled: true');
    expect(repository).toContain(
      'triggerTelemetryId: input.triggerTelemetryId',
    );
    expect(repository).toContain('payloadValue !== input.triggerValue');
    expect(repository).toContain('assertActionSnapshot');
    expect(repository).toContain('loadCanonicalExecution(normalized)');
    expect(repository).toContain("disposition: 'REPLAYED'");
    expect(repository).toContain("error.code === 'P2002'");
    expect(repository).toContain(
      'AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.IdempotencyConflict',
    );
    expect(repositorySpec).toContain(
      'without rereading mutable automation state',
    );
  });

  it('persists bounded fail-closed loop suppression without dispatch side effects', () => {
    expect(repository).toContain('maxAncestryDepth');
    expect(repository).toContain('ANCESTRY_CONTAINS_AUTOMATION');
    expect(repository).toContain('ANCESTRY_DUPLICATE');
    expect(repository).toContain('ANCESTRY_UNVERIFIED');
    expect(repository).toContain('AutomationExecutionStatus.SUPPRESSED_LOOP');
    expect(repository).toContain('AutomationExecutionActionStatus.SKIPPED');
    expect(repository).not.toContain('CommandService');
    expect(repository).not.toContain('MqttService');
    expect(repository).not.toContain('RedisService');
  });

  it('proves concurrency, immutable replay conflict, tenant evidence, and restrictive references', () => {
    expect(integration).toContain('Promise.all');
    expect(integration).toContain("'CREATED'");
    expect(integration).toContain("'REPLAYED'");
    expect(integration).toContain(
      'AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.IdempotencyConflict',
    );
    expect(integration).toContain(
      'AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.TelemetryMismatch',
    );
    expect(integration).toContain('after the current automation is disabled');
    expect(integration).toContain("code: 'P2003'");
  });

  it('registers the repository, stable contract, immutable record, and official validation profile', () => {
    expect(moduleSource).toContain('AutomationExecutionRepository');
    expect(moduleSource).toMatch(
      /exports:\s*\[[^\]]*\bAutomationExecutionRepository\b[^\]]*\]/,
    );

    const testPath =
      'test/module-11-automation-execution-reservation-foundation.contract.spec.ts';
    expect(policy.contractClasses[testPath]).toBe('stable-contract');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      'docs/module-11-automation-execution-reservation-foundation.md',
    );

    const profile =
      profiles.profiles[
        'module-11-automation-execution-reservation-foundation'
      ];
    expect(profile).toBeDefined();
    expect(profile.map((step) => step.label)).toEqual(
      expect.arrayContaining([
        'Pre-dependency Module Execution Kit self-test',
        'Module Execution Kit source checks',
        'Clean dependency bootstrap',
        'Changed TypeScript formatting check',
        'Repository non-mutating lint',
        'Focused Module 11 execution reservation and transition-safety tests',
        'Current lifecycle validation',
        'Lifecycle simulation through Module 30',
        'Prisma schema validation',
        'Prisma client generation',
        'Nest application build',
        'Full Jest suite once for the exact candidate',
        'Checkpoint-aware lifecycle and state-sensitive contract matrix',
      ]),
    );

    const closureProfile =
      profiles.profiles[
        'module-11-automation-execution-reservation-foundation-closure'
      ];
    expect(closureProfile).toBeDefined();
    expect(closureProfile.map((step) => step.label)).toEqual(
      expect.arrayContaining([
        'Pre-dependency Module Execution Kit self-test',
        'Module Execution Kit source checks',
        'Clean dependency bootstrap',
        'Changed TypeScript formatting check',
        'Repository non-mutating lint',
        'Focused Module 11 execution reservation closure and transition-safety tests',
        'Current lifecycle validation',
        'Lifecycle simulation through Module 30',
        'Prisma schema validation',
        'Prisma client generation',
        'Nest application build',
        'Full Jest suite once for the exact candidate',
        'Checkpoint-aware lifecycle and state-sensitive contract matrix',
      ]),
    );
  });

  it('documents exact remote-green provenance and preserves activation boundaries', () => {
    expect(documentation).toContain('e9112d25852dafb90bb21db6748de9c09efbf1c4');
    expect(documentation).toContain('30812751919');
    expect(documentation).toContain(
      'tenantId + automationId + automationRevision + triggerTelemetryId',
    );
    expect(documentation).toContain('enabled=false');
    const nonScope = documentation.slice(
      documentation.indexOf('## Explicit Non-Scope'),
    );
    expect(nonScope).toContain('telemetry subscriber');
    expect(nonScope).toContain('`CommandService` invocation');
    expect(nonScope).toContain('cooldown reservation');
    expect(nonScope).toContain('Module 12 activation');
    expect(documentation).toContain(
      'Production deployment remains **NOT APPROVED**',
    );
  });

  it('records immutable remote-green closure evidence without activating automation runtime', () => {
    expect(closure).toContain(
      'exact implementation commit `260b49192156c9eadad1ca6bae5dbb639420ded1` in GitHub Actions run `30818815202`',
    );
    expect(closure).toContain('119 test suites and 839 tests');
    expect(closure).toContain('PostgreSQL integration passed 29 tests');
    expect(closure).toContain('artifact `8858020670`');
    expect(closure).toContain(
      'Normal automation writes remain `enabled=false`',
    );
    expect(closure).toContain(
      'No later Module 11 slice is activated by this closure.',
    );
    expect(closure).toContain('Production deployment remains **NOT APPROVED**');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      'docs/module-11-automation-execution-reservation-foundation-closure.md',
    );
  });
});
