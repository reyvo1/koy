import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Saved reports: an operator runs a report, saves it, and can download it again later.
 *
 * Reports already exist and are honest about what they are -- `platform-reports/tenant-summary`
 * is a bounded live aggregate, and the tenant page exports real telemetry to CSV. What neither
 * does is let anybody answer a question from last week. Both recompute from `now`, so the number
 * an operator read on Monday is not retrievable on Tuesday, and a report that cannot be
 * reproduced cannot be used to reconcile anything.
 *
 * That is the gap, and it is what the owner asked for: the operator saves a run, the console
 * lists past reports, and a saved report can be downloaded again. Retention is 28 days, enforced
 * rather than documented -- a retention window stated in a comment is not a retention window.
 *
 * Source-shaped like the other management-plane contracts. The saved-report row is real
 * persisted state, and the behaviour it claims is proved against the running container; see the
 * session checkpoint.
 */
const root = resolve(__dirname, '..');
const read = (path: string): string => {
  const full = resolve(root, path);
  if (!statSync(full).isFile()) throw new Error(`not a file: ${path}`);
  return readFileSync(full, 'utf8');
};

/**
 * The same file with comments removed.
 *
 * A negative assertion like "this route must not read the tenant from a cookie" fails on the word
 * `cookie` appearing in a doc comment -- which is exactly where the explanation of why it must not
 * belongs. Stripping comments first makes the negative assertion mean what it says. This has bitten
 * this file's own sibling contracts twice, and it is the reason the helper exists rather than a
 * regex written inline.
 */
const readCode = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

const SCHEMA = 'prisma/schema.prisma';
const SERVICE = 'src/admin-operations/report-archive.service.ts';
const CONTROLLER = 'src/admin-operations/admin-platform-observability.controller.ts';
const PAGE = 'apps/admin-web/components/super-reports-content.tsx';

describe('saved reports', () => {
  describe('schema', () => {
    it('has somewhere for a saved report to live', () => {
      // Without a row, "saved" means "regenerate it and hope the numbers match", which is the
      // thing this feature exists to stop.
      expect(read(SCHEMA)).toMatch(/^model SavedReport \{/m);
    });

    it('records what produced the report, not just its output', () => {
      // A report with no `rangeFrom`/`rangeTo` cannot be re-derived, and re-derivation is what
      // makes a saved number checkable against the live system. The window is part of the
      // artifact, not a parameter that was passed and forgotten.
      const schema = read(SCHEMA);
      const block = schema.slice(
        schema.indexOf('model SavedReport {'),
        schema.indexOf('model SavedReport {') + 1600,
      );
      expect(block).toMatch(/rangeFrom\s+DateTime/);
      expect(block).toMatch(/rangeTo\s+DateTime/);
      expect(block).toMatch(/kind\s+SavedReportKind/);
    });

    it('scopes a saved report to a tenant and to the operator who saved it', () => {
      // The operator filter is not cosmetic: the report list is the only place a report body
      // could be read by someone other than the platform, and a shared list without an owner
      // column cannot answer "whose report is this".
      const schema = read(SCHEMA);
      expect(schema).toMatch(/tenantId\s+String/);
      expect(schema).toMatch(/actorMembershipId\s+String/);
      expect(schema).toMatch(/@@index\(\[tenantId, createdAt\]\)/);
    });
  });

  describe('writing a report', () => {
    it('stores the rendered payload, not a recipe for it', () => {
      // The body is stored as produced. Recomputing on download would make a saved report a
      // saved *query*, and the number would move underneath the operator between saving and
      // re-reading -- the exact failure this removes.
      const service = read(SERVICE);
      const create = service.slice(service.indexOf('savedReport.create('));
      const call = create.slice(0, create.indexOf('\n    });'));
      // The payload handed to `create` must be the rendered report, not an empty object, not a
      // query description, and not the whole request body. Checking that the file "mentions
      // payload" passed even when the stored value was `{}`, which is the exact failure this guard
      // exists to catch -- an archive that stores nothing and looks like it works.
      expect(call).toMatch(/payload:\s*generated/);
      expect(call).not.toMatch(/payload:\s*\{\s*\}/);
      // And the saved row is scoped: a report body stored without a tenant would be readable by
      // whoever guessed an id.
      expect(call).toMatch(/tenantId:\s*input\.tenantId/);
      expect(call).toMatch(/actorMembershipId:\s*input\.actorMembershipId/);
    });

    it('records the actor from the session, never from the request body', () => {
      const controller = read(CONTROLLER);
      const route = controller.slice(controller.indexOf('platform-reports/saved'));
      expect(route).not.toMatch(/body\.actorMembershipId/);
      expect(route).toMatch(/tenantContext\.membershipId/);
    });

    it('rejects a range the operator did not ask for', () => {
      // A window wider than the report service's own bound would be saved as a "report of the
      // last year" computed over 24 hours of data, which is the same class of lie the rest of
      // this repo refuses. The bound is the same one `getTenantSummaryReport` uses.
      const service = read(SERVICE);
      expect(service).toMatch(/MAX_REPORT_HOURS/);
    });
  });

  describe('retention', () => {
    it('expires reports after the agreed window rather than describing the intent', () => {
      // 28 days, decided by the owner. Asserted on the code, because a retention window in a
      // comment is a promise to a reader rather than a behaviour.
      const service = read(SERVICE);
      expect(service).toMatch(/RETENTION_DAYS\s*=\s*28/);
      expect(service).toMatch(/expiresAt/);
      // And it is applied on read, so an expired report cannot be served by a path that forgot
      // to check.
      expect(service).toMatch(/expiresAt:\s*\{\s*gt:/);
    });

    it('expires by hiding first, and purges only as housekeeping', () => {
      // On the read path, expiry must be a filter: an expired report is absent from the list and
      // refused on download while the row still stands. That is what makes the history legible --
      // a report that vanished silently is indistinguishable from one that was never run.
      //
      // A blanket "never delete" ban would have been the wrong guard to write. It would have
      // blocked the housekeeping that keeps the table from growing without bound, and the usual
      // response to such a failure is to leave the table to grow. So both halves are asserted:
      // reads filter on `expiresAt`, and the only delete is the purge, which is scoped to rows
      // that are already past it.
      const service = read(SERVICE);
      expect(service).toMatch(/expiresAt:\s*\{\s*gt:\s*new Date\(\)/);
      expect(service).toMatch(/expiresAt\.getTime\(\)\s*<=\s*Date\.now\(\)/);

      const purge = service.slice(service.indexOf('async purgeExpired'));
      expect(purge).toMatch(/savedReport\.deleteMany/);
      expect(purge.slice(0, 400)).toMatch(/expiresAt:\s*\{\s*lte:/);
      // And nothing outside the purge may delete reports.
      const outside = service.slice(0, service.indexOf('async purgeExpired'));
      expect(outside).not.toMatch(/savedReport\.delete/);
    });
  });

  describe('console', () => {
    it('lists saved reports on the same screen as the run that fills it', () => {
      // The archive belongs where an operator looks right after saving something. Asserted on the
      // component that renders the report, not on a path: the list used to live behind a BFF
      // prefix while the panel used another, and a guard written against one of the two paths
      // would have passed while the list was unreachable from the screen.
      const page = read(PAGE);
      // The panel fetches the list, and renders a row per saved report with a download control.
      expect(page).toMatch(/reports\/saved/);
      expect(page).toMatch(/saved\.items\.map/);
      // And the save control is the same gesture as the export control -- both act on the report
      // currently on screen, so neither lives on a separate page.
      expect(page).toMatch(/Simpan laporan/);
    });

    it('can download a saved report again without re-running it', () => {
      // The whole point. A button that re-computes is not a download.
      expect(read(PAGE)).toMatch(/Unduh|download/i);
      expect(read(PAGE)).not.toMatch(/href=\{?['"`]?\/api\/admin\/reports\/export/);
    });

    it('asks which tenant, and refuses to guess one', () => {
      // This guard was originally written the other way round: it forbade the BFF from taking a
      // `tenantId`, on the reasoning that a URL parameter lets a session read another tenant's
      // archive. The live browser run showed the reasoning was sound and the implementation wrong.
      //
      // A saved report belongs to a *target* tenant the operator picks, while the session belongs
      // to the platform tenant. So reading the tenant from the session wrote the archive under one
      // tenant and listed it under another, and the console showed an empty list immediately after
      // a successful save. The absence of the parameter was not protecting anything; it was hiding
      // a tenant mismatch.
      //
      // The real boundary is the backend's `PlatformRoleGuard`, which the route's own test
      // asserts. What the BFF must do is refuse rather than fall back: a blank tenant has to be an
      // error, because silently defaulting to the session tenant would list the platform tenant's
      // archive and look like a legitimate answer.
      const route = read('apps/admin-web/app/api/super/reports/saved/route.ts');
      expect(route).toContain('proxyBackend');
      expect(route).toMatch(/searchParams\.get\('tenantId'\)/);
      expect(route).toMatch(/tenantId wajib diisi/);
      // No cookie-derived tenant: that is the bug this route had. Asserted on the code with
      // comments stripped -- the doc comment above explains this rule and says "cookie" in it.
      expect(readCode('apps/admin-web/app/api/super/reports/saved/route.ts')).not.toMatch(
        /cookie|readSessionTenant/,
      );
    });
  });

  describe('what must not be built from this', () => {
    it('does not add a scheduler yet', () => {
      // The owner chose saved runs over scheduled ones. A cron-shaped field on a report that
      // nothing reads would be a feature that looks available in the data model and is not
      // available in the product -- the same shape of defect this repo has found before.
      const block = read(SCHEMA).slice(
        read(SCHEMA).indexOf('model SavedReport {'),
        read(SCHEMA).indexOf('model SavedReport {') + 1600,
      );
      expect(block).not.toMatch(/cron|scheduleAt|nextRunAt|cronExpression/i);
    });
  });
});
