import { readFileSync } from 'fs';
import { join } from 'path';

const readRepositoryFile = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('CI dependency bootstrap recovery contract', () => {
  const workflow = readRepositoryFile('.github/workflows/ci.yml');
  const bootstrap = readRepositoryFile(
    'ops/scripts/ci-bootstrap-dependencies.sh',
  );

  it('delegates dependency installation to the bounded bootstrap script', () => {
    expect(workflow).toMatch(
      /-\s+name:\s+Bootstrap dependencies\s*\n\s+timeout-minutes:\s+10\s*\n\s+run:\s+bash ops\/scripts\/ci-bootstrap-dependencies\.sh/,
    );
  });

  it('does not use setup-node npm caching for the recovery slice', () => {
    expect(workflow).not.toMatch(/^\s+cache:\s*npm\s*$/m);
    expect(workflow).not.toMatch(/^\s+cache-dependency-path:/m);
  });

  it('runs a directly invoked pinned npm CLI with fresh bounded diagnostics', () => {
    expect(bootstrap).toContain(
      'PINNED_NPM_VERSION="${CI_BOOTSTRAP_NPM_VERSION:-10.8.0}"',
    );
    expect(bootstrap).toContain('npm pack "npm@${PINNED_NPM_VERSION}"');
    expect(bootstrap).toContain('node "${PINNED_NPM_CLI}" ci');
    expect(bootstrap).toContain('--ignore-scripts');
    expect(bootstrap).toContain('npm_config_maxsockets=8');
    expect(bootstrap).toContain('--dns-result-order=ipv4first');
    expect(bootstrap).toContain('run_bounded');
    expect(bootstrap).toContain('dump_npm_diagnostics');
    expect(bootstrap).not.toContain('npm audit fix --force');
  });

});
describe('CI package-lock registry provenance', () => {
  it('rejects environment-specific registry provenance in the lockfile', () => {
    const packageLock = readRepositoryFile('package-lock.json');

    expect(packageLock).not.toMatch(
      /applied-caas-gateway|internal\.api\.openai\.org|artifactory\/api\/npm\/npm-public/i,
    );
  });

  it('fails fast if private registry provenance returns', () => {
    const bootstrap = readRepositoryFile(
      'ops/scripts/ci-bootstrap-dependencies.sh',
    );

    expect(bootstrap).toContain('assert_public_lockfile_registry()');
    expect(bootstrap).toContain('assert_public_lockfile_registry');
    expect(bootstrap).toContain('npm_config_replace_registry_host');
  });
});
