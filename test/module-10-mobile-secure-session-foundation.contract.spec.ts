import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');
const readJson = <T>(relativePath: string): T =>
  JSON.parse(read(relativePath)) as T;

const mobilePackage = readJson<{
  dependencies: Record<string, string>;
}>('apps/user-mobile/package.json');

const mobileTsconfig = readJson<{
  exclude?: string[];
}>('apps/user-mobile/tsconfig.json');

const validationProfiles = readJson<{
  profiles: Record<
    string,
    Array<{ label: string; command: string; args: string[] }>
  >;
}>('tools/module-runner/profiles/validation-profiles.json');

const implementation = read(
  'docs/module-10-mobile-secure-session-foundation.md',
);
const appConfig = read('apps/user-mobile/app.config.ts');
const appSource = read('apps/user-mobile/App.tsx');
const secureStore = read(
  'apps/user-mobile/src/session/secure-session-store.ts',
);
const expoStore = read(
  'apps/user-mobile/src/session/expo-secure-session-store.ts',
);
const sessionClient = read(
  'apps/user-mobile/src/session/mobile-session-client.ts',
);
const sessionModel = read('apps/user-mobile/src/session/session-model.ts');

const sessionSources = [
  secureStore,
  expoStore,
  sessionClient,
  sessionModel,
].join('\n');

describe('Module 10 Slice 10.11 Mobile Secure Session Foundation', () => {
  it('preserves the secure-session foundation while Module 10 lifecycle advances', () => {
    expect(implementation).toContain(
      '0cb1cef15dc824081929baa127faca21b570cd7e',
    );
    expect(implementation).toContain('29824946401');
    expect(implementation).toContain('8492983648');
    expect(implementation).toContain(
      'e1a0a3e8891298d4923d88af6606ab16f50ed87b72656ec15ba6ae3ef9c1773e',
    );
  });

  it('adds only the Expo SDK 57 secure-storage native dependency and config plugin', () => {
    expect(mobilePackage.dependencies['expo-secure-store']).toBe('~57.0.1');
    expect(appConfig).toContain("'expo-secure-store'");
    expect(appConfig).toContain('configureAndroidBackup: true');
    expect(read('package-lock.json')).toContain(
      'https://registry.npmjs.org/expo-secure-store/-/expo-secure-store-57.0.1.tgz',
    );

    for (const forbidden of [
      '@react-native-async-storage/async-storage',
      'expo-router',
      '@react-navigation/native',
      'zustand',
      '@reduxjs/toolkit',
      'expo-notifications',
      'expo-camera',
      'expo-barcode-scanner',
    ]) {
      expect(mobilePackage.dependencies[forbidden]).toBeUndefined();
    }

    const trackedRepositoryTree = read('repository-tree.txt');
    expect(trackedRepositoryTree).not.toMatch(
      /^apps\/user-mobile\/(android|ios)\//m,
    );
    expect(existsSync(resolve(root, 'apps/user-mobile/eas.json'))).toBe(false);
  });

  it('stores one versioned and bounded session record in platform secure storage', () => {
    expect(secureStore).toContain(
      "MOBILE_SECURE_SESSION_KEY = 'iot-platform.mobile.session.v1'",
    );
    expect(secureStore).toContain('version: MOBILE_SECURE_SESSION_VERSION');
    expect(secureStore).toContain('JSON.stringify(stored)');
    expect(secureStore).toContain('isAvailableAsync');
    expect(secureStore).toContain('deleteItemAsync');
    expect(expoStore).toContain("from 'expo-secure-store'");
    expect(sessionModel).toContain('MAX_MOBILE_TOKEN_LENGTH');
    expect(sessionModel).toContain('MAX_MOBILE_TENANT_ID_LENGTH');
    expect(sessionSources).not.toMatch(
      /AsyncStorage|localStorage|sessionStorage/,
    );
    expect(sessionSources).not.toMatch(/console\.(log|warn|error)/);
  });

  it('binds login, authorization, refresh, and logout to the validated API origin', () => {
    for (const phrase of [
      "fetchJson('/auth/login'",
      "fetchJson('/auth/refresh'",
      "'/auth/logout'",
      "headers.set('authorization'",
      "headers.set('x-tenant-id'",
      'validatePublicApiOrigin',
      "pathname.startsWith('//')",
      'url.origin !== this.apiOrigin',
    ]) {
      expect(sessionClient).toContain(phrase);
    }

    expect(sessionClient).toContain('private refreshPromise');
    expect(sessionClient).toContain('refreshAfterUnauthorized');
    expect(sessionClient).toContain('this.options.sessionStore.replace');
    expect(sessionClient).toContain('await this.clearSession()');
    expect(sessionClient).toContain('status === 403');
    expect(
      read('apps/user-mobile/src/session/mobile-session-client.spec.ts'),
    ).toContain('preserves an authoritative 403');
    expect(sessionClient).not.toMatch(/mqtt:\/\/|mqtts:\/\/|rtsp:\/\//);
  });

  it('records the secure-session checkpoint as completed and exposes only its bounded summary to the login UI', () => {
    const loginUi = read('docs/module-10-mobile-login-ui-foundation.md');

    expect(implementation).toContain(
      'completed and green remotely at exact commit `0cb1cef15dc824081929baa127faca21b570cd7e`',
    );
    expect(implementation).toContain(
      'the separately approved login UI checkpoint consumes the proven session summary',
    );
    expect(appSource).toContain('mobileSessionClient');
    expect(appSource).toContain('MobileLoginScreen');
    expect(appSource).toContain('MobileAuthenticatedShell');
    expect(loginUi).toContain('secure-session restoration');

    for (const forbidden of [
      'accessToken',
      'refreshToken',
      '/commands',
      'requestJson',
    ]) {
      expect(appSource).not.toContain(forbidden);
    }
  });

  it('proves the secure session behavior with focused unit and contract tests', () => {
    for (const path of [
      'apps/user-mobile/src/session/secure-session-store.spec.ts',
      'apps/user-mobile/src/session/mobile-session-client.spec.ts',
    ]) {
      expect(existsSync(resolve(root, path))).toBe(true);
    }
    expect(mobileTsconfig.exclude).toContain('src/**/*.spec.ts');

    const profile =
      validationProfiles.profiles['module-10-mobile-secure-session'];
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
        'Expo dependency compatibility',
        'Expo public configuration validation',
        'Mobile TypeScript validation',
        'Focused mobile secure session tests',
        'Prisma client generation',
        'Full Jest suite once for the exact candidate',
      ]),
    );
    const indexOf = (label: string): number => labels.indexOf(label);
    expect(
      indexOf('Pre-dependency Module Execution Kit self-test'),
    ).toBeLessThan(indexOf('Clean dependency bootstrap'));
    expect(indexOf('Module Execution Kit source checks')).toBeLessThan(
      indexOf('Clean dependency bootstrap'),
    );
    expect(indexOf('Repository non-mutating lint')).toBeLessThan(
      indexOf('Current lifecycle validation'),
    );
    expect(indexOf('Current lifecycle validation')).toBeLessThan(
      indexOf('Lifecycle simulation through Module 30'),
    );
    expect(indexOf('Lifecycle simulation through Module 30')).toBeLessThan(
      indexOf('Expo dependency compatibility'),
    );
    expect(indexOf('Mobile TypeScript validation')).toBeLessThan(
      indexOf('Focused mobile secure session tests'),
    );
    expect(labels.indexOf('Changed TypeScript formatting check')).toBeLessThan(
      labels.indexOf('Repository non-mutating lint'),
    );
    expect(labels.indexOf('Expo dependency compatibility')).toBeLessThan(
      labels.indexOf('Full Jest suite once for the exact candidate'),
    );
    expect(
      validationProfiles.profiles['module-10-mobile-secure-session-post-apply'],
    ).toEqual([
      expect.objectContaining({
        args: ['run', 'module:validate'],
        command: 'npm',
        label: 'Post-apply lifecycle validation',
      }),
    ]);
  });

  it('keeps dashboard, command, realtime, camera, Module 11, and deployment work gated', () => {
    for (const boundary of [
      'login form, navigation, session context provider',
      'dashboard API consumption from `App.tsx`',
      'command publication',
      'SSE, WebSocket, direct MQTT',
      'barcode or QR scanning',
      'CCTV, RTSP, ONVIF',
      'Module 11 activation',
      'production deployment approval',
    ]) {
      expect(implementation).toContain(boundary);
    }
  });
});
