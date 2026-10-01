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
    expect(app.dependencies.next).toBe('16.3.8');
    expect(app.dependencies.react).toBe('19.2.7');
    expect(app.dependencies['react-dom']).toBe('19.2.7');
    expect(app.dependencies['@iot-platform/design-system']).toBe('0.0.0');
    expect(app.scripts.build).toBe('next build');
  });

  it.each([
    'apps/admin-web/components/super-admin-shell.tsx',
    'apps/admin-web/components/tenant-shell.tsx',
    'apps/admin-web/components/admin-shell-v3.tsx',
  ])('gives every navigation group in %s a unique label', (path) => {
    // AppShell keys each rendered group by its label, so a repeated label is a React
    // duplicate-key error: one of the two groups is dropped from the reconciliation tree and
    // the sidebar silently loses a section. It is only visible in a real browser console.
    const labels = [...read(path).matchAll(/^\s{4}label: '([^']+)',$/gm)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('keys the shared shell groups by something stable rather than their display text', () => {
    const shell = read('apps/admin-web/components/app-shell.tsx');
    expect(shell).toContain('key={group.label}');
    expect(shell).toContain('key={item.href}');
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
    expect(styles).toContain('prefers-reduced-motion: no-preference');
  });

  it('ships dark as the default theme and keeps light available as an explicit opt-in', () => {
    const styles = read('packages/design-system/src/styles.css');

    // This contract used to assert the literal string `prefers-color-scheme: dark`, which
    // pinned the *mechanism* rather than the outcome. Gating the dark palette behind the
    // operating system meant an admin on a light-mode OS got a light admin console while a
    // colleague on dark mode got a dark one — the same product rendering two ways. Dark is
    // now the default token set (UI-DESIGN-SYSTEM.md §2, dark-mode-first) and light is an
    // explicit [data-theme="light"] opt-in for the user-facing surfaces.
    expect(styles).toMatch(/:root,\s*\[data-theme='dark'\]/);
    expect(styles).toContain("[data-theme='light']");
    // The OS preference must not be able to flip the admin console any more.
    expect(styles).not.toContain('prefers-color-scheme: dark');
  });

  it('exposes one shared token vocabulary instead of per-app colour literals', () => {
    const styles = read('packages/design-system/src/styles.css');
    const adminAdapter = read('apps/admin-web/app/design-system-v2.css');
    const adminGlobals = read('apps/admin-web/app/globals.css');

    // Every primitive the console chrome needs must exist as a token or a class in the shared
    // package, so admin-web only has to map onto them.
    for (const token of [
      '--iot-color-bg',
      '--iot-color-surface',
      '--iot-color-border',
      '--iot-color-accent',
      '--iot-radius-lg',
      '--iot-shadow-surface',
      '--iot-space-6',
      '--iot-text-md',
      '--iot-sidebar-width',
      '--iot-content-width',
    ]) {
      expect(styles).toContain(token);
    }

    for (const primitive of [
      '.iot-panel',
      '.iot-page-header',
      '.iot-stat',
      '.iot-skeleton',
      '.iot-table',
      '.iot-badge',
      '.iot-empty',
      '.iot-field',
    ]) {
      expect(styles).toContain(primitive);
    }

    // The admin adapter must derive from those tokens, never re-declare a colour, and must
    // not re-define `.iot-button` — that class is owned by the shared package. Matching the
    // selector at the start of a line keeps prose in a comment from tripping the guard.
    expect(adminAdapter).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(adminAdapter).not.toMatch(/^\s*\.iot-button[\s,{]/m);
    expect(adminGlobals).not.toMatch(/--bg-app|--bg-card|--text-main|--accent-deep/);
  });

  it('renders every console surface through one shared application shell', () => {
    const appShell = read('apps/admin-web/components/app-shell.tsx');
    const tenantShell = read('apps/admin-web/components/tenant-shell.tsx');
    const superShell = read('apps/admin-web/components/super-admin-shell.tsx');
    const fieldShell = read('apps/admin-web/components/admin-shell-v3.tsx');

    // One shell owns the frame. Each role shell passes navigation data, not markup, so a new
    // role cannot reintroduce a second frame that drifts from the rest.
    for (const shell of [tenantShell, superShell, fieldShell]) {
      expect(shell).toContain('AppShell');
      expect(shell).toContain('RoleGate');
    }

    // Collapse, mobile drawer and the width tokens are shell concerns, not per-role concerns.
    expect(appShell).toContain('lg:flex');
    expect(appShell).toContain('lg:hidden');
    expect(appShell).toContain('--iot-sidebar-width-collapsed');

    // No shell may carry a colour literal; that is what made the consoles look like two
    // different products.
    for (const shell of [appShell, tenantShell, superShell, fieldShell]) {
      expect(shell).not.toMatch(/#[0-9a-fA-F]{6}/);
    }
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
