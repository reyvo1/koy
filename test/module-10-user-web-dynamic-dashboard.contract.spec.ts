import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const userWebSources = [
  'apps/user-web/app/page.tsx',
  'apps/user-web/app/api/dashboard/route.ts',
  'apps/user-web/app/api/session/login/route.ts',
  'apps/user-web/app/api/session/logout/route.ts',
  'apps/user-web/components/dashboard-experience.tsx',
  'apps/user-web/components/dashboard-grid.tsx',
  'apps/user-web/components/login-form.tsx',
  'apps/user-web/components/widget-card.tsx',
  'apps/user-web/lib/backend.ts',
  'apps/user-web/lib/dashboard-loader.ts',
  'apps/user-web/lib/session.ts',
]
  .map(read)
  .join('\n');

describe('Module 10 Slice 10.7 User Web Dynamic Dashboard contract', () => {
  it('records the remote-green Slice 10.7 completion evidence while later slices remain separately gated', () => {
    const docs = read('docs/module-10-user-web-dynamic-dashboard.md');

    expect(docs).toContain('`717ea9f`');
    expect(docs).toContain('`29694607680`');
    expect(docs).toContain('`53ec5c1`');
    expect(docs).toContain('`29716215821`');
    expect(docs).toContain('remote-green Slice 10.10 Admin Web UI');
    expect(docs).toContain('`f4195f8`');
    expect(docs).toContain('`29766694450`');
    expect(docs).not.toContain('runtime remains unimplemented');
  });

  it('keeps session material server-side in bounded cookies', () => {
    const session = read('apps/user-web/lib/session.ts');
    const login = read('apps/user-web/app/api/session/login/route.ts');

    expect(session).toContain('httpOnly: true');
    expect(session).toContain("sameSite: 'lax'");
    expect(session).toContain("secure: process.env.NODE_ENV === 'production'");
    expect(login).toContain("backendFetch('/auth/login'");
    expect(login).toContain('setSessionCookies');
    expect(userWebSources).not.toMatch(/localStorage|sessionStorage/);
  });

  it('keeps bearer and tenant authorization in the server boundary', () => {
    const backend = read('apps/user-web/lib/backend.ts');
    const session = read('apps/user-web/lib/session.ts');

    expect(backend).toContain("import 'server-only'");
    expect(backend).toContain('IOT_API_BASE_URL');
    expect(backend).toContain('HTTPS unless it targets a loopback host');
    expect(session).toContain("headers.set('authorization'");
    expect(session).toContain("headers.set('x-tenant-id'");
    expect(userWebSources).not.toMatch(/mqtt:\/\/|mqtts:\/\/|rtsp:\/\//i);
  });

  it('serializes concurrent refresh-token rotation at the server boundary', () => {
    const session = read('apps/user-web/lib/session.ts');

    expect(session).toContain('private refreshPromise: Promise<void> | null');
    expect(session).toContain('refreshAfterUnauthorized(accessToken)');
    expect(session).toContain('this.session.accessToken !== failedAccessToken');
    expect(session).toContain('this.refreshPromise = this.refresh().finally');
  });

  it('loads dashboard data with bounded fan-out and per-widget isolation', () => {
    const loader = read('apps/user-web/lib/dashboard-loader.ts');

    expect(loader).toContain('const DASHBOARD_LIMIT = 50');
    expect(loader).toContain('const WIDGET_QUERY_CONCURRENCY = 4');
    expect(loader).toContain("'/users/profile'");
    expect(loader).toContain('`/dashboards?limit=${DASHBOARD_LIMIT}`');
    expect(loader).toContain('/resolution`');
    expect(loader).toContain('/data`');
    expect(loader).toContain('USER_WEB_WIDGET_FETCH_FAILED');
    expect(loader).toContain('error.status === 401 || error.status === 403');
  });

  it('renders all approved widget kinds while commands and maps remain fail-closed', () => {
    const widget = read('apps/user-web/components/widget-card.tsx');

    for (const kind of [
      'CARD',
      'SWITCH',
      'GAUGE',
      'CHART',
      'MAP',
      'TABLE',
      'STATUS',
    ]) {
      expect(widget).toContain(`'${kind}'`);
    }
    expect(widget).toContain('Tidak ada command yang dikirim');
    expect(widget).toContain('Widget peta tetap fail-closed');
  });

  it('provides responsive and accessible Indonesian states', () => {
    const experience = read(
      'apps/user-web/components/dashboard-experience.tsx',
    );
    const styles = read('apps/user-web/app/globals.css');
    const layout = read('apps/user-web/app/layout.tsx');

    for (const state of [
      'loading',
      'empty',
      'stale',
      'unauthorized',
      'offline',
      'error',
    ]) {
      expect(userWebSources.toLowerCase()).toContain(state);
    }
    expect(experience).toContain('aria-label="Kontrol dashboard"');
    expect(styles).toContain('.iot-dashboard-grid');
    expect(styles).toContain('@media (max-width: 639px)');
    // Asserted as the documented theme contract rather than as a literal opening tag. The
    // previous `toContain('<html lang="id">')` pinned the element to have no attributes, so
    // adding the documented light-theme opt-in failed this test — the same shape as the stale
    // validator checks: a guardrail that pins the absence of a correct change. User Web shares
    // one dark-first token set with the admin console and opts into light explicitly, so both
    // the language attribute and the theme attribute are required.
    expect(layout).toMatch(/<html[^>]*\blang="id"/);
    expect(layout).toMatch(/<html[^>]*\bdata-theme="light"/);
    // And the stylesheet it renders through must actually be the shared design system,
    // otherwise the shell's iot-* classes resolve to nothing.
    expect(styles).toContain("@import '@iot-platform/design-system/styles.css';");
  });

  it('documents deferred boundaries and the next gated slice', () => {
    const docs = read('docs/module-10-user-web-dynamic-dashboard.md');

    expect(docs).toContain('Slice 10.8 Admin Web Operational Dashboard');
    expect(docs).toContain('`b0c5b8e`');
    expect(docs).toContain('`29692620905`');
    expect(docs).toContain('does not publish commands');
    expect(docs).toContain('does not expose');
    expect(docs).toMatch(/Module 11.+production deployment/i);
  });

});
