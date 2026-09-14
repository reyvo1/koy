import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

const contract = read('docs/module-10-mobile-foundation-dynamic-dashboard.md');

describe('Module 10 Slice 10.11 Mobile Foundation and Dynamic Dashboard contract', () => {
  it('preserves the bounded contract while Module 10 advances', () => {
    expect(contract).toContain('2ef81f55cac2396395986bd0db19f555f97381a5');
    expect(contract).toContain('29807634502');
    expect(contract).toContain('8486153827');
    expect(contract).toContain(
      '8c997ce3f0ccfcf8bf993892a7c7b8f3ade0685a587add87206f031add6e058f',
    );
  });

  it('records the contract as completed while keeping it binding for the workspace checkpoint', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      workspaces: string[];
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(contract).toContain('contract checkpoint is completed');
    expect(contract).toContain('The contract remains binding');
    expect(contract).toContain('workspace-foundation checkpoint');
    expect(packageJson.workspaces).toEqual([
      'apps/admin-web',
      'apps/user-web',
      'apps/user-mobile',
      'packages/design-system',
    ]);
    expect(packageJson.dependencies?.expo).toBeUndefined();
    expect(packageJson.dependencies?.['react-native']).toBeUndefined();
    expect(packageJson.devDependencies?.expo).toBeUndefined();
    expect(packageJson.devDependencies?.['react-native']).toBeUndefined();
  });

  it('defines an Android-first and iOS-ready isolated Expo workspace boundary', () => {
    for (const phrase of [
      '`apps/user-mobile`',
      'React Native',
      'Expo development builds',
      'TypeScript',
      'Android-first delivery',
      'iOS-ready shared codebase',
      'existing backend remains authoritative',
      'Web React components and React Native components are not assumed to be interchangeable',
    ]) {
      expect(contract).toContain(phrase);
    }

    expect(contract).toContain(
      'No routing library, state-management library, chart library, notification service, analytics SDK, or native module is approved',
    );
  });

  it('requires secure storage and backend-authoritative authentication', () => {
    for (const phrase of [
      'platform secure storage',
      'POST /auth/login',
      'POST /auth/refresh',
      'POST /auth/logout',
      'Authorization: Bearer',
      'X-Tenant-Id',
      'one serialized refresh attempt',
      'replace both tokens atomically',
      'backend `401` and `403` decisions as authoritative',
      'tenant ID is a selector only',
    ]) {
      expect(contract).toContain(phrase);
    }

    expect(contract).toContain(
      'must not store access tokens, refresh tokens, tenant selectors',
    );
    expect(contract).toContain('AsyncStorage');
    expect(contract).toContain(
      'Public application configuration must not contain secrets',
    );
  });

  it('uses only the existing bounded read-only dashboard API sequence', () => {
    for (const endpoint of [
      'GET /users/profile',
      'GET /dashboards?limit=50',
      'GET /dashboards/:dashboardId',
      'GET /dashboards/:dashboardId/resolution',
      'GET /dashboards/:dashboardId/widgets/:widgetId/data',
    ]) {
      expect(contract).toContain(endpoint);
    }

    for (const supported of [
      '`CARD` is supported',
      '`GAUGE` is supported',
      '`CHART` is supported',
      '`TABLE` is supported',
      '`STATUS` is supported',
    ]) {
      expect(contract).toContain(supported);
    }

    expect(contract).toContain('`SWITCH` remains command-deferred');
    expect(contract).toContain('`MAP` remains fail-closed');
    expect(contract).toContain('must not broaden list limits');
  });

  it('defines safe interface states, accessibility, and localization', () => {
    for (const state of [
      'loading',
      'unauthenticated',
      'unauthorized',
      'empty',
      'stale',
      'offline',
      'error',
      'ready',
      'invalid widget',
      'unsupported widget',
    ]) {
      expect(contract).toContain(state);
    }

    for (const boundary of [
      'screen-reader traversal',
      'scalable text',
      'reduced-motion behavior',
      'does not rely on color alone',
      'Indonesian as the default user-facing language',
      'English localization',
    ]) {
      expect(contract).toContain(boundary);
    }
  });

  it('preserves infrastructure, later-slice, module, and deployment exclusions', () => {
    for (const boundary of [
      'MQTT or MQTT over TLS brokers',
      'Redis',
      'PostgreSQL',
      'Prometheus metrics endpoints',
      'RTSP, ONVIF, camera gateways, or vendor APIs',
      'command publication or actuator controls',
      'realtime SSE, WebSocket, or direct MQTT subscriptions',
      'barcode or QR scanning',
      'Module 11 activation',
      'production deployment approval',
    ]) {
      expect(contract).toContain(boundary);
    }
  });

});
