import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Node runtime contract', () => {
  it('pins the validated Node and npm toolchain', () => {
    const packageJson = JSON.parse(readRepositoryFile('package.json')) as {
      engines?: Record<string, string>;
      packageManager?: string;
    };

    expect(readRepositoryFile('.nvmrc').trim()).toBe('22.23.1');
    expect(readRepositoryFile('.node-version').trim()).toBe('22.23.1');
    expect(packageJson.engines).toEqual({
      node: '>=22 <23',
      npm: '>=10 <11',
    });
    expect(packageJson.packageManager).toBe('npm@10.9.8');
  });

  it('uses the same runtime contract in GitHub Actions', () => {
    const workflow = readRepositoryFile('.github/workflows/ci.yml');

    expect(workflow).toContain("node-version-file: '.nvmrc'");
    expect(workflow).not.toContain('node-version: 20');
    expect(workflow).not.toContain('node-version: 24');
  });
});
