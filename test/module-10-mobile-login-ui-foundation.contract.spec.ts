import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');
const readJson = <T>(relativePath: string): T =>
  JSON.parse(read(relativePath)) as T;

const mobilePackage = readJson<{ dependencies: Record<string, string> }>(
  'apps/user-mobile/package.json',
);
const implementation = read('docs/module-10-mobile-login-ui-foundation.md');
const dashboardImplementation = read(
  'docs/module-10-mobile-read-only-dashboard-integration.md',
);
const appSource = read('apps/user-mobile/App.tsx');
const loginScreen = read('apps/user-mobile/src/ui/mobile-login-screen.tsx');
const authenticatedShell = read(
  'apps/user-mobile/src/ui/mobile-authenticated-shell.tsx',
);
const controller = read('apps/user-mobile/src/app/mobile-auth-controller.ts');
const controllerTests = read(
  'apps/user-mobile/src/app/mobile-auth-controller.spec.ts',
);
const messages = read('apps/user-mobile/src/localization/messages.ts');

const loginSources = [loginScreen, controller, messages].join('\n');

describe('Module 10 Slice 10.11 Mobile Login UI Foundation', () => {
  it('preserves the exact login checkpoint while Module 10 lifecycle advances', () => {
    for (const evidence of [
      '9880a3e098ab98cf217dd45e7f87ff67714ccce8',
      '29831494195',
      '8495556056',
      'cacdae2ab794172efc4f650d1a14f50269c7d464437ef065d8b824e58854e2d1',
    ]) {
      expect(implementation).toContain(evidence);
    }
    expect(implementation).toContain(
      'completed and green remotely at exact commit `9880a3e098ab98cf217dd45e7f87ff67714ccce8`',
    );
    expect(dashboardImplementation).toContain(
      'existing authenticated mobile shell',
    );
  });

  it('keeps the proven login and secure-session boundary unchanged', () => {
    expect(appSource).toContain('mobileSessionClient');
    expect(appSource).toContain('bootstrapMobileAuth');
    expect(appSource).toContain('loginMobileAuth');
    expect(appSource).toContain('logoutMobileAuth');
    expect(mobilePackage.dependencies['expo-secure-store']).toBe('~57.0.1');

    for (const forbidden of [
      'expo-router',
      '@react-navigation/native',
      'zustand',
      '@reduxjs/toolkit',
      'react-hook-form',
      'expo-notifications',
      'expo-camera',
    ]) {
      expect(mobilePackage.dependencies[forbidden]).toBeUndefined();
    }

    const trackedRepositoryTree = read('repository-tree.txt');
    expect(trackedRepositoryTree).not.toMatch(
      /^apps\/user-mobile\/(android|ios)\//m,
    );
    expect(existsSync(resolve(root, 'apps/user-mobile/eas.json'))).toBe(false);
  });

  it('preserves accessible Indonesian-first credential handling without exposing session material', () => {
    expect(messages).toContain("defaultMobileLocale: MobileLocale = 'id'");
    expect(messages).toContain('en: {');
    expect(loginScreen).toContain('accessibilityLabel');
    expect(loginScreen).toContain('accessibilityRole="header"');
    expect(loginScreen).toContain('accessibilityState');
    expect(loginScreen).toContain('secureTextEntry');
    expect(loginScreen).toContain('autoComplete="current-password"');
    expect(loginScreen).toContain("setPassword('')");

    for (const forbidden of [
      'accessToken',
      'refreshToken',
      'AsyncStorage',
      'localStorage',
      'sessionStorage',
      'console.log',
    ]) {
      expect(loginSources).not.toContain(forbidden);
    }
    expect([loginScreen, controller].join('\n')).not.toContain('/dashboards');
    expect([loginScreen, controller].join('\n')).not.toContain('/telemetry');
  });

  it('composes dashboard reads outside the login controller and login screen', () => {
    expect(appSource).toContain('loadMobileDashboardState');
    expect(authenticatedShell).toContain('dashboardState');
    expect(loginScreen).not.toContain('/dashboards');
    expect(controller).not.toContain('/dashboards');
    expect(controller).not.toContain('requestJson');
  });

  it('keeps bounded login and storage error mapping', () => {
    for (const phrase of [
      'MOBILE_SECURE_STORAGE_',
      'MOBILE_API_UNREACHABLE',
      'MOBILE_LOGIN_INPUT_INVALID',
      'error.status === 401',
      'error.status === 429',
      'requestId: error.requestId',
    ]) {
      expect(controller).toContain(phrase);
    }
    expect(controller).not.toContain('error.message');
    expect(controllerTests).toContain('without exposing backend payloads');
    expect(controllerTests).toContain('offline login notice');
    expect(controllerTests).toContain('rate limiting');
  });

  it('keeps command, realtime, camera, Module 11, and deployment gated', () => {
    for (const boundary of [
      'command publication',
      'SSE, WebSocket, direct MQTT',
      'barcode or QR scanning',
      'CCTV, RTSP, ONVIF',
      'Module 11 activation',
      'production deployment approval',
    ]) {
      expect(dashboardImplementation).toContain(boundary);
    }

    expect([appSource, authenticatedShell].join('\n')).not.toMatch(
      /\/commands|mqtt:\/\/|rtsp:\/\//,
    );
  });

});
