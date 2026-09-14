import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string): string =>
  readFileSync(resolve(root, path), 'utf8');

describe('Module Execution Kit efficiency contract', () => {
  const packageJson = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
  };
  const profileDocument = JSON.parse(
    read('tools/module-runner/profiles/validation-profiles.json'),
  ) as {
    profiles: Record<
      string,
      Array<{
        label: string;
        command: string;
        args: string[];
        stream?: boolean;
      }>
    >;
  };

  it('runs one broad Jest pass per exact candidate', () => {
    for (const steps of Object.values(profileDocument.profiles)) {
      const hasFullJest = steps.some(
        (step) =>
          step.command === 'npm' &&
          step.args[0] === 'test' &&
          step.args.includes('--runInBand'),
      );
      if (!hasFullJest) continue;

      const commands = steps.map((step) => step.args.join(' '));
      expect(commands).not.toContain('run test:contracts');
      expect(commands).not.toContain('run test:module-10');
    }

    const workflow =
      profileDocument.profiles['workflow-efficiency-remediation'];
    expect(
      workflow.filter(
        (step) => step.command === 'npm' && step.args[0] === 'ci',
      ),
    ).toHaveLength(1);
    expect(
      workflow.filter(
        (step) =>
          step.command === 'npm' &&
          step.args[0] === 'test' &&
          step.args.includes('--runInBand'),
      ),
    ).toHaveLength(1);
    expect(
      workflow.filter((step) =>
        step.args.includes('test:historical-contract-transitions'),
      ),
    ).toHaveLength(1);

    const labels = workflow.map((step) => step.label);
    expect(
      labels.indexOf('Pre-dependency Module Execution Kit self-test'),
    ).toBeLessThan(labels.indexOf('Clean dependency bootstrap'));
    expect(labels.indexOf('Module Execution Kit source checks')).toBeLessThan(
      labels.indexOf('Clean dependency bootstrap'),
    );
    expect(labels.indexOf('Changed TypeScript formatting check')).toBeLessThan(
      labels.indexOf('Repository non-mutating lint'),
    );
    expect(labels.indexOf('Repository non-mutating lint')).toBeLessThan(
      labels.indexOf('Prisma client generation'),
    );
    expect(labels.indexOf('Prisma client generation')).toBeLessThan(
      labels.indexOf('Full Jest suite once for the exact candidate'),
    );
  });

  it('limits projected states to lifecycle and state-sensitive contracts', () => {
    const policy = JSON.parse(read('test/contract-surface-policy.json')) as {
      transitionProof: { validationCommands: string[][] };
    };
    expect(policy.transitionProof.validationCommands).toEqual([
      ['run', 'module:validate'],
      ['run', 'test:historical-contract-state'],
    ]);
    expect(packageJson.scripts['test:historical-contract-state']).toBe(
      'jest --runInBand --runTestsByPath test/module-lifecycle.contract.spec.ts test/historical-contract-transition-safety.contract.spec.ts',
    );

    const matrix = read(
      'test/scripts/run-historical-contract-transition-matrix.mjs',
    );
    expect(matrix).toContain('immutableEvidenceHashes');
    expect(matrix).toContain('Immutable evidence changed during projection');
    expect(matrix).not.toContain("['run', 'test:contracts']");
    expect(matrix).not.toContain("['test', '--', '--runInBand']");
  });

  it('keeps post-apply verification byte-bound and lightweight', () => {
    expect(
      profileDocument.profiles['framework-post-apply'].map((step) => ({
        command: step.command,
        args: step.args,
      })),
    ).toEqual([{ command: 'npm', args: ['run', 'module:validate'] }]);
    expect(
      profileDocument.profiles['workflow-efficiency-post-apply'].map(
        (step) => ({ command: step.command, args: step.args }),
      ),
    ).toEqual([{ command: 'npm', args: ['run', 'module:validate'] }]);
  });

  it('uses owned temporary workspaces and official cleanup', () => {
    const workspace = read('tools/module-runner/lib/workspace.mjs');
    const cleanup = read('tools/module-runner/cleanup.mjs');
    const executor = read('tools/module-runner/execute.mjs');
    const packageRunner = read('tools/module-runner/package.mjs');
    const sourceCheck = read('tools/module-runner/check-sources.mjs');

    expect(workspace).toContain("resolve(tmpdir(), 'iw')");
    expect(workspace).not.toContain("resolve(root, '.iotw')");
    expect(workspace).toContain('WORKSPACE_MARKER');
    expect(workspace).toContain('IOT_MODULE_MIN_FREE_BYTES');
    expect(workspace).toContain(
      'Another module-runner workspace is active or stale',
    );
    expect(workspace).toContain('Refusing to clean unbounded workspace');
    expect(cleanup).toContain('listOwnedWorkspaces');
    expect(cleanup).toContain('isProcessAlive');
    expect(cleanup).toContain('assertClean(repo)');
    expect(cleanup).toContain("['worktree', 'prune']");
    expect(cleanup).toContain('includeLegacyWorktrees');
    expect(cleanup).toContain('Remaining registered');
    expect(cleanup).not.toContain('git clean');
    expect(cleanup).not.toContain('reset --hard');
    expect(packageJson.scripts['module:cleanup']).toBe(
      'node tools/module-runner/cleanup.mjs',
    );
    expect(executor).toContain('cleanupReport');
    expect(executor).toContain(
      'Workspace cleanup was verified before handoff creation',
    );
    expect(packageRunner).toContain('workspace: extraction');
    expect(packageRunner).toContain('workspaceTransferred');
    expect(sourceCheck).not.toContain('prettier');

    const frameworkContract = read(
      'test/module-execution-framework.contract.spec.ts',
    );
    expect(frameworkContract).not.toContain('spawnSync(');
    expect(frameworkContract).not.toContain(
      "['tools/module-runner/self-test.mjs']",
    );
  });

  it('keeps Development Kit workflow instructions aligned with the runner', () => {
    const systemInstructions = read(
      'AI-Development-Kit/agent/GEMINI-SYSTEM-INSTRUCTIONS.md',
    );
    const failureProtocol = read(
      'AI-Development-Kit/workflows/FAILURE-PROTOCOL.md',
    );
    const executionLoop = read(
      'AI-Development-Kit/workflows/AGENT-EXECUTION-LOOP.md',
    );
    const failedValidationPrompt = read(
      'AI-Development-Kit/prompts/97-FIX-FAILED-VALIDATION.md',
    );
    const resumePrompt = read(
      'AI-Development-Kit/prompts/98-RESUME-AFTER-NEW-SESSION.md',
    );
    const testingStandard = read('AI-Development-Kit/standards/TESTING.md');
    const devopsStandard = read('AI-Development-Kit/standards/DEVOPS.md');

    for (const document of [
      systemInstructions,
      failureProtocol,
      executionLoop,
      failedValidationPrompt,
    ]) {
      expect(document).toContain('first proven failure');
      expect(document).not.toContain('Maksimum tiga');
      expect(document).not.toContain('rerun smallest relevant command');
      expect(document).not.toContain('Edit repository directly');
    }

    expect(systemInstructions).toContain('satu clean dependency bootstrap');
    expect(systemInstructions).toContain('satu Full Jest');
    expect(systemInstructions).toContain(
      'satu Doctor authoritative di dalam official package',
    );
    expect(systemInstructions).toContain('`%TEMP%\\iw`');
    expect(executionLoop).toContain('OFFICIAL VALIDATION+COMMIT');
    expect(executionLoop).toContain(
      '`module:package` melakukan satu Doctor authoritative',
    );
    expect(resumePrompt).toContain('AUDIT ONLY');
    expect(resumePrompt).toContain('No repository changes made.');
    expect(testingStandard).toContain(
      'broad Full Jest dijalankan maksimal satu kali',
    );
    expect(devopsStandard).toContain('satu dependency bootstrap');
    expect(devopsStandard).toContain(
      'Stale workspace hanya dibersihkan oleh official automation',
    );

    const bootstrapPrompt = read(
      'AI-Development-Kit/prompts/00-BOOTSTRAP-REPOSITORY.md',
    );
    expect(bootstrapPrompt).toContain('exact-file payload');
    expect(bootstrapPrompt).toContain(
      'jangan edit branch main secara langsung',
    );
    expect(bootstrapPrompt).not.toContain(
      'Kerjakan file repository secara langsung',
    );

    for (let moduleNumber = 1; moduleNumber <= 30; moduleNumber += 1) {
      const modulePrompt = read(
        `AI-Development-Kit/prompts/MODULE-${String(moduleNumber).padStart(2, '0')}.md`,
      );
      expect(modulePrompt).toContain(
        'exact bounded candidate dan official repository workflow',
      );
      expect(modulePrompt).toContain(
        'Susun perubahan sebagai exact-file payload; jangan edit branch main secara langsung.',
      );
      expect(modulePrompt).toContain(
        'Jalankan hanya official validation profile sesuai urutan gate murah ke mahal.',
      );
      expect(modulePrompt).not.toContain('Kerjakan langsung pada repository');
      expect(modulePrompt).not.toContain(
        'Edit/buat file repository secara langsung.',
      );
    }
  });

  it('keeps quiet commands observable and fully logged', () => {
    const processRunner = read('tools/module-runner/lib/process.mjs');
    const validation = read('tools/module-runner/lib/validation.mjs');
    expect(processRunner).toContain('const heartbeat = setInterval');
    expect(processRunner).not.toContain('const heartbeat = stream');
    expect(validation).toContain('[module-runner] passed');
    expect(validation).toContain('stream,');
    expect(validation).toContain('log,');
  });
});
