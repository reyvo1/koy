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
const validationProfiles = readJson<{
  profiles: Record<
    string,
    Array<{ label: string; command: string; args: string[] }>
  >;
}>('tools/module-runner/profiles/validation-profiles.json');

const implementation = read(
  'docs/module-10-mobile-read-only-dashboard-integration.md',
);
const client = read(
  'apps/user-mobile/src/dashboard/mobile-dashboard-client.ts',
);
const model = read('apps/user-mobile/src/dashboard/mobile-dashboard-model.ts');
const controller = read(
  'apps/user-mobile/src/dashboard/mobile-dashboard-controller.ts',
);
const screen = read('apps/user-mobile/src/ui/mobile-dashboard-screen.tsx');
const widget = read('apps/user-mobile/src/ui/mobile-dashboard-widget.tsx');
const appSource = read('apps/user-mobile/App.tsx');
const messages = read('apps/user-mobile/src/localization/messages.ts');

describe('Module 10 Slice 10.11 Mobile Read-Only Dashboard Integration', () => {
  it('preserves dashboard integration while Module 10 lifecycle advances', () => {
    for (const evidence of [
      '9880a3e098ab98cf217dd45e7f87ff67714ccce8',
      '29831494195',
      '8495556056',
      'cacdae2ab794172efc4f650d1a14f50269c7d464437ef065d8b824e58854e2d1',
    ]) {
      expect(implementation).toContain(evidence);
    }
  });

  it('uses the bounded read-only API sequence through the secure session gateway', () => {
    for (const endpoint of [
      '`/dashboards?limit=${DASHBOARD_LIMIT}`',
      '`/dashboards/${encodedDashboardId}`',
      '`/dashboards/${encodedDashboardId}/resolution`',
      '/widgets/${encodeURIComponent(',
      ')}/data`',
    ]) {
      expect(client).toContain(endpoint);
    }
    expect(client).toContain('WIDGET_QUERY_CONCURRENCY = 4');
    expect(client).toContain("widget.state !== 'READY'");
    expect(client).toContain('MobileApiError');
    expect(client).toContain('error.status === 401 || error.status === 403');
    expect(client).not.toMatch(/\/commands|mqtt:\/\/|rtsp:\/\//);
  });

  it('validates bounded normalized responses and fails closed', () => {
    for (const boundary of [
      'MAX_DASHBOARDS = 50',
      'MAX_LAYOUTS = 3',
      'MAX_WIDGETS = 100',
      'MAX_BINDINGS_PER_WIDGET = 16',
      'MAX_SAFE_OBJECT_BYTES = 16_384',
      'MobileDashboardValidationError',
    ]) {
      expect(model).toContain(boundary);
    }
    expect(client).toContain('MOBILE_DASHBOARD_RESPONSE_MISMATCH');
    expect(client).toContain('MOBILE_WIDGET_RESPONSE_MISMATCH');
    expect(controller).not.toContain('error.message');
  });

  it('renders accessible dashboard states with permission-aware controls', () => {
    expect(screen).toContain('accessibilityRole="button"');
    expect(screen).toContain('onRefresh');
    expect(screen).toContain('onSelectDashboard');
    expect(widget).toContain('accessibilityRole="summary"');
    expect(widget).toContain('accessibilityRole="progressbar"');
    expect(widget).toContain('dashboardCopy.switchDisabled');
    expect(widget).toContain('dashboardCopy.mapUnsupported');
    expect(messages).toContain('Kontrol tidak tersedia untuk akun atau binding ini');
    expect(messages).toContain('status aktual menunggu ACK/telemetry perangkat');
    expect(messages).toContain('Widget peta tetap fail-closed');
    expect(appSource).toContain('loadMobileDashboardState');
    expect(appSource).toContain("kind: 'idle'");
  });

  it('adds no dependency, native project, backend, or persistence change', () => {
    for (const forbidden of [
      'expo-router',
      '@react-navigation/native',
      'zustand',
      '@reduxjs/toolkit',
      'victory-native',
      'react-native-maps',
      'expo-camera',
      'expo-notifications',
    ]) {
      expect(mobilePackage.dependencies[forbidden]).toBeUndefined();
    }
    const trackedRepositoryTree = read('repository-tree.txt');
    expect(trackedRepositoryTree).not.toMatch(
      /^apps\/user-mobile\/(android|ios)\//m,
    );
    expect(existsSync(resolve(root, 'apps/user-mobile/eas.json'))).toBe(false);
    expect(implementation).toContain(
      'No dependency, lockfile, backend, Prisma, PostgreSQL, Redis, MQTT, CI-workflow, or deployment change',
    );
  });

  it('uses STANDARD validation without dependency reinstall or full local Jest', () => {
    const profile =
      validationProfiles.profiles['module-10-mobile-dashboard-integration'];
    const labels = profile.map((step) => step.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Expo public configuration validation',
        'Mobile TypeScript validation',
        'Focused mobile dashboard integration tests',
        'Repository non-mutating lint',
        'Module 10 suites',
        'Module lifecycle validation',
        'Module lifecycle simulation through Module 30',
      ]),
    );
    const indexOf = (label: string): number => labels.indexOf(label);
    expect(indexOf('Expo public configuration validation')).toBeLessThan(
      indexOf('Mobile TypeScript validation'),
    );
    expect(indexOf('Mobile TypeScript validation')).toBeLessThan(
      indexOf('Focused mobile dashboard integration tests'),
    );
    expect(indexOf('Focused mobile dashboard integration tests')).toBeLessThan(
      indexOf('Repository non-mutating lint'),
    );
    expect(indexOf('Repository non-mutating lint')).toBeLessThan(
      indexOf('Module 10 suites'),
    );
    expect(indexOf('Module 10 suites')).toBeLessThan(
      indexOf('Module lifecycle validation'),
    );
    expect(indexOf('Module lifecycle validation')).toBeLessThan(
      indexOf('Module lifecycle simulation through Module 30'),
    );
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toContain('npm ci');
    expect(serialized).not.toContain('prisma generate');
    expect(serialized).not.toContain('Full Jest suite');
    expect(
      validationProfiles.profiles[
        'module-10-mobile-dashboard-integration-post-apply'
      ],
    ).toEqual([
      expect.objectContaining({
        args: ['run', 'module:validate'],
        command: 'npm',
        label: 'Post-apply lifecycle validation',
      }),
    ]);
  });

  it('keeps mutations, commands, realtime, camera, Module 11, and deployment gated', () => {
    for (const boundary of [
      'dashboard create, replace, delete',
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
