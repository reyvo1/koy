import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

const originValidatorPath = resolve(
  root,
  'apps/user-mobile/src/config/public-api-origin.cjs',
);

type OriginValidationResult =
  { ok: true; value: string } | { ok: false; error: string };

const validateOrigins = (
  values: Array<string | null>,
): OriginValidationResult[] => {
  const script = `
    const validator = require(process.argv[1]);
    const values = JSON.parse(process.argv[2]);
    const results = values.map((value) => {
      try {
        return {
          ok: true,
          value: validator.validatePublicApiOrigin(value === null ? undefined : value),
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    process.stdout.write(JSON.stringify(results));
  `;
  const result = spawnSync(
    process.execPath,
    ['-e', script, originValidatorPath, JSON.stringify(values)],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Origin validator child process failed.');
  }

  return JSON.parse(result.stdout) as OriginValidationResult[];
};
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');
const readJson = <T>(relativePath: string): T =>
  JSON.parse(read(relativePath)) as T;

const rootPackage = readJson<{
  scripts: Record<string, string>;
  workspaces: string[];
}>('package.json');

const mobilePackage = readJson<{
  name: string;
  main: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}>('apps/user-mobile/package.json');

const validationProfiles = readJson<{
  profiles: Record<
    string,
    Array<{ label: string; command: string; args: string[] }>
  >;
}>('tools/module-runner/profiles/validation-profiles.json');

const implementation = read('docs/module-10-mobile-workspace-foundation.md');
const contract = read('docs/module-10-mobile-foundation-dynamic-dashboard.md');
const appSource = read('apps/user-mobile/App.tsx');
const appConfig = read('apps/user-mobile/app.config.ts');
const messages = read('apps/user-mobile/src/localization/messages.ts');

describe('Module 10 Slice 10.11 Mobile Workspace Foundation', () => {
  it('preserves the completed workspace while Module 10 lifecycle advances', () => {
    expect(implementation).toContain(
      '24eda56fc5b384a80a2b1c736021d9f9b76fb62e',
    );
    expect(implementation).toContain(
      'd946c741aa488178f692b5c6b9bcf66ab5ab70f2',
    );
    expect(implementation).toContain('29819923410');
    expect(implementation).toContain('8490998211');
    expect(implementation).toContain(
      'e40baa357f499635011b87155f1f2fba558cd2659310825f6d36e1e020910713',
    );
  });

  it('adds exactly one isolated mobile workspace with pinned Expo SDK 57 dependencies', () => {
    expect(rootPackage.workspaces).toEqual([
      'apps/admin-web',
      'apps/user-web',
      'apps/user-mobile',
      'packages/design-system',
    ]);
    expect(mobilePackage.name).toBe('@iot-platform/user-mobile');
    expect(mobilePackage.main).toBe('index.ts');
    expect(mobilePackage.dependencies).toEqual({
      expo: '57.0.7',
      'expo-dev-client': '57.0.7',
      'expo-secure-store': '~57.0.1',
      'expo-system-ui': '~57.0.1',
      react: '19.2.3',
      'react-native': '0.86.0',
    });
    expect(mobilePackage.devDependencies).toEqual({
      '@types/react': '~19.2.4',
      typescript: '6.0.3',
    });

    const lockfile = read('package-lock.json');
    expect(lockfile).toContain(
      'https://registry.npmjs.org/expo/-/expo-57.0.7.tgz',
    );
    expect(lockfile).not.toMatch(
      /applied-caas-gateway|internal\.api\.openai\.org/,
    );
    expect(mobilePackage.scripts.start).toBe('expo start --dev-client');
    expect(mobilePackage.scripts.android).toBe('expo run:android');
    expect(mobilePackage.scripts.ios).toBe('expo run:ios');
  });

  it('keeps non-approved mobile libraries and generated native projects absent', () => {
    const allDependencies = {
      ...mobilePackage.dependencies,
      ...mobilePackage.devDependencies,
    };

    for (const dependency of [
      'expo-router',
      '@react-native-async-storage/async-storage',
      '@react-navigation/native',
      'zustand',
      '@reduxjs/toolkit',
      'react-native-svg',
      'expo-notifications',
      'expo-camera',
      'expo-barcode-scanner',
    ]) {
      expect(allDependencies[dependency]).toBeUndefined();
    }

    const trackedRepositoryTree = read('repository-tree.txt');
    expect(trackedRepositoryTree).not.toMatch(
      /^apps\/user-mobile\/(android|ios)\//m,
    );
    expect(existsSync(resolve(root, 'apps/user-mobile/eas.json'))).toBe(false);
  });

  it('validates HTTPS origins and permits only explicit loopback HTTP development origins', () => {
    const inputs: Array<string | null> = [
      null,
      'https://api.example.com/',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
      'not-a-url',
      'http://api.example.com',
      'https://user:secret@api.example.com',
      'https://api.example.com/v1',
      'https://api.example.com?tenant=1',
      'https://api.example.com#fragment',
    ];
    const results = validateOrigins(inputs);

    expect(results.slice(0, 5)).toEqual([
      { ok: true, value: 'http://127.0.0.1:3000' },
      { ok: true, value: 'https://api.example.com' },
      { ok: true, value: 'http://localhost:3000' },
      { ok: true, value: 'http://127.0.0.1:3000' },
      { ok: true, value: 'http://[::1]:3000' },
    ]);
    for (const result of results.slice(5)) {
      expect(result.ok).toBe(false);
    }
  });

  it('exposes only the normalized API origin through Expo public configuration', () => {
    expect(appConfig).toContain('EXPO_PUBLIC_API_BASE_URL');
    expect(appConfig).toContain('validatePublicApiOrigin');
    expect(appConfig).toContain('apiBaseUrl');
    expect(appConfig).not.toMatch(/accessToken|refreshToken|password|secret/i);
    expect(read('apps/user-mobile/.env.example')).toContain(
      'EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000',
    );
  });

  it('preserves the completed workspace foundation while later mobile checkpoints compose around it', () => {
    const loginUi = read('docs/module-10-mobile-login-ui-foundation.md');

    expect(messages).toContain("defaultMobileLocale: MobileLocale = 'id'");
    expect(messages).toContain('en: {');
    expect(appSource).toContain('MobileLoginScreen');
    expect(appSource).toContain('MobileAuthenticatedShell');
    expect(appSource).toContain('mobileSessionClient');
    expect(implementation).toContain(
      'This implementation checkpoint is completed',
    );
    expect(implementation).toContain(
      '24eda56fc5b384a80a2b1c736021d9f9b76fb62e',
    );
    expect(loginUi).toContain(
      'completed and green remotely at exact commit `9880a3e098ab98cf217dd45e7f87ff67714ccce8`',
    );

    for (const forbidden of [
      '/commands',
      'mqtt://',
      'ws://',
      'rtsp://',
      'requestJson',
    ]) {
      expect(appSource).not.toContain(forbidden);
    }
  });

  it('adds mobile validation without weakening the existing web and repository gates', () => {
    expect(rootPackage.scripts['mobile:config:validate']).toBe(
      'npm run config:validate --workspace @iot-platform/user-mobile',
    );
    expect(rootPackage.scripts['mobile:typecheck']).toBe(
      'npm run typecheck --workspace @iot-platform/user-mobile',
    );
    expect(rootPackage.scripts['mobile:validate']).toContain(
      'mobile:config:validate',
    );
    expect(rootPackage.scripts['web:typecheck']).toContain(
      'npm run mobile:validate',
    );

    const profile = validationProfiles.profiles['module-10-mobile-workspace'];
    expect(profile).toBeDefined();
    const labels = profile.map((step) => step.label);
    for (const label of [
      'Pre-dependency Module Execution Kit self-test',
      'Module Execution Kit source checks',
      'Clean dependency bootstrap',
      'Changed TypeScript formatting check',
      'Repository non-mutating lint',
      'Current lifecycle validation',
      'Lifecycle simulation through Module 30',
      'Expo dependency compatibility',
      'Expo public configuration validation',
      'Mobile TypeScript validation',
      'Prisma client generation',
      'Full Jest suite once for the exact candidate',
    ]) {
      expect(labels).toContain(label);
    }

    expect(
      labels.indexOf('Pre-dependency Module Execution Kit self-test'),
    ).toBeLessThan(labels.indexOf('Clean dependency bootstrap'));
    expect(labels.indexOf('Changed TypeScript formatting check')).toBeLessThan(
      labels.indexOf('Repository non-mutating lint'),
    );
    expect(labels.indexOf('Repository non-mutating lint')).toBeLessThan(
      labels.indexOf('Prisma client generation'),
    );
    expect(labels.indexOf('Expo dependency compatibility')).toBeLessThan(
      labels.indexOf('Prisma client generation'),
    );
    expect(labels).not.toContain('Current Module 10 suites');
    expect(labels).not.toContain('Repository contract suites');

    expect(
      validationProfiles.profiles['module-10-mobile-workspace-post-apply'],
    ).toEqual([
      expect.objectContaining({
        label: 'Post-apply lifecycle validation',
        command: 'npm',
        args: ['run', 'module:validate'],
      }),
    ]);
  });

  it('preserves the governing contract and all later boundaries', () => {
    expect(contract).toContain('contract checkpoint is completed');
    expect(contract).toContain('The contract remains binding');
    expect(implementation).toContain(
      'This implementation checkpoint is completed',
    );
    expect(implementation).toContain(
      'docs/module-10-mobile-secure-session-foundation.md',
    );
    expect(implementation).toContain('No router, state-management library');
    expect(implementation).toContain(
      'Native Android development-build proof remains required',
    );
    expect(implementation).toContain(
      'Module 11 activation or production deployment approval',
    );
  });
});
