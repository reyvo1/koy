import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the tenant Workspace widget readings.
 *
 * The defect this pins: `GET /dashboards/:id/widgets/:widgetId/data` has existed on the
 * backend since Module 10 and `apps/user-web` has always read it, but admin-web had no
 * proxy for it at all. `/tenant/workspace` resolved which widgets a dashboard contains and
 * then rendered only kind, title and a truncated device id — a grid of labels with no
 * telemetry, on the one screen whose entire purpose is showing dashboard numbers. Nothing
 * on the page indicated the readings were reachable, because the request was never made.
 *
 * These assertions are source-level on purpose: the existing suites do not render admin-web
 * in a browser, so a behavioural test here would not run. What they lock is the pair of
 * properties that are easy to lose in a later refactor and expensive to lose in production:
 * the page actually queries the widget-data endpoint per widget, and it keeps a missing
 * reading distinguishable from a zero reading.
 */

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

const WIDGET_DATA_PROXY =
  'apps/admin-web/app/api/tenant/dashboards/[dashboardId]/widgets/[widgetId]/data/route.ts';
const WORKSPACE = 'apps/admin-web/components/tenant-workspace-content.tsx';

describe('Tenant workspace widget readings', () => {
  describe('widget-data proxy', () => {
    const proxy = read(WIDGET_DATA_PROXY);

    it('exists, so the endpoint is reachable from admin-web and not only from user-web', () => {
      expect(proxy).toContain('export async function GET');
    });

    it('targets the backend path with both identifiers encoded', () => {
      expect(proxy).toMatch(
        /`\/dashboards\/\$\{encodeURIComponent\(\s*dashboardId,?\s*\)\}\/widgets\/\$\{encodeURIComponent\(/,
      );
    });

    it('reuses the shared session proxy rather than hand-rolling auth', () => {
      expect(proxy).toContain("from '@/lib/proxy'");
      expect(proxy).toContain('proxyBackend');
    });
  });

  describe('workspace screen reads the data instead of only the resolution', () => {
    const workspace = read(WORKSPACE);

    it('queries the widget-data endpoint for every READY widget', () => {
      expect(workspace).toMatch(
        /\/api\/tenant\/dashboards\/\$\{encodeURIComponent\([\s\S]*?\}\/widgets\/\$\{encodeURIComponent\(widget\.id\)\}\/data/,
      );
      // A widget the resolver rejected is not queried — querying it would burn a request
      // that can only 404 and would hide the resolver's own reason behind a fetch error.
      expect(workspace).toMatch(/widget\.state !== 'READY'\) continue;/);
    });

    it('discards in-flight readings when the operator leaves or switches workspace', () => {
      expect(workspace).toContain('readingToken');
      expect(workspace).toMatch(/readingToken\.current = token;/);
    });
  });

  describe('a missing reading is never rendered as a value', () => {
    const workspace = read(WORKSPACE);

    it('renders the resolver reason for a widget that did not resolve', () => {
      expect(workspace).toMatch(
        /widget\.state && widget\.state !== 'READY'\)[\s\S]{0,400}widget\.message/,
      );
    });

    it('renders the backend state when a resolved widget has no reading', () => {
      expect(workspace).toMatch(
        /reading\.state !== 'READY'\)[\s\S]{0,400}reading\.message/,
      );
    });

    it('keeps an absent binding distinct from a present zero', () => {
      // `!binding.data` must fall through to the binding state, not to a formatted number.
      // A null reading formatted as "0" is the specific lie this guard exists to prevent.
      expect(workspace).toMatch(
        /if \(!binding\.data\) return STATE_LABEL\[binding\.state\]/,
      );
    });
  });
});
