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

describe('Module 11 automation cooldown reservation foundation contract', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read(
    'prisma/migrations/20260803030000_module_11_automation_cooldown_reservation_foundation/migration.sql',
  );
  const automationRepository = read('src/automation/automation.repository.ts');
  const executionRepository = read(
    'src/automation/automation-execution.repository.ts',
  );
  const repositorySpec = read(
    'src/automation/automation-execution.repository.spec.ts',
  );
  const integration = read(
    'test/integration/automation-cooldown-reservation.integration-spec.ts',
  );
  const documentation = read(
    'docs/module-11-automation-cooldown-reservation-foundation.md',
  );
  const closure = read(
    'docs/module-11-automation-cooldown-reservation-foundation-closure.md',
  );
  const policy = readJson<{
    contractClasses: Record<string, string>;
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const profiles = readJson<{
    profiles: Record<string, ValidationStep[]>;
  }>('tools/module-runner/profiles/validation-profiles.json');

  it('adds bounded cooldown configuration and immutable execution evidence additively', () => {
    expect(schema).toContain('cooldownSeconds     Int');
    expect(schema).toContain('cooldownEvaluatedAt');
    expect(schema).toContain('cooldownReferenceExecutionId');
    expect(schema).toContain(
      '@relation("AutomationExecutionCooldownReference"',
    );
    expect(schema).toContain('automation_executions_cooldown_lookup_idx');

    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
    expect(migration).toContain(
      'CHECK ("cooldownSeconds" >= 0 AND "cooldownSeconds" <= 86400)',
    );
    expect(migration).toContain(
      'automation_executions_cooldownReferenceExecutionId_tenantId_automationId_fkey',
    );
    expect(migration).toContain('automation_executions_cooldown_reference_key');
    expect(migration).toContain(
      'FOREIGN KEY ("cooldownReferenceExecutionId", "tenantId", "automationId")',
    );
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
  });

  it('keeps normal owner writes fail-closed at zero cooldown', () => {
    expect(
      (automationRepository.match(/cooldownSeconds:\s*0/g) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
    expect(documentation).toContain(
      'forces `cooldownSeconds=0` on create and replace',
    );
    expect(documentation).toContain(
      'No domain-contract field, HTTP input, DTO, controller, or activation API',
    );
  });

  it('uses a tenant-automation PostgreSQL lock and database clock', () => {
    expect(executionRepository).toContain('transaction.$executeRaw`');
    expect(executionRepository).toContain('pg_advisory_xact_lock');
    expect(executionRepository).not.toMatch(
      /transaction\.\$queryRaw(?:<[^>]+>)?`\s*SELECT\s+pg_advisory_xact_lock/,
    );
    expect(executionRepository).toContain('hashtextextended');
    expect(executionRepository).toContain('clock_timestamp()');
    expect(executionRepository).toContain(
      'loadCanonicalExecutionInTransaction',
    );
    expect(executionRepository).toContain('createdAt: databaseNow');
    expect(repositorySpec).toContain(
      'rechecks the canonical identity after taking the database lock',
    );
  });

  it('persists only accepted non-suppressed executions as cooldown references', () => {
    for (const status of [
      'AutomationExecutionStatus.RESERVED',
      'AutomationExecutionStatus.DISPATCHING',
      'AutomationExecutionStatus.SUCCEEDED',
      'AutomationExecutionStatus.FAILED',
      'AutomationExecutionStatus.PARTIALLY_FAILED',
    ]) {
      expect(executionRepository).toContain(status);
    }
    expect(executionRepository).toContain(
      'AutomationExecutionStatus.SUPPRESSED_COOLDOWN',
    );
    expect(executionRepository).toContain("'COOLDOWN_ACTIVE'");
    expect(executionRepository).toContain('gt: threshold');
    expect(executionRepository).toContain('lte: databaseNow');
    expect(documentation).toContain(
      '`SUPPRESSED_COOLDOWN` and `SUPPRESSED_LOOP` never extend the window',
    );
  });

  it('proves concurrency, zero cooldown, restrictive references, and historical replay in PostgreSQL', () => {
    expect(integration).toContain('Promise.all');
    expect(integration).toContain("'SUPPRESSED_COOLDOWN'");
    expect(integration).toContain("'RESERVED'");
    expect(integration).toContain("code: 'P2003'");
    expect(integration).toContain('does not let suppressed rows extend');
    expect(integration).toContain(
      'replays immutable cooldown evidence without rereading current configuration',
    );
  });

  it('registers the stable contract, immutable document, and full validation profile', () => {
    const contractPath =
      'test/module-11-automation-cooldown-reservation-foundation.contract.spec.ts';
    const documentPath =
      'docs/module-11-automation-cooldown-reservation-foundation.md';

    expect(policy.contractClasses[contractPath]).toBe('stable-contract');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      documentPath,
    );

    const profile =
      profiles.profiles['module-11-automation-cooldown-reservation-foundation'];
    expect(profile).toBeDefined();
    const commandText = profile
      .map((step) => `${step.label} ${step.args.join(' ')}`)
      .join('\n');
    expect(commandText).toContain('module:runner:check');
    expect(commandText).toContain('lint:check');
    expect(commandText).toContain('prisma validate');
    expect(commandText).toContain('prisma generate');
    expect(commandText).toContain('run build');
    expect(commandText).toContain('test:historical-contract-transitions');

    const closureProfile =
      profiles.profiles[
        'module-11-automation-cooldown-reservation-foundation-closure'
      ];
    expect(closureProfile).toBeDefined();
    const closureCommandText = closureProfile
      .map((step) => `${step.label} ${step.args.join(' ')}`)
      .join('\n');
    expect(closureCommandText).toContain('module:runner:check');
    expect(closureCommandText).toContain('lint:check');
    expect(closureCommandText).toContain('prisma validate');
    expect(closureCommandText).toContain('prisma generate');
    expect(closureCommandText).toContain('run build');
    expect(closureCommandText).toContain(
      'test:historical-contract-transitions',
    );
  });

  it('keeps coordination, dispatch, activation, Module 12, and deployment outside the slice', () => {
    const nonScope = documentation.slice(
      documentation.indexOf('## Explicit Non-Scope'),
    );

    expect(nonScope).toContain('no user-configurable cooldown field');
    expect(nonScope).toContain('telemetry subscriber');
    expect(nonScope).toContain('evaluator coordinator');
    expect(nonScope).toContain('`CommandService` invocation');
    expect(nonScope).toContain('Module 12 activation');
    expect(nonScope).toContain(
      'Production deployment remains **NOT APPROVED**',
    );
  });

  it('records immutable remote-green closure evidence without activating automation runtime', () => {
    expect(closure).toContain(
      'exact implementation commit `84dad046319a886ef6b4878288b859cc023d10be` in GitHub Actions run `30875978216`',
    );
    expect(closure).toContain('120 test suites and 850 tests');
    expect(closure).toContain(
      'PostgreSQL integration passed 34 tests across 8 suites',
    );
    expect(closure).toContain('18 committed migrations');
    expect(closure).toContain('artifact `8879588443`');
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_6_SCHEMA=1',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_6_NORMAL_AUTOMATION_WRITE_ENABLED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_6_NORMAL_AUTOMATION_WRITE_COOLDOWN_SECONDS=0',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_6_AUTOMATION_RUNTIME_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_6_LATER_MODULE_11_SLICE_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_6_MODULE_12_ACTIVATED=false',
    );
    expect(closure).toContain(
      'CLOSURE_INVARIANT_MODULE_11_SLICE_11_6_PRODUCTION_DEPLOYMENT_APPROVED=false',
    );
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      'docs/module-11-automation-cooldown-reservation-foundation-closure.md',
    );
  });
});
