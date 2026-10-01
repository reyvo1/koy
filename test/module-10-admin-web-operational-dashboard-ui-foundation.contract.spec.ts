import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

const adminWebSources = [
  'apps/admin-web/app/page.tsx',
  'apps/admin-web/app/api/session/login/route.ts',
  'apps/admin-web/app/api/session/logout/route.ts',
  'apps/admin-web/app/api/admin/operational-summary/route.ts',
  'apps/admin-web/components/admin-login-form.tsx',
  'apps/admin-web/components/operational-summary-dashboard.tsx',
  'apps/admin-web/components/operational-summary-experience.tsx',
  'apps/admin-web/lib/backend.ts',
  'apps/admin-web/lib/contracts.ts',
  'apps/admin-web/lib/operational-summary-state.ts',
  'apps/admin-web/lib/session.ts',
]
  .map(read)
  .join('\n');

describe('Module 10 Slice 10.10 Admin Web Operational Dashboard UI Foundation contract', () => {
  it('preserves remote-green Slice 10.10 while Module 10 advances', () => {
    const docs = read(
      'docs/module-10-admin-web-operational-dashboard-ui-foundation.md',
    );
    expect(docs).toContain('f4195f814b5c83c5aa21409f284c73a08be64108');
    expect(docs).toContain('29766694450');
    expect(docs).toContain('8471149165');
    expect(docs).toContain(
      'b2ee7043b79a8e7cadd8e10a56c8e33afdc6c2a3b1dc67478a79013424758883',
    );
    expect(docs).toContain('The backend remains authoritative');
    expect(docs).toContain('Module Execution Kit v1.0.3');
    expect(docs).toContain('## Remote-Green Evidence');
    expect(docs).toContain('94 suites / 670 tests');
    expect(docs).toContain('317 manifest entries');
  });

  it('implements the approved same-origin server session boundary', () => {
    const session = read('apps/admin-web/lib/session.ts');
    const backend = read('apps/admin-web/lib/backend.ts');
    const login = read('apps/admin-web/app/api/session/login/route.ts');

    expect(backend).toContain("import 'server-only'");
    expect(backend).toContain('IOT_API_BASE_URL');
    expect(backend).toContain('HTTPS unless it targets a loopback host');
    expect(session).toContain("const ACCESS_COOKIE = 'iot_admin_access'");
    expect(session).toContain("const REFRESH_COOKIE = 'iot_admin_refresh'");
    expect(session).toContain("const TENANT_COOKIE = 'iot_admin_tenant'");
    expect(session).toContain('httpOnly: true');
    expect(session).toContain("sameSite: 'lax'");
    expect(session).toContain("secure: process.env.NODE_ENV === 'production'");
    expect(session).toContain("headers.set('authorization'");
    expect(session).toContain("headers.set('x-tenant-id'");
    expect(session).toContain('parseTokenPair');
    expect(login).toContain("backendFetch('/auth/login'");
    expect(login).toContain('MAX_PASSWORD_LENGTH');
    expect(adminWebSources).not.toMatch(/localStorage|sessionStorage/);
  });

  it('serializes refresh-token rotation and keeps backend role enforcement authoritative', () => {
    const session = read('apps/admin-web/lib/session.ts');
    const route = read('apps/admin-web/app/api/admin/operational-summary/route.ts');

    expect(session).toContain('private refreshPromise: Promise<void> | null');
    expect(session).toContain('refreshAfterUnauthorized(accessToken)');
    expect(session).toContain('this.session.accessToken !== failedAccessToken');
    expect(session).toContain('ADMIN_WEB_AUTH_RESPONSE_INVALID');
    // Asserted as behaviour, not as the dead route's variable name. The previous expectation
    // pinned `error.status === 401 || error.status === 403`, which only ever existed in the
    // duplicate that imported the loader; the surviving route names the same value `status`.
    // Pinning a local identifier made a correct rename look like a regression.
    expect(route).toMatch(/status\s*===\s*401\s*\|\|\s*status\s*===\s*403/);
    expect(route).toContain('{ status: 401 }');
    expect(route).toContain('clearSessionCookies(response)');
    expect(route).not.toContain('ADMIN role');
  });

  it('consumes only a consistent read-only operational summary', () => {
    const contracts = read('apps/admin-web/lib/contracts.ts');

    for (const field of [
      'generatedAt',
      'staleThresholdSeconds',
      'devices',
      'staleHeartbeat',
      'neverReportedHeartbeat',
      'capabilities',
      'latestObservedAt',
      'commands',
    ]) {
      expect(contracts).toContain(field);
    }

    // The normalising loader is gone. It was only ever called by the duplicate
    // `/api/operational-summary` proxy, so its defences (safe-integer checks, consistent
    // totals) were already not in effect for either live consumer — deleting it changed no
    // runtime behaviour. What remains to guard is the field list the component reads and the
    // single proxy that serves it, forwarded verbatim so the UI cannot show numbers that
    // disagree with the backend's.
    const route = read('apps/admin-web/app/api/admin/operational-summary/route.ts');
    expect(route).toContain("client.request('/admin/operational-summary')");
    expect(route).toContain('NextResponse.json(payload, { status: response.status })');
    expect(() => read('apps/admin-web/lib/operational-summary-loader.ts')).toThrow();
    expect(adminWebSources).not.toMatch(
      /\/metrics|prometheus|mqtt:\/\/|mqtts:\/\/|rtsp:\/\//i,
    );
    expect(adminWebSources).not.toContain('payload telemetry');
  });

  it('renders Indonesian loading, empty, stale, unauthorized, offline, and error states', () => {
    const experience = read(
      'apps/admin-web/components/operational-summary-experience.tsx',
    );
    const layout = read('apps/admin-web/app/layout.tsx');
    const styles = read('apps/admin-web/app/globals.css');
    // The mobile breakpoint moved out of globals.css when the local :root token block was
    // deleted. globals.css now only adds surface treatment, so the responsive contract for
    // the console components lives in the adapter that defines them. Both files are checked
    // because either may legitimately own a breakpoint.
    const adapter = read('apps/admin-web/app/design-system-v2.css');

    for (const state of [
      'loading',
      'empty',
      'stale',
      'unauthorized',
      'offline',
      'error',
    ]) {
      expect(adminWebSources.toLowerCase()).toContain(state);
    }

    expect(experience).toContain('aria-label="Kontrol ringkasan"');
    expect(experience).toContain('Perbarui');
    expect(experience).toContain('Keluar');
    expect(layout).toContain('<html lang="id"');
    expect(styles + adapter).toContain('@media (max-width: 639px)');
  });

  it('keeps actions, infrastructure access, and resource drill-down absent', () => {
    const page = read('apps/admin-web/app/page.tsx');
    const dashboard = read(
      'apps/admin-web/components/operational-summary-dashboard.tsx',
    );

    expect(page).toContain('Read-only operations');
    expect(dashboard).toContain('payload');
    expect(dashboard).toContain('telemetry mentah');
    expect(adminWebSources).not.toMatch(
      /publishCommand|createCommand|\/devices\/.*provision|ownership assignment/i,
    );
    expect(adminWebSources).not.toMatch(/deviceId|commandId|capabilityId/);
    expect(adminWebSources).not.toMatch(/redis|postgres|onvif|vendor secret/i);
  });

  it('records the exact-file execution framework without granting later-module authority', () => {
    const docs = read(
      'docs/module-10-admin-web-operational-dashboard-ui-foundation.md',
    );
    const framework = read('docs/development/module-execution-framework.md');

    expect(docs).toContain('`935c30e`');
    expect(docs).toContain('`29741100028`');
    expect(framework).toContain('content-addressed exact-file payload');
    expect(framework).toContain('Stop without push');
    expect(docs).toMatch(/Module 11.+production deployment approval/s);
  });

});
