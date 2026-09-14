import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');
const readJson = <T>(relativePath: string): T =>
  JSON.parse(read(relativePath)) as T;

describe('Module 10 Slice 10.13 repository review contract', () => {
  const review = read(
    'docs/module-10-security-observability-accessibility-e2e-review.md',
  );

  it('records the exact remote-green review base without opening Completion Review', () => {
    expect(review).toContain('COMPLETION REVIEW NOT OPENED');
    expect(review).toContain(
      'Module 10 Slice 10.14 - Module 10 Completion Review',
    );
    expect(review).toContain('This document does not open Slice 10.14');
  });

  it('preserves trusted tenant, admin, web-session, mobile-session, and fail-closed security boundaries', () => {
    const dashboardController = read('src/dashboard/dashboard.controller.ts');
    const adminController = read(
      'src/admin-operations/admin-operations.controller.ts',
    );
    const userSession = read('apps/user-web/lib/session.ts');
    const adminSession = read('apps/admin-web/lib/session.ts');
    const secureStore = read(
      'apps/user-mobile/src/session/expo-secure-session-store.ts',
    );
    const compatibility = read(
      'docs/module-10-barcode-cctv-ui-compatibility-contract.md',
    );

    expect(dashboardController).toContain(
      '@UseGuards(JwtAuthGuard, TenantContextGuard)',
    );
    expect(dashboardController).toContain('request.user.tenantContext');
    expect(adminController).toContain(
      '@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)',
    );

    for (const session of [userSession, adminSession]) {
      expect(session).toContain('httpOnly: true');
      expect(session).toContain("sameSite: 'lax'");
      expect(session).toContain(
        "secure: process.env.NODE_ENV === 'production'",
      );
      expect(session).not.toMatch(/localStorage|sessionStorage/);
    }

    expect(secureStore).toContain("from 'expo-secure-store'");
    expect(compatibility).toContain('A scanned code is untrusted input');
    expect(compatibility).toContain(
      'raw RTSP URLs, ONVIF credentials, vendor access tokens',
    );
    expect(review).toContain('PASS at the repository contract level');
  });

  it('preserves structured dashboard events and bounded-cardinality HTTP metrics', () => {
    const dashboardService = read('src/dashboard/dashboard.service.ts');
    const metricsInterceptor = read('src/metrics/metrics.interceptor.ts');

    for (const event of [
      'dashboard.api.created',
      'dashboard.api.listed',
      'dashboard.api.read',
      'dashboard.api.resolved',
      'dashboard.widget_query.completed',
    ]) {
      expect(dashboardService).toContain(event);
    }

    expect(metricsInterceptor).toContain('this.metrics.recordHttpRequest(');
    expect(metricsInterceptor).toContain('request.method');
    expect(metricsInterceptor).toContain('route');
    expect(metricsInterceptor).toContain('statusCode');
    expect(metricsInterceptor).toContain('durationSeconds');
    expect(metricsInterceptor).not.toMatch(
      /tenantId|membershipId|deviceId|dashboardId|widgetId/,
    );
    expect(review).toContain(
      'does not add tenant, membership, device, dashboard, or widget identifiers as metric labels',
    );
  });

  it('preserves shared web and mobile accessibility primitives without claiming formal certification', () => {
    const designSystem = read('packages/design-system/src/index.tsx');
    const designStyles = read('packages/design-system/src/styles.css');
    const mobileLogin = read('apps/user-mobile/src/ui/mobile-login-screen.tsx');
    const mobileNotice = read('apps/user-mobile/src/ui/mobile-state-notice.tsx');

    expect(designSystem).toContain('iot-skip-link');
    expect(designSystem).toContain('aria-live={isAlert');
    expect(designSystem).toContain("role={isAlert ? 'alert' : 'status'}");
    expect(designStyles).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(mobileLogin).toContain('accessibilityRole="header"');
    expect(mobileLogin).toContain('accessibilityLabel=');
    expect(mobileLogin).toContain('accessibilityState={{ busy: pending');
    expect(mobileNotice).toContain('accessibilityLiveRegion="polite"');
    expect(mobileNotice).toContain('accessibilityRole="alert"');
    expect(review).toContain('does not claim WCAG conformance');
    expect(review).toContain(
      'does not contain an automated browser accessibility runner or native-device accessibility test suite',
    );
  });

  it('records the layered repository E2E boundary and its browser/native journey limitation', () => {
    const packageJson = readJson<{ scripts: Record<string, string> }>(
      'package.json',
    );
    const ci = read('.github/workflows/ci.yml');

    expect(packageJson.scripts['test:e2e']).toContain('jest-e2e.json');
    expect(packageJson.scripts['test:integration:db']).toContain(
      'run-database-integration.ts',
    );
    expect(packageJson.scripts['test:integration:mqtt']).toContain(
      'run-mqtt-integration.ts',
    );

    for (const gate of [
      'npm test -- --runInBand',
      'npm run test:e2e',
      'npm run test:integration:db',
      'npm run test:integration:mqtt',
      'npm run release:build',
      'npm run test:startup:production',
    ]) {
      expect(ci).toContain(gate);
    }

    expect(review).toContain('PASS for the repository’s layered integration');
    expect(review).toContain(
      'there is no automated browser or native-device journey',
    );
    expect(review).toContain(
      'must not describe its current coverage as browser E2E, mobile-device E2E, or full user-journey automation',
    );
  });

  it('keeps later lifecycle gates outside the immutable review evidence', () => {
    expect(review).toContain(
      'Module 10 Slice 10.14 - Module 10 Completion Review',
    );
    expect(review).toContain('does not open Slice 10.14');
    expect(review).toContain('activate Module 11');
    expect(review).toContain('approve deployment');
  });

  it('keeps this closure documentation-and-contract only', () => {
    for (const boundary of [
      'does not change application runtime behavior',
      'frontend or backend dependencies and lockfiles',
      'Prisma schema or migrations',
      'CI workflow or validation profiles',
      'production deployment approval',
    ]) {
      expect(review).toContain(boundary);
    }
  });
});
