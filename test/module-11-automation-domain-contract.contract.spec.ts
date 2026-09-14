import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string): string =>
  readFileSync(resolve(root, path), 'utf8');

const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

describe('Module 11 Slice 11.1 automation domain contract', () => {
  const types = read('src/automation/automation-domain.types.ts');
  const validator = read('src/automation/automation-domain.validator.ts');
  const documentation = read('docs/module-11-automation-domain-contract.md');

  it('defines one versioned normalized trigger-condition-action aggregate', () => {
    expect(types).toContain("AUTOMATION_SCHEMA_VERSION = '1.0.0'");
    expect(types).toContain("kind: 'CAPABILITY_REPORTED'");
    expect(types).toContain("kind: 'DEVICE_COMMAND'");

    for (const condition of ['ALWAYS', 'ALL', 'ANY', 'NOT', 'COMPARE']) {
      expect(types).toContain(`kind: '${condition}'`);
    }

    for (const source of ['TRIGGER_VALUE', 'LATEST_CAPABILITY_VALUE']) {
      expect(types).toContain(`source: '${source}'`);
    }
  });

  it('keeps the contract bounded and fail-closed', () => {
    for (const bound of [
      'maxConditionDepth: 5',
      'maxConditionNodes: 32',
      'maxConditionChildren: 8',
      'maxActions: 16',
      'maxStringValueLength: 1024',
    ]) {
      expect(types).toContain(bound);
    }

    expect(validator).toContain('assertExactKeys');
    expect(validator).toContain('Number.isFinite');
    expect(validator).toContain(
      'automation action cannot directly target its trigger source',
    );
    expect(validator).toContain('AutomationContractInvalid');
  });

  it('preserves tenant authorization and existing command boundaries', () => {
    expect(documentation).toContain('trusted authenticated tenant context');
    expect(documentation).toContain('reject cross-tenant references');
    expect(documentation).toContain('reuse the existing `CommandService`');
    expect(documentation).toContain(
      'automation code must not publish directly to MQTT',
    );
    expect(validator).not.toContain('MqttService');
    expect(validator).not.toContain('CommandService');
  });

  it('records the Slice 11.1 contract-only boundary without blocking approved later persistence', () => {
    expect(documentation).toContain(
      'This slice adds no Prisma model, migration, repository, controller, public API, worker, queue, Redis state, MQTT subscription, command publication, cooldown, execution log, retry, runtime idempotency, cross-automation loop graph, Scene, Scheduler, Notification, frontend, mobile behavior, Module 12 activation, or production deployment approval.',
    );
    expect(documentation).toContain(
      'Slice 11.2 persists this exact bounded contract',
    );
    expect(documentation).toContain(
      'persistence does not widen trigger, condition, value, or action semantics',
    );
  });

  it('registers this contract in the repository contract-surface policy', () => {
    const policy = readJson<{ contractClasses: Record<string, string> }>(
      'test/contract-surface-policy.json',
    );

    expect(
      policy.contractClasses[
        'test/module-11-automation-domain-contract.contract.spec.ts'
      ],
    ).toBe('stable-contract');
  });

  it('registers an official cheap-to-expensive validation profile', () => {
    const profileDocument = readJson<{
      profiles: Record<
        string,
        Array<{ label: string; command: string; args: string[] }>
      >;
    }>('tools/module-runner/profiles/validation-profiles.json');
    const profile =
      profileDocument.profiles['module-11-automation-domain-contract'];

    expect(profile).toBeDefined();
    const labels = profile.map((step) => step.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Pre-dependency Module Execution Kit self-test',
        'Module Execution Kit source checks',
        'Clean dependency bootstrap',
        'Changed TypeScript formatting check',
        'Repository non-mutating lint',
        'Current lifecycle validation',
        'Lifecycle simulation through Module 30',
        'Focused Module 11 automation contract tests',
        'Prisma client generation',
        'Nest application build',
        'Full Jest suite once for the exact candidate',
        'Checkpoint-aware lifecycle and state-sensitive contract matrix',
      ]),
    );

    const indexOf = (label: string): number => labels.indexOf(label);
    expect(
      indexOf('Pre-dependency Module Execution Kit self-test'),
    ).toBeLessThan(indexOf('Clean dependency bootstrap'));
    expect(indexOf('Module Execution Kit source checks')).toBeLessThan(
      indexOf('Clean dependency bootstrap'),
    );
    expect(indexOf('Changed TypeScript formatting check')).toBeLessThan(
      indexOf('Repository non-mutating lint'),
    );
    expect(indexOf('Repository non-mutating lint')).toBeLessThan(
      indexOf('Current lifecycle validation'),
    );
    expect(indexOf('Current lifecycle validation')).toBeLessThan(
      indexOf('Lifecycle simulation through Module 30'),
    );
    expect(indexOf('Lifecycle simulation through Module 30')).toBeLessThan(
      indexOf('Focused Module 11 automation contract tests'),
    );
    expect(indexOf('Focused Module 11 automation contract tests')).toBeLessThan(
      indexOf('Prisma client generation'),
    );
    expect(
      indexOf('Full Jest suite once for the exact candidate'),
    ).toBeLessThan(
      indexOf('Checkpoint-aware lifecycle and state-sensitive contract matrix'),
    );
  });
});
