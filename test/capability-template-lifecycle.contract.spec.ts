import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Capability drift is visible and, until now, unfixable.
 *
 * `GET /admin/platform-capabilities/versions` already reports `hasVersionDrift` — the same
 * capability key declared at different `schemaVersion`s across devices — and the console
 * renders it. What did not exist was any way to *act* on it: there is no template, no
 * publication, and no route that moves a device's capability to the version the fleet is
 * standardising on. An operator looking at a drift report could not resolve it, so the report
 * was a complaint rather than a control.
 *
 * Two owner decisions are encoded here rather than left implicit, because both are the kind
 * that are easy to invert in a later edit and expensive to notice:
 *
 *  - **Operator-initiated.** Publishing a template does not touch devices. The console shows
 *    the drift and the operator applies it per key. Automatic application would let a
 *    publication silently rewrite every device's capability schema, which is a fleet-wide
 *    change made by someone who clicked one button.
 *  - **Bound capabilities are refused.** A capability already referenced by a dashboard
 *    binding or an automation has data behind it; changing its schema version underneath
 *    those would repoint widgets and rules at a shape they were not written for. The refusal
 *    names the references so the operator knows what to detach.
 *
 * Source-shaped, like the other management-plane contracts in this repo: `@/lib/proxy` is
 * unresolvable from the root jest project. The behavioural half is proved against the running
 * container — see the checkpoint.
 */
const root = resolve(__dirname, '..');
// Resolved and read strictly, rejecting anything that is not a plain file. The earlier version
// of this helper globbed and returned the first match, so a reference to `prisma/schema.prisma`
// could come back as `prisma.config.ts` — a real file, so nothing threw, and the assertion then
// ran against the generator block instead of the models. A helper that cannot report "I read
// something else" will quietly certify the wrong file.
const read = (path: string): string => {
  const full = resolve(root, path);
  const stat = statSync(full);
  if (!stat.isFile()) throw new Error(`not a file: ${path}`);
  return readFileSync(full, 'utf8');
};

const SCHEMA = 'prisma/schema.prisma';
const SERVICE = 'src/admin-operations/capability-template.service.ts';
const CONTROLLER = 'src/admin-operations/admin-governance.controller.ts';

describe('capability template lifecycle', () => {
  describe('schema', () => {
    it('has a template and a template version', () => {
      const schema = read(SCHEMA);
      // Lifecycle needs somewhere to live. `Capability` is a per-device instance and its
      // `@@unique([deviceId, key])` means it cannot express "the version this fleet is on" —
      // every device declares its own, which is exactly how drift becomes possible and then
      // unresolvable.
      expect(schema).toMatch(/^model CapabilityTemplate \{/m);
      expect(schema).toMatch(/^model CapabilityTemplateVersion \{/m);
    });

    it('records a lifecycle status rather than inferring it from timestamps', () => {
      // draft → published → deprecated. A status column is what makes "is this the version
      // the fleet is on" answerable; deriving it from `createdAt` makes an old draft look
      // current purely by being old.
      const schema = read(SCHEMA);
      const version = schema.slice(
        schema.indexOf('model CapabilityTemplateVersion {'),
        schema.indexOf('model CapabilityTemplateVersion {') + 1400,
      );
      expect(version).toMatch(/status\s+CapabilityTemplateStatus/);
    });

    it('allows one template per capability key', () => {
      // Without this the "publish" route can create two competing published versions, and
      // "the fleet is on version X" stops having an answer.
      const schema = read(SCHEMA);
      expect(schema).toMatch(/@@unique\(\[tenantId, key\]\)/);
      expect(schema).toMatch(/@@unique\(\[templateId, version\]\)/);
    });

    it('permits at most one PUBLISHED version, and does not constrain the others', () => {
      // This is the one place a plain composite unique is wrong. `@@unique([templateId, status])`
      // reads like the right instinct and silently caps the template at one DRAFT and one
      // DEPRECATED *forever* — so the second deprecation a real programme performs fails on a
      // constraint nobody remembers writing. Multiple drafts are normal (work in progress);
      // multiple deprecations are the history. Only "published" must be exclusive, which is a
      // partial index, not a column constraint.
      // Stripped of comments first, for the same reason the loadability check is: the schema's
      // doc comment quotes `@@unique([templateId, status])` verbatim to explain why it was *not*
      // used. A raw search matches that explanation, and the obvious "fix" for a failing
      // assertion like this one is to delete the paragraph explaining the decision — which would
      // leave the next reader to rediscover the constraint trap.
      const schemaCode = read(SCHEMA)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      expect(schemaCode).not.toMatch(/@@unique\(\[templateId, status\]\)/);

      const migration = read(
        'prisma/migrations/20260930233000_capability_template_lifecycle/migration.sql',
      );
      // The index's target column is on the *next* line after the table name in the real file,
      // so matching "CREATE UNIQUE INDEX … table … templateId" as one span required a newline
      // to be `\s`, which it is — but the index name contains the word "published" too, so the
      // two assertions below must be anchored on the WHERE clause rather than on the word.
      expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*?capability_template_versions/i);
      expect(migration).toMatch(/ON "?capability_template_versions"?\s*\(\s*"?templateId"?\s*\)/i);
      // Scoped to PUBLISHED. Without the WHERE the index caps deprecated rows too, reproducing
      // the original bug in a different file.
      expect(migration).toMatch(/WHERE\s+"?status"?\s*=\s*'PUBLISHED'/i);
    });
  });

  describe('routes', () => {
    it('exposes the lifecycle, not only a read', () => {
      const controller = read(CONTROLLER);
      // The four verbs a lifecycle is made of. A `GET`-only surface is a report, and a
      // report was exactly what already existed.
      expect(controller).toMatch(/@Post\('platform-capability-templates'\)/);
      expect(controller).toMatch(/@Post\('platform-capability-templates\/:templateId\/versions'\)/);
      expect(controller).toMatch(/@Post\('platform-capability-templates\/:templateId\/deprecate'\)/);
      // And the one the drift report was missing: the way to actually fix a drift.
      expect(controller).toMatch(/@Post\('platform-capability-versions\/apply'\)/);
    });

    it('puts the template surface behind the platform role guard', () => {
      const controller = read(CONTROLLER);
      // These rewrite the capability schema of devices belonging to *other* tenants. Read
      // access to a template list is a directory concern; writing one is not.
      //
      // Asserted on the class decorator, not on the individual routes: this controller already
      // carries `@UseGuards(… PlatformRoleGuard)` at class level, and every route inherits it.
      // A per-route search for `@RequirePermission` reads like a stronger requirement than the
      // code actually makes, and the usual response to a failing assertion is to add the thing
      // it names — here, a second, redundant guard.
      const classHeader = controller.slice(
        controller.indexOf("@Controller('admin')"),
        controller.indexOf('export class AdminGovernanceController'),
      );
      expect(classHeader).toContain('PlatformRoleGuard');

      // And the new surface is inside this controller, so it inherits the guard rather than
      // sitting on a controller that lacks it.
      const lifecycleStart = controller.indexOf('platform-capability-templates');
      expect(lifecycleStart).toBeGreaterThan(controller.indexOf('export class'));
    });
  });

  describe('applying a version to a fleet', () => {
    it('refuses a capability that is already referenced', () => {
      const service = read(SERVICE);
      // The owner's decision, asserted: a bound capability is refused rather than changed.
      // `dashboardWidgetBinding` and `automation` are the two reference tables; a check that
      // names only one leaves the other silent.
      expect(service).toMatch(/dashboardWidgetBinding\.(groupBy|count|findMany)/);
      expect(service).toMatch(/automation\.(groupBy|count|findMany)/);
      // The refusal is reported, not thrown: refusing would abort a fleet-wide apply because
      // one device is bound. So the surface to look for is the collected refusal list.
      expect(service).toMatch(/const refused/);
      expect(service).toMatch(/refused\.push/);
    });

    it('counts the references it refuses on, so the operator knows what to detach', () => {
      // A refusal that says only "in use" sends the operator to grep the database. The count
      // is the difference between a refusal and a to-do list.
      const service = read(SERVICE);
      expect(service).toMatch(/bindingCount/);
      expect(service).toMatch(/automationCount/);
    });

    it('never queries with an unbounded capability write', () => {
      // `updateMany` takes no `select` and `deleteMany` rejects it outright; more importantly
      // a fleet-wide `updateMany` without a `where` on tenant would rewrite every tenant's
      // devices from a platform console click.
      const service = read(SERVICE);
      expect(service).toMatch(/capability\.updateMany\(\{/);
      const apply = service.slice(service.indexOf('capability.updateMany({'));
      expect(apply.slice(0, 400)).toMatch(/where:/);
      expect(apply.slice(0, 400)).not.toMatch(/where:\s*\{\s*\}/);
    });

    it('scopes the devices it may touch to one tenant', () => {
      // A multi-tenant probe needs a tenant per account, not one shared tenant — and an apply
      // route that takes only a `templateId` would move every tenant's devices at once.
      const controller = read(CONTROLLER);
      const apply = controller.slice(controller.indexOf("platform-capability-versions/apply"));
      expect(apply).toMatch(/tenantId/);
    });

    it('can move the fleet backwards, but only when the rollback is asked for by name', () => {
      // Refusing to publish a lower version is right -- a typo in a version number would
      // otherwise repoint a whole fleet at an older shape. But taken alone it makes a bad
      // publication permanent: the fleet has been moved onto a broken version and the lifecycle
      // offers no way back.
      //
      // This was not theoretical. The probe that exercises `apply` restores the fleet by
      // publishing the seeded version and applying it, and it could not -- 1.0.0 is lower than
      // the probe's 9.9.9 -- so a real device was left on the probe's version with no supported
      // route back. The flag is what the restore needed and what it now uses.
      const service = read(SERVICE);
      expect(service).toMatch(/rollback\?: boolean/);
      // The refusal names the way out, so an operator who hits it is not left guessing.
      expect(service).toMatch(/pass rollback to move the fleet backwards/);
      // And a rollback is distinguishable in the audit trail from an ordinary publication.
      expect(service).toMatch(/rollback=true/);
    });

    it('promotes an existing draft rather than failing on a duplicate version', () => {
      // Every template is created with a 1.0.0 draft, so "publish 1.0.0" is not an edge case --
      // it is the first thing an operator does. Creating a second row for it violates
      // `@@unique([templateId, version])` and surfaces as a 500.
      //
      // The probe hit this for real while restoring a fleet: rolling back from 9.9.9 to the
      // seeded 1.0.0 returned 500 `PrismaClientKnownRequestError`, and the device stayed on the
      // broken version with no route out. The rollback an operator reaches for when a
      // publication goes wrong is the one most likely to hit the version that already exists.
      const service = read(SERVICE);
      const publish = service.slice(service.indexOf('async publishVersion'));
      const transaction = publish.slice(0, publish.indexOf('this.audit('));

      expect(transaction).toMatch(/capabilityTemplateVersion\.findFirst/);
      expect(transaction).toMatch(/existingVersion\s*\?/);
      expect(transaction).toMatch(/capabilityTemplateVersion\.update\(\{ where: \{ id: existingVersion\.id \}/);
      expect(transaction).toMatch(/capabilityTemplateVersion\.create\(/);
    });

    it('applies the complete published shape rather than stamping schemaVersion alone', () => {
      const service = read(SERVICE);
      const apply = service.slice(service.indexOf('async applyVersion'));
      const update = apply.slice(
        apply.indexOf('capability.updateMany({'),
        apply.indexOf('this.audit('),
      );
      expect(update).toMatch(/schemaVersion:\s*target\.version/);
      expect(update).toMatch(/semanticType:\s*template\.semanticType/);
      expect(update).toMatch(/dataType:\s*template\.dataType/);
      expect(update).toMatch(/unit:\s*template\.unit/);
      expect(update).toMatch(/constraints:\s*target\.constraints/);
      expect(update).toMatch(/isReadable:\s*target\.isReadable/);
      expect(update).toMatch(/isWritable:\s*target\.isWritable/);
      expect(update).toMatch(/isReportable:\s*target\.isReportable/);

      // A row already labelled with the published version can still carry the old shape from
      // the historical bug, so candidate selection must inspect fields other than version.
      expect(apply).toMatch(/candidate\.semanticType !== template\.semanticType/);
      expect(apply).toMatch(/candidate\.isWritable !== target\.isWritable/);
    });

    it('records the apply in the audit log', () => {
      // A capability schema change is exactly the kind of mutation that leaves no other
      // trace: the row is updated in place, so without an audit row there is no way to ask
      // why a device is on the version it is on.
      // The repo's audit table is `RbacAuditLog` (mapped to `rbac_audit_log`) — an assertion
      // looking for `auditLog.create` would search for a model that does not exist and, worse,
      // would pass if someone added one.
      const service = read(SERVICE);
      expect(service).toMatch(/rbacAuditLog\.create/);
    });

    it('is idempotent for a device already on the target version', () => {
      // Re-running an apply over a fleet that is already aligned is the normal case after a
      // partial run. Refusing it would make the control look broken on the second press.
      const service = read(SERVICE);
      expect(service).toMatch(/alreadyOnTarget|skipped|updated:/);
    });
  });

  describe('console', () => {
    it('offers the apply action from the drift view it already renders', () => {
      // The drift panel has been showing `hasVersionDrift` with nothing to do about it. The
      // control belongs on that screen; a separate page nobody navigates to is not a control.
      const panel = read('apps/admin-web/components/super-capability-versions-panel.tsx');
      expect(panel).toMatch(/Terapkan|Apply/i);
    });

    it('has a BFF route for the apply, and it does not flatten the refusal', () => {
      // The refusal names the references. Flattening it into a generic 500 or a 401 would
      // destroy the only information the operator needs.
      const route = read('apps/admin-web/app/api/admin/capability-versions/apply/route.ts');
      // `proxyBackend` returns the backend's own body on success, which is how the refusal
      // list survives the hop: the route does not rebuild the response, so `refused` and its
      // counts reach the console untouched. Asserting the route *mentions* the counts would be
      // satisfied by a comment, and would have been "fixed" by writing that comment.
      expect(route).toContain('proxyBackend');
      expect(route).not.toMatch(/\.json\(\s*\{\s*(updated|items|templates)\b/);
      // And it does not intercept an error to replace it with a generic message.
      expect(route).not.toMatch(/catch[^{]*\{[\s\S]{0,200}Gagal menerapkan/);
    });
  });
});
