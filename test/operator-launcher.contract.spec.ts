import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const readBytes = (path: string) => readFileSync(resolve(root, path));

describe('IoT Platform Safe Workflow Launcher v1 contract', () => {
  const operatorPath = 'tools/operator-launcher/operator.mjs';
  const cmdPaths = [
    'tools/operator-launcher/IoT-Platform-Control-Center.cmd',
    'tools/operator-launcher/Audit-Repository.cmd',
    'tools/operator-launcher/Show-Checkpoint.cmd',
    'tools/operator-launcher/Open-Project-Context.cmd',
    'tools/operator-launcher/Doctor-Manifest.cmd',
    'tools/operator-launcher/Validate-Baseline.cmd',
    'tools/operator-launcher/Create-Session-Handoff.cmd',
    'tools/operator-launcher/Open-Latest-Handoff.cmd',
  ];

  it('adds one thin operator layer over existing repository automation', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['operator:menu']).toBe(
      'node tools/operator-launcher/operator.mjs menu',
    );
    expect(packageJson.scripts['operator:audit']).toContain(operatorPath);
    expect(packageJson.scripts['operator:doctor']).toContain(operatorPath);
    expect(packageJson.scripts['operator:validate']).toContain(operatorPath);
    expect(packageJson.scripts['operator:handoff']).toContain(operatorPath);
    expect(packageJson.scripts).not.toHaveProperty('operator:execute');
    expect(packageJson.scripts).not.toHaveProperty('operator:push');
  });

  it('keeps version 1 free of repository mutation commands', () => {
    const operator = read(operatorPath);
    for (const forbidden of [
      'tools/module-runner/execute.mjs',
      'tools/module-runner/push.mjs',
      'module:complete',
      'module:activate',
      'module:slice',
      'git commit',
      'git add',
      'git push',
      'reset --hard',
      'git clean',
    ]) {
      expect(operator).not.toContain(forbidden);
    }
  });

  it('uses exact read-only Git checkpoint evidence and fails closed', () => {
    const operator = read(operatorPath);
    expect(operator).toContain("'status', '--porcelain=v1'");
    expect(operator).toContain("'branch', '--show-current'");
    expect(operator).toContain("'rev-parse', 'HEAD'");
    expect(operator).toContain("'rev-parse', 'origin/main'");
    expect(operator).toContain("'--left-right', '--count'");
    expect(operator).toContain(
      "throw new Error('Working tree must be clean.')",
    );
    expect(operator).toContain('STATUS: STOPPED');
  });

  it('delegates doctor and handoff to the official Module Execution Kit', () => {
    const operator = read(operatorPath);
    expect(operator).toContain('tools/module-runner/doctor.mjs');
    expect(operator).toContain('tools/module-runner/handoff.mjs');
    expect(operator).toContain("'local-unpushed'");
    expect(operator).toContain(
      'Remote-green status still requires exact CI evidence.',
    );
  });

  it('runs only official non-mutating baseline validation entrypoints', () => {
    const operator = read(operatorPath);
    expect(operator).toContain('tools/module-runner/check-sources.mjs');
    expect(operator).toContain('tools/module-runner/self-test.mjs');
    expect(operator).toContain(
      "['scripts/manage-module-state.mjs', 'validate']",
    );
    expect(operator).toContain(
      "['scripts/manage-module-state.mjs', 'simulate']",
    );
  });

  it('locks Windows launcher line endings through Git attributes', () => {
    const attributes = read('.gitattributes');
    expect(attributes).toContain('*.cmd text eol=crlf');
    expect(attributes).toContain('*.bat text eol=crlf');
  });

  it('keeps every Windows button CRLF and npm.cmd based', () => {
    for (const path of cmdPaths) {
      const bytes = readBytes(path);
      const text = bytes.toString('utf8');
      expect(text).toContain('\r\n');
      expect(text.replace(/\r\n/g, '')).not.toContain('\n');
      expect(text).toContain('npm.cmd run operator:');
      expect(text).not.toContain('powershell');
    }
  });

  it('documents the immutable workflow boundary through Module 30', () => {
    const documentation = read('docs/development/operator-launcher.md');
    expect(documentation).toContain(
      'does not introduce another lifecycle engine',
    );
    expect(documentation).toContain('Version 1 intentionally does not expose');
    expect(documentation).toContain('`module:execute`');
    expect(documentation).toContain('REMOTE-GREEN HANDOFF');
  });
});
