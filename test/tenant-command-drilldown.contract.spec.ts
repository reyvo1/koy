import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the tenant command drill-down.
 *
 * The defect this pins is an identity mismatch that a source-reading reviewer would not
 * catch. `DeviceCommand` has two distinct UUID columns: `id` (primary key) and
 * `correlationId` (@unique). `CommandService.getByCorrelationId` looks the command up by
 * `correlationId` only, but the history proxy `/api/tenant/commands` returned just the
 * row's `id`. A drill-down wired to that field would have 404'd on every single click, and
 * the 404 would have looked like a missing command rather than a wrong identifier.
 *
 * The second thing pinned here is the fail-closed reading of the detail panel: a timestamp
 * the backend never wrote must be stated as absent, and the payload must be printed as
 * received. Formatting a null Date renders "01/01/1970", which reads as a real event, and
 * translating a boolean payload into "Aktif"/"Nonaktif" hides the exact value an operator
 * opened the panel to check.
 */

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

const LIST_PROXY = 'apps/admin-web/app/api/tenant/commands/route.ts';
const DETAIL_PROXY =
  'apps/admin-web/app/api/tenant/commands/[deviceId]/[commandId]/route.ts';
const HISTORY_UI = 'apps/admin-web/components/tenant-commands-content.tsx';
const SCHEMA = 'prisma/schema.prisma';

describe('Tenant command drill-down', () => {
  describe('the two command identities are not interchangeable', () => {
    it('the schema really does carry both as separate columns', () => {
      const schema = read(SCHEMA);
      const model = schema.slice(schema.indexOf('model DeviceCommand'));
      expect(model).toMatch(/^\s{2}id\s+String\s+@id/m);
      expect(model).toMatch(/^\s{2}correlationId\s+String\s+@unique/m);
    });

    it('the history list proxy carries correlationId, not just the primary key', () => {
      const proxy = read(LIST_PROXY);
      expect(proxy).toContain('correlationId?: string');
      // The regression: a list row whose only identifier is `id` cannot be opened.
      expect(proxy).toMatch(/commandId:\s*row\.correlationId \?\? row\.id/);
    });

    it('the detail proxy targets the path the service actually resolves on', () => {
      const proxy = read(DETAIL_PROXY);
      expect(proxy).toMatch(
        /\/devices\/\$\{encodeURIComponent\([\s\S]*?\}\/commands\/\$\{encodeURIComponent\(/,
      );
    });
  });

  describe('the detail route reuses the shared session proxy', () => {
    const proxy = read(DETAIL_PROXY);

    it('does not hand-roll authentication', () => {
      expect(proxy).toContain("from '@/lib/proxy'");
      expect(proxy).toContain('proxyBackend');
    });

    it('rejects an empty identity instead of calling the backend with a blank path segment', () => {
      expect(proxy).toMatch(/if \(!deviceId\.trim\(\) \|\| !commandId\.trim\(\)\)/);
    });
  });

  describe('history rows are openable by keyboard, not by pointer only', () => {
    const ui = read(HISTORY_UI);

    it('renders each row as a button carrying the device and correlation id', () => {
      expect(ui).toMatch(/openCommandDetail\(item\)/);
      expect(ui).toMatch(/aria-expanded=\{isOpen\}/);
      expect(ui).toMatch(
        /\/api\/tenant\/commands\/\$\{encodeURIComponent\([\s\S]*?\}\/\$\{encodeURIComponent\(item\.commandId\)\}/,
      );
    });

    it('refuses to open a row that has no usable identity', () => {
      expect(ui).toMatch(/if \(!item\.commandId \|\| !item\.deviceId\)/);
    });
  });

  describe('an unset timestamp is never rendered as a real date', () => {
    const ui = read(HISTORY_UI);

    it('states absence rather than formatting the epoch', () => {
      expect(ui).toMatch(/if \(!value\) return 'belum';/);
    });

    it('reports an absent ACK instead of inventing a latency', () => {
      expect(ui).toContain('belum ada ACK');
      expect(ui).toMatch(/if \(!sentAt \|\| !acknowledgedAt\) return null;/);
    });
  });

  describe('the payload is shown, not interpreted', () => {
    const ui = read(HISTORY_UI);

    it('serialises the payload as received', () => {
      expect(ui).toContain('JSON.stringify(payload, null, 2)');
    });

    it('distinguishes a null payload from an empty one', () => {
      expect(ui).toContain("return 'tidak ada payload'");
      expect(ui).toContain("return 'payload kosong'");
    });
  });
});
