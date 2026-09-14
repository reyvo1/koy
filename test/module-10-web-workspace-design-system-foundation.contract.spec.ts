import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const json = <T>(path: string): T => JSON.parse(read(path)) as T;

describe('Module 10 Slice 10.6 web workspace and design-system foundation contract', () => {
  it('declares explicit isolated npm workspaces without moving the backend', () => {
    const rootPackage = json<{
      workspaces: string[];
      scripts: Record<string, string>;
    }>('package.json');

    expect(rootPackage.workspaces).toEqual([
      'apps/admin-web',
      'apps/user-web',
      'apps/user-mobile',
      'packages/design-system',
    ]);
    expect(rootPackage.scripts['web:typecheck']).toContain(
      '@iot-platform/design-system',
    );
    expect(rootPackage.scripts['web:build']).toContain(
      '@iot-platform/admin-web',
    );
    expect(rootPackage.scripts['lint:check']).toContain('packages');
    expect(rootPackage.scripts['lint:check']).toContain('tsx');
    expect(read('src/app.module.ts')).toContain('@Module');
  });

  it.each([
    ['apps/admin-web/package.json', '@iot-platform/admin-web'],
    ['apps/user-web/package.json', '@iot-platform/user-web'],
  ])('pins the approved Next.js App Router stack in %s', (path, name) => {
    const app = json<{
      name: string;
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    }>(path);

    expect(app.name).toBe(name);
    expect(app.dependencies.next).toBe('16.2.10');
    expect(app.dependencies.react).toBe('19.2.7');
    expect(app.dependencies['react-dom']).toBe('19.2.7');
    expect(app.dependencies['@iot-platform/design-system']).toBe('0.0.0');
    expect(app.scripts.build).toBe('next build');
  });

  it('keeps the committed lockfile portable through the public npm registry', () => {
    const lock = json<{
      packages: Record<string, { resolved?: string }>;
    }>('package-lock.json');

    const absoluteResolvedUrls = Object.values(lock.packages)
      .map((entry) => entry.resolved)
      .filter(
        (resolved): resolved is string =>
          typeof resolved === 'string' && /^https?:\/\//i.test(resolved),
      );

    expect(absoluteResolvedUrls.length).toBeGreaterThan(0);
    for (const resolved of absoluteResolvedUrls) {
      expect(new URL(resolved).hostname).toBe('registry.npmjs.org');
    }
    expect(read('package-lock.json')).not.toMatch(
      /applied-caas-gateway|internal\.api\.openai\.org/i,
    );
  });

  it('provides bounded accessible shared state primitives', () => {
    const source = read('packages/design-system/src/index.tsx');
    const styles = read('packages/design-system/src/styles.css');

    for (const state of [
      'loading',
      'empty',
      'stale',
      'unauthorized',
      'offline',
      'error',
    ]) {
      expect(source).toContain(`'${state}'`);
    }
    expect(source).toContain('Skip to main content');
    expect(source).toContain("role={isAlert ? 'alert' : 'status'}");
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('prefers-color-scheme: dark');
    expect(styles).toContain('prefers-reduced-motion: no-preference');
  });

  it('keeps protocol, credential, and backend authorization concerns out of clients', () => {
    const clientSource = [
      read('apps/admin-web/app/page.tsx'),
      read('apps/user-web/app/page.tsx'),
      read('packages/design-system/src/index.tsx'),
    ].join('\n');

    expect(clientSource).not.toMatch(/mqtt:\/\/|mqtts:\/\/|rtsp:\/\//i);
    expect(clientSource).not.toMatch(/authorization\s*:/i);
    expect(clientSource).not.toMatch(/tenantId\s*[:=]/i);
    expect(clientSource).not.toMatch(
      /deviceCredential|brokerCredential|cameraCredential/i,
    );
  });

  it('wires non-mutating CI validation and records the lifecycle boundary', () => {
    const workflow = read('.github/workflows/ci.yml');

    expect(workflow).toContain('npm run web:typecheck');
    expect(workflow).toContain('npm run web:build');
    expect(workflow).toContain('Build backend');
    expect(read('scripts/build-production-release.mjs')).toContain(
      'delete packageJson.workspaces',
    );
    expect(read('scripts/verify-production-release.mjs')).toContain(
      'Backend release must not retain workspace metadata',
    );
  });

  it('documents the explicit out-of-scope boundary and next gated slice', () => {
    const docs = read(
      'docs/module-10-web-workspace-design-system-foundation.md',
    );

    expect(docs).toContain('backend remains authoritative');
    expect(docs).toContain('connect directly to MQTT');
    expect(docs).toContain('Slice 10.7 User Web Dynamic Dashboard');
    expect(docs).toMatch(/production deployment remain outside/i);
  });

});
