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

describe('Module 11 automation runtime safety contract', () => {
  const documentation = read(
    'docs/module-11-automation-runtime-safety-contract.md',
  );
  const closure = read(
    'docs/module-11-automation-runtime-safety-contract-closure.md',
  );
  const policy = readJson<{
    contractClasses: Record<string, string>;
    transitionProof: { immutableEvidenceDocuments: string[] };
  }>('test/contract-surface-policy.json');
  const profiles = readJson<{
    profiles: Record<string, ValidationStep[]>;
  }>('tools/module-runner/profiles/validation-profiles.json');

  it('binds Slice 11.4 to the exact immutable remote-green closure evidence', () => {
    expect(documentation).toContain(
      '# Module 11 Slice 11.4 - Automation Runtime Safety Contract',
    );
    expect(documentation).toContain('35f9e8812bc186f576773df96ad1ca195706e4fe');
    expect(documentation).toContain('30803661710');
    expect(documentation).toContain(
      'production deployment remains **NOT APPROVED**',
    );
  });

  it('defines deterministic tenant-bound execution identity and replay safety', () => {
    expect(documentation).toContain(
      'tenantId + automationId + automationRevision + triggerTelemetryId',
    );
    expect(documentation).toContain('idempotent replay');
    expect(documentation).toContain('fail-closed conflict');
    expect(documentation).toContain('PostgreSQL remains authoritative');
  });

  it('requires fail-closed ordering, bounded ancestry, and atomic cooldown reservation', () => {
    expect(documentation).toContain('Required Decision Order');
    expect(documentation).toContain('maximum ancestry depth is `16`');
    expect(documentation).toContain(
      'atomically evaluate and reserve cooldown using database time',
    );
    expect(documentation).toContain('`SUPPRESSED_COOLDOWN`');
    expect(documentation).toContain('`SUPPRESSED_LOOP`');
  });

  it('requires CommandService-only sequential dispatch and stable action idempotency', () => {
    expect(documentation).toContain(
      'Future automation action dispatch must call the existing `CommandService`',
    );
    expect(documentation).toContain('Direct MQTT publication is forbidden');
    expect(documentation).toContain('automation execution identity + actionId');
    expect(documentation).toContain(
      'Actions are dispatched sequentially in persisted position order',
    );
  });

  it('keeps runtime mutation, activation, Module 12, and deployment outside this slice', () => {
    expect(documentation).toContain(
      'Every persisted automation remains `enabled=false`',
    );
    const explicitNonScope = documentation.slice(
      documentation.indexOf('## Explicit Non-Scope'),
    );
    expect(explicitNonScope).toContain('This slice adds no Prisma model');
    expect(explicitNonScope).toContain('telemetry subscription');
    expect(explicitNonScope).toContain('execution row');
    expect(explicitNonScope).toContain('Module 12 activation');
    expect(documentation).toContain(
      'production deployment remains **NOT APPROVED**',
    );
  });

  it('registers the contract, immutable document, and official validation profile', () => {
    const testPath =
      'test/module-11-automation-runtime-safety-contract.contract.spec.ts';
    expect(policy.contractClasses[testPath]).toBe('stable-contract');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      'docs/module-11-automation-runtime-safety-contract.md',
    );

    const profile =
      profiles.profiles['module-11-automation-runtime-safety-contract'];
    expect(profile).toBeDefined();
    expect(profile.map((step) => step.label)).toEqual(
      expect.arrayContaining([
        'Pre-dependency Module Execution Kit self-test',
        'Module Execution Kit source checks',
        'Clean dependency bootstrap',
        'Changed TypeScript formatting check',
        'Repository non-mutating lint',
        'Focused Module 11 runtime safety contract and transition-safety tests',
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
      profiles.profiles['module-11-automation-runtime-safety-contract-closure'];
    expect(closureProfile).toBeDefined();
    expect(closureProfile.map((step) => step.label)).toEqual(
      expect.arrayContaining([
        'Pre-dependency Module Execution Kit self-test',
        'Module Execution Kit source checks',
        'Clean dependency bootstrap',
        'Changed TypeScript formatting check',
        'Repository non-mutating lint',
        'Focused Module 11 runtime safety closure and transition-safety tests',
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

  it('records immutable remote-green closure evidence without activating runtime', () => {
    expect(closure).toContain(
      'exact contract commit `c12da413561ed6ba39f0725d2af3c083a2aa396c` in GitHub Actions run `30808609333`',
    );
    expect(closure).toContain('117 test suites and 825 tests');
    expect(closure).toContain('artifact `8853900178`');
    expect(closure).toContain(
      'No later Module 11 slice is activated by this closure.',
    );
    expect(closure).toContain('Production deployment remains **NOT APPROVED**');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      'docs/module-11-automation-runtime-safety-contract-closure.md',
    );
  });
});
