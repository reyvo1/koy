import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  analyzeContractFile,
  analyzeRepositoryContractPolicy,
  discoverContractFiles,
  loadContractSurfacePolicy,
} from './support/historical-contract-policy';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

const fixturePath = (name: string): string =>
  `test/fixtures/historical-contract-policy/${name}.fixture.ts`;

describe('Repository historical contract architecture policy', () => {
  it('preserves the prior immutable systemic-correction evidence', () => {
    const priorPolicy = read('docs/historical-contract-transition-safety.md');

    expect(priorPolicy).toContain('c775ca01151fbc6811a4994f46e096e004285ce9');
    expect(priorPolicy).toContain('30545421357');
    expect(priorPolicy).toContain('efa6cc22a8ed5b125ee34a8098b7dd5d09d9c83c');
    expect(priorPolicy).toContain('30554927639');
  });

  it('classifies every repository contract and every document surface', () => {
    const policy = loadContractSurfacePolicy(root);
    const discovered = discoverContractFiles(root);

    expect(policy.version).toBe(1);
    expect(Object.keys(policy.contractClasses).sort()).toEqual(discovered);
    expect(policy.currentStateContracts).toEqual([
      'test/module-lifecycle.contract.spec.ts',
    ]);
    expect(policy.mutableCurrentStateDocuments).toEqual(
      expect.arrayContaining([
        'project-config.json',
        'docs/module-lifecycle.md',
        'docs/project-state.md',
        'docs/roadmap.md',
        'AI-Development-Kit/bootstrap/PROJECT-BOOTSTRAP-v1.0.md',
        'AI-Development-Kit/architecture/SYSTEM.md',
        'AI-Development-Kit/agent/REPOSITORY-MEMORY.md',
        'AI-Development-Kit/prompts/MODULE-10.md',
      ]),
    );
    expect(policy.stableArchitecturePolicyDocuments).toEqual([
      'docs/architecture.md',
      'docs/module-10-multiplatform-architecture.md',
    ]);
    expect(policy.historicalStableDocumentOwners).toEqual({
      'test/module-10-activation.contract.spec.ts': [
        'docs/module-10-multiplatform-architecture.md',
      ],
    });
  });

  it('rejects repository-wide transition-unsafe dependencies', () => {
    expect(analyzeRepositoryContractPolicy(root)).toEqual([]);
  });

  it.each([
    ['direct-sha', 'MUTABLE_CURRENT_STATE_READ'],
    ['run-roadmap', 'MUTABLE_CURRENT_STATE_READ'],
    ['historical-sentence', 'MUTABLE_CURRENT_STATE_READ'],
    ['link-fan-out', 'MUTABLE_CURRENT_STATE_READ'],
    ['alias-helper-loop', 'MUTABLE_CURRENT_STATE_READ'],
    ['imported-reader', 'MUTABLE_CURRENT_STATE_READ'],
    ['advanced-indirection', 'MUTABLE_CURRENT_STATE_READ'],
    ['stable-architecture-fan-out', 'HISTORICAL_SHARED_ARCHITECTURE_READ'],
    ['repository-policy-prose', 'EXACT_PROSE_ASSERTION_ON_REPOSITORY_POLICY'],
  ])('rejects negative fixture %s', (name, expectedCode) => {
    const policy = loadContractSurfacePolicy(root);
    const findings = analyzeContractFile({
      root,
      relativePath: fixturePath(name),
      policy,
      contractClass: 'historical-evidence',
    });

    expect(findings.map((finding) => finding.code)).toContain(expectedCode);
  });

  it('binds the five-state projected transition matrix to official validation', () => {
    const policy = loadContractSurfacePolicy(root);
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };
    const profiles = JSON.parse(
      read('tools/module-runner/profiles/validation-profiles.json'),
    ) as {
      profiles: Record<string, Array<{ label: string; args: string[] }>>;
    };

    expect(packageJson.scripts['test:historical-contract-transitions']).toBe(
      'node test/scripts/run-historical-contract-transition-matrix.mjs',
    );
    const transitionRunner = read(
      'test/scripts/run-historical-contract-transition-matrix.mjs',
    );
    expect(transitionRunner).toContain(
      "from '../../tools/module-runner/lib/process.mjs'",
    );
    expect(transitionRunner).toContain("runChecked('npm', args");
    expect(transitionRunner.indexOf('const sha256')).toBeLessThan(
      transitionRunner.indexOf('const immutableEvidenceHashes'),
    );
    expect(transitionRunner).toContain('resolveCheckpointTransitionCount');
    expect(transitionRunner).toContain('planProjectedState');
    expect(transitionRunner).toContain('verifyTransitionPlanning');
    expect(transitionRunner).not.toContain('spawnSync');
    expect(transitionRunner).not.toContain('npm.cmd');
    expect(transitionRunner).not.toContain('shell: true');
    expect(
      profiles.profiles['repository-historical-contract-remediation'].some(
        (step) =>
          step.args.join(' ') === 'run test:historical-contract-transitions',
      ),
    ).toBe(true);
    expect(policy.transitionProof.states.map((state) => state.label)).toEqual([
      'current exact checkpoint',
      'Module 10 Completion Review closure',
      'module:complete 10',
      'Module 11 activation',
      'Module 11 Slice 11.1',
    ]);
    expect(policy.transitionProof.validationCommands).toEqual([
      ['run', 'module:validate'],
      ['run', 'test:historical-contract-state'],
    ]);
    expect(policy.transitionProof.states[4].transitions).toHaveLength(4);
  });

  it('keeps owner-controlled gates outside this remediation', () => {
    const policy = loadContractSurfacePolicy(root);

    expect(policy.remediationBoundary).toEqual({
      baseSha: '850c3de5171dea4cd07a135de46078ff521d3ef9',
      invalidArtifacts: [
        'module-10-completion-review-v1.0.0',
        'module-10-completion-review-v1.0.1',
        'repository-historical-contract-architecture-remediation-v1.0.0',
        'repository-historical-contract-architecture-remediation-v1.0.1',
      ],
      prohibitedOwnerGates: [
        'module-10-completion',
        'module-11-activation',
        'push',
        'deployment',
      ],
    });
  });
});
