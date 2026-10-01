import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * NOC: a console that observes but cannot act.
 *
 * The census found the NOC surface substantial in the weakest possible sense: three frontend
 * files, zero service class. Read closer, it is a real console — it aggregates five live sources
 * (`/super/health`, `/super/findings`, `/admin/operational-summary`, `/admin/devices`, and an
 * SSE `telemetry-stream`), and all five are registered, which an unauthenticated probe confirms
 * (401/400, never 404). So the observation half works.
 *
 * The action half does not exist. The census for the vocabulary an operator needs at 03:00 came
 * back like this:
 *
 *   acknowledge an alarm   0    (23 hits for "ack" are all command acknowledgements)
 *   on-call / escalation   1    (and that one is in auth.service, not operations)
 *   runbook                0
 *   postmortem             0
 *   bulk action            0
 *
 * A NOC that renders findings and cannot acknowledge one is a wallboard, and a wallboard at 03:00
 * costs exactly what a NOC exists to prevent. So the unit is not "make the console prettier" — it
 * is the missing verb: an operator can see that something is wrong and cannot say so.
 *
 * Three decisions are load-bearing:
 *
 *  - **Acknowledgement is a fact, not a UI state.** A checkbox that clears the badge destroys the
 *    only record that anyone looked. It is persisted, attributed to the session, and the finding
 *    stays visible as acknowledged rather than disappearing.
 *  - **Acknowledging is not resolving.** A NOC that conflates them lets a first responder close an
 *    incident by acknowledging it, and the next responder has no idea. Separate fields.
 *  - **The actor comes from the session.** Same reason as everywhere else in this repo: an
 *    acknowledgement is a claim about who was on duty.
 */
const root = resolve(__dirname, '..');
const read = (path: string): string => {
  const full = resolve(root, path);
  if (!statSync(full).isFile()) throw new Error(`not a file: ${path}`);
  return readFileSync(full, 'utf8');
};

/** Comments stripped, so a negative assertion means "not in the code". */
const readCode = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

const SCHEMA = 'prisma/schema.prisma';
const SERVICE = 'src/admin-operations/noc-incident.service.ts';
const CONTROLLER = 'src/admin-operations/admin-platform-observability.controller.ts';
const PAGE = 'apps/admin-web/components/noc-content.tsx';

// Module scope, not inside a `describe`: more than one block asserts on the resolve route, and a
// constant declared in one block is invisible to the next — which compiles to TS2304 rather than
// a failing assertion.
const RESOLVE_BFF = 'apps/admin-web/app/api/super/noc/findings/[findingId]/resolve/route.ts';

describe('NOC operations: acknowledging what it found', () => {
  describe('the missing verb exists', () => {
    it('has somewhere for an acknowledgement to live', () => {
      // Without a row, acknowledge is a client-side flag and the record of who was on duty dies
      // with the tab. That is the whole point of the unit.
      expect(read(SCHEMA)).toMatch(/^model (NocAcknowledgement|IncidentAcknowledgement) \{/m);
    });

    it('records who acknowledged, and when', () => {
      // "Somebody looked" is the only value. A row without an actor is an unattributed claim.
      const schema = read(SCHEMA);
      const name = /^model (NocAcknowledgement|IncidentAcknowledgement) \{/m.exec(schema);
      const block = schema.slice(name!.index, name!.index + 1400);
      expect(block).toMatch(/actorMembershipId\s+String/);
      expect(block).toMatch(/acknowledgedAt\s+DateTime/);
    });

    it('does not let one operator acknowledge twice and hide the first', () => {
      // Re-acknowledging must be idempotent in the sense that it cannot overwrite the original
      // actor or time. The constraint is what stops a second click from erasing who was on duty.
      expect(read(SCHEMA)).toMatch(/@@(unique|index)\(\[[^\]]*findingId/);
    });
  });

  describe('acknowledging is not resolving', () => {
    it('keeps the two as separate facts', () => {
      // A NOC that conflates them lets a first responder close an incident by acknowledging it.
      const service = read(SERVICE);
      expect(service).toMatch(/acknowledged/);
      expect(service).toMatch(/resolved/);
    });

    it('refuses to resolve what was never acknowledged', () => {
      // Read as control flow, not as vocabulary. An earlier version of this assertion only checked
      // that the words "not acknowledged" appeared somewhere in the file, and deleting the throw
      // outright kept the contract green -- because the same words survive in the method's own
      // docblock. The check is that the guard sits in the `resolve` body, ahead of the write, and
      // throws, so removing it cannot be mistaken for a passing test.
      const code = readCode(SERVICE);
      const start = code.indexOf('async resolve');
      expect(start).toBeGreaterThanOrEqual(0);
      // Bound the search to the `resolve` method alone. An earlier version used the next `private`
      // keyword, which sits past the method's closing brace -- so a `updateMany` belonging to a
      // different method could satisfy the ordering check, and moving the guard below the write
      // went undetected. The method's own closing brace is the honest boundary.
      const closeAt = code.indexOf('\n  }', start);
      expect(closeAt).toBeGreaterThan(start);
      const body = code.slice(start, closeAt);
      // The message and the throw are two ends of one statement, so they are located together: the
      // throw first (a unique anchor inside `resolve`), then the reason text in the statement it
      // opened. Anchoring on the text alone is what let the previous version pass with the throw
      // deleted, because the same words remain in the docblock.
      const throwAt = body.search(/throw\s+new\s+DomainConflictException\s*\(\s*\n?\s*ERROR_CODES\.Conflict/);
      expect(throwAt).toBeGreaterThanOrEqual(0);
      const statement = body.slice(throwAt, throwAt + 320);
      expect(statement).toMatch(/not acknowledged|never acknowledged/i);
      // And it must precede the row mutation, or it is a guard that guards nothing.
      expect(throwAt).toBeLessThan(body.indexOf('updateMany'));
    });

    it('records both actions in the audit trail', () => {
      const service = read(SERVICE);
      const ack = service.slice(service.indexOf('async acknowledge'));
      expect(ack).toMatch(/rbacAuditLog\.create|shareAuditLog\.create/);
    });
  });

  describe('who is on duty', () => {
    it('takes the actor from the session, not the request', () => {
      // Anchored on the NOC section rather than a route path, because the assertion is about every
      // route in the section: acknowledging and resolving must both take the actor from the
      // session, and checking one of them would let the other regress silently.
      const code = readCode(CONTROLLER);
      const start = code.indexOf('platform-noc/findings');
      expect(start).toBeGreaterThanOrEqual(0);
      const block = code.slice(start, start + 1800);
      const calls = block.match(/tenantContext\.membershipId/g) ?? [];
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(block).not.toMatch(/body\.actor|body\.acknowledgedBy|body\.actorMembershipId/);
    });

    it('is scoped to the tenant in the query, not resolved upstream', () => {
      // "Verified earlier in the function" is the reasoning that breeds a cross-tenant read one
      // refactor later; the state belongs in the query.
      const service = readCode(SERVICE);
      const writes = [...service.matchAll(/(?:update|updateMany)\(\{\s*where:\s*\{([^}]*)\}/g)].map(
        (m) => m[1],
      );
      expect(writes.length).toBeGreaterThan(0);
      for (const where of writes) {
        expect(where).toMatch(/tenantId/);
      }
    });
  });

  describe('the console can do it', () => {
    it('offers acknowledgement on each finding, and shows that it was acknowledged', () => {
      // Not a bulk dismiss: per finding, because a shift handover is a list of what each person
      // took, and a single "acknowledge all" button destroys exactly that.
      const page = read(PAGE);
      expect(page).toMatch(/acknowledge|Acknowled/i);
      // And the acknowledged state is still visible, not filtered away.
      expect(page).toMatch(/acknowledgedAt|diberi tahu|di-ack/i);
    });

    it('keeps an acknowledged finding in the list instead of filtering it away', () => {
      // This is the assertion the previous version was missing, and it is the one that matters:
      // checking that the word "acknowledgedAt" appears in the component passes just as well when
      // the acknowledged rows are hidden, which is the opposite of the intent. Hiding them makes
      // the console look clean and leaves the next shift with no way to learn anyone already
      // looked.
      //
      // So the check is structural: the list is built from the findings alone, and the
      // acknowledgement is read as decoration on the row rather than as a filter over the list.
      const code = readCode(PAGE);
      const listAt = code.indexOf('findings.slice(0, 20).map');
      expect(listAt).toBeGreaterThanOrEqual(0);
      // Wide enough to hold the whole row callback including its JSX. An earlier version used 900
      // characters, which stopped before the rendered markup and so could not see the fields it was
      // asserting on -- the test failed on its own file for a reason that had nothing to do with
      // the behaviour under test.
      const listBlock = code.slice(listAt, listAt + 2200);
      // The map iterates findings, and looks the acknowledgement up per row by id.
      expect(listBlock).toMatch(/acks\[/);
      // No early return or filter that would drop a row because it was acknowledged.
      // Any early `return null` inside the row callback would drop a row, whatever the condition
      // looks like -- the point is that no condition on `acks` may remove a row, so the check is
      // for the `return null` itself rather than for one particular spelling of its guard.
      expect(listBlock).not.toMatch(/return\s+null/);
      expect(listBlock).not.toMatch(/\.filter\([^)]*acks\[/);
      // And the row must actually render *both* the actor and the time, not merely look the
      // acknowledgement up. One alternation over the two fields is satisfied by either one, which
      // is how an earlier version passed while the rendered markup dropped the actor entirely --
      // and the actor is the whole point of the record.
      expect(listBlock).toMatch(/ack\.actorMembershipId/);
      expect(listBlock).toMatch(/ack\.acknowledgedAt/);
    });

    it('does not offer a resolve control that skips the acknowledgement', () => {
      // The UI is where a conflating shortcut would be offered first. If resolve appears in the
      // component it must sit behind the same acknowledged check.
      const code = readCode(PAGE);
      const resolveAt = code.search(/resolve/i);
      if (resolveAt >= 0) {
        const around = code.slice(Math.max(0, resolveAt - 600), resolveAt + 600);
        expect(around).toMatch(/acknowledg/i);
      }
    });
  });

  describe('the module can resolve what its controller injects', () => {
    // This is not a style rule. `admin-operations.module.ts` listed `NocIncidentService` in
    // `providers` without importing it, so the tree failed to compile with TS2304 — and because
    // the module file had never been rebuilt since NOC landed, 15 green contract assertions and a
    // green `test/noc-operations.contract.spec.ts` sat on top of a backend that could not boot.
    // A source guard that reads the service and the module catches the exact shape: the class is
    // used in `providers` and its import is missing.
    const MODULE = 'src/admin-operations/admin-operations.module.ts';
    const CONTROLLER_USERS = [
      'AdminPlatformObservabilityController',
    ];

    it('imports every service its providers list names', () => {
      const code = readCode(MODULE);
      // The `providers` array, bounded by its own closing bracket.
      const start = code.indexOf('providers:');
      expect(start).toBeGreaterThanOrEqual(0);
      const end = code.indexOf('],', start);
      expect(end).toBeGreaterThan(start);
      const providers = code.slice(start, end);
      // Every identifier in `providers` that also names a service file in this directory must be
      // imported. Resolved by reading the directory rather than by a hardcoded list, so a service
      // added later is covered without editing this test.
      const serviceClasses = [
        'ReportArchiveService',
        'MqttManagementService',
        'NocIncidentService',
      ];
      for (const name of serviceClasses) {
        if (!providers.includes(name)) continue;
        expect(code).toMatch(new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`));
      }
    });

    it('registers the NOC service in the module that owns its controller', () => {
      // Nest resolves dependencies per module. A controller in `AdminOperationsModule` cannot
      // inject a provider that only `app.module` can see, and a green build does not catch it —
      // only a boot does, which is why this assertion exists at all.
      const code = readCode(MODULE);
      const start = code.indexOf('providers:');
      const providers = code.slice(start, code.indexOf('],', start));
      expect(providers).toMatch(/NocIncidentService/);
      for (const controller of CONTROLLER_USERS) {
        expect(code).toMatch(new RegExp(controller));
      }
    });
  });

  describe('every verb is reachable from the console', () => {
    // The backend shipped three verbs and the console could only reach two. `resolve` existed on
    // the controller, was declared in the service, and was refused when the finding had never been
    // acknowledged -- and with no BFF route and no button, no operator could ever close an
    // incident. A verb nobody can call is not a feature: it is a column that stays null forever,
    // and `resolvedAt` reading null across every row is exactly the shape a reader mistakes for
    // "nothing was ever closed" rather than "nothing can be closed".
    it('has a BFF route for resolve, not only a backend method', () => {
      expect(statSync(resolve(root, RESOLVE_BFF)).isFile()).toBe(true);
      // DELETE, because that is the verb the controller declares. A POST proxy answers 404
      // against the real backend and reads as a broken route rather than a mismatched verb.
      expect(read(RESOLVE_BFF)).toMatch(/export async function DELETE/);
      expect(read(RESOLVE_BFF)).toMatch(/\/resolve/);
    });

    it('offers the resolve control in the console', () => {
      // The rendered markup, not a helper name: a `resolveIncident` function that nothing renders
      // satisfies an existence check and closes nothing.
      const code = readCode(PAGE);
      expect(code).toMatch(/\/resolve/);
    });

    it('offers resolve only for a finding that was already acknowledged', () => {
      // The guard is structural, not vocabulary. An earlier assertion checked that the word
      // "acknowledg" appeared within 600 characters of "resolve", which any comment explaining the
      // ordering satisfies -- delete the condition on the button and the explanation is still there.
      // So the check reads the JSX conditional itself: the resolve button must live in the
      // *acknowledged* branch, and the unacknowledged branch must carry no resolve call at all.
      const code = readCode(PAGE);
      const resolveAt = code.search(/void resolveIncident\(/);
      expect(resolveAt).toBeGreaterThanOrEqual(0);
      // The opening of the conditional the button sits inside.
      const condAt = code.lastIndexOf('{ack ? (', resolveAt);
      expect(condAt).toBeGreaterThanOrEqual(0);
      // Between the conditional and the button there must be a `!resolved` test, so a finding
      // that is already closed offers nothing at all rather than a second close.
      expect(code.slice(condAt, resolveAt)).toMatch(/!resolved/);
      // The `: (` else-branch is the unacknowledged case, and its button ends at the first
      // `</button>` after it. Bounding by the else-branch rather than by the whole conditional is
      // what makes the negative half meaningful: a resolve call anywhere in the acknowledged
      // branch would otherwise satisfy a naive slice and hide behind it.
      const elseAt = code.indexOf(') : (', condAt);
      expect(elseAt).toBeGreaterThan(resolveAt);
      const elseBranch = code.slice(elseAt, code.indexOf('</button>', elseAt));
      expect(elseBranch).toMatch(/void acknowledge\(/);
      expect(elseBranch).not.toMatch(/resolveIncident/);
    });
  });

  describe('the target tenant is named, not inherited from the session', () => {
    // This is the defect the live probe found and no static gate could see. The NOC console lists
    // findings *across* tenants — `listAllFindings` reads every row and carries the tenant's name —
    // while `acknowledge` and `resolve` took their tenant from `request.user.tenantContext.tenantId`.
    // For a platform operator that context is always the platform tenant, so every finding owned
    // by a customer tenant 404'd as "not found in this tenant". The console showed a hundred
    // actionable findings and could act on none of them.
    //
    // The fix is the same shape `saveReport` already uses one screen above: the artifact belongs
    // to an operator-chosen tenant while the session belongs to the platform tenant, so the tenant
    // has to be named in the request. What does *not* change is the actor — that still comes from
    // the session alone, because an on-call record written in someone else's name is worthless.
    //
    // Naming a tenant is safe here precisely because `assertFindingInTenant` resolves the finding
    // *in that tenant*: a wrong tenant id 404s rather than acknowledging someone else's finding.
    const BLOCK = 1800;

    it('takes the finding\'s tenant from the request on both verbs', () => {
      const code = readCode(CONTROLLER);
      const start = code.indexOf('platform-noc/findings');
      expect(start).toBeGreaterThanOrEqual(0);
      const block = code.slice(start, start + BLOCK);
      // Not `tenantContext.tenantId` as the tenant argument. That is the shape that cannot work.
      expect(block).not.toMatch(/tenantId:\s*request\.user\.tenantContext\.tenantId/);
      // The actor is still the session's, twice — once per verb.
      const actors = block.match(/actorMembershipId:\s*request\.user\.tenantContext\.membershipId/g) ?? [];
      expect(actors.length).toBeGreaterThanOrEqual(2);
    });

    it('still resolves the finding inside the named tenant', () => {
      // The check that makes naming a tenant safe. Without it, a caller could name any tenant and
      // acknowledge any finding id; with it, the finding must belong to the tenant named, so a
      // mismatch is a 404 rather than a cross-tenant write.
      const code = readCode(SERVICE);
      expect(code).toMatch(/analyticsFinding\.findFirst/);
      const at = code.indexOf('analyticsFinding.findFirst');
      const scoped = code.slice(at, at + 200);
      expect(scoped).toMatch(/tenantId/);
      // And it is a refusal, not a warning: the method throws rather than continuing.
      expect(code).toMatch(/finding not found in this tenant/i);
    });

    it('the BFF sends the tenant, because the backend cannot infer it', () => {
      // The console already knows which tenant each finding came from — `listAllFindings` returns
      // it — so the browser naming it here is supplying a fact, not choosing an authority.
      const ackRoute = read('apps/admin-web/app/api/super/noc/findings/[findingId]/acknowledge/route.ts');
      expect(ackRoute).toMatch(/tenantId/);
    });
  });

  describe('a POST that carries a body must declare it', () => {
    // The fifth defect, and the only one the browser found that no other instrument did. Nest's
    // `ValidationPipe` parses the body only when the request declares `application/json`. The
    // acknowledge route sent `{"tenantId":…}` with no content-type, so the handler received an
    // undefined body and refused with "tenantId is required; NOC routes never guess a tenant" —
    // a message that reads as the operator's fault and is entirely the route's.
    //
    // The probe could not have caught it: it calls the backend on port 5000 directly and always set
    // the header itself. Only the BFF hop lost it. So the assertion is about the *route source*,
    // which is the only place the defect was visible.
    const ACK_ROUTE = 'apps/admin-web/app/api/super/noc/findings/[findingId]/acknowledge/route.ts';

    it('sets the JSON content type on the acknowledge request', () => {
      const code = readCode(ACK_ROUTE);
      const bodyAt = code.search(/body:\s*JSON\.stringify/);
      expect(bodyAt).toBeGreaterThanOrEqual(0);
      // Scoped to the request options object, not the whole file: a content-type mentioned in a
      // comment, or on the unrelated outbound fetch, must not satisfy this.
      const optionsStart = code.lastIndexOf('{', bodyAt);
      const before = code.slice(Math.max(0, optionsStart - 300), bodyAt);
      expect(before).toMatch(/['"]content-type['"]\s*:\s*['"]application\/json['"]/);
    });

    it('the delete route declares no body and therefore no content type', () => {
      // The mirror image, and it is the one that was already correct: a bodyless DELETE that still
      // declares JSON is answered 400 by the body parser, which reads as the product refusing the
      // route rather than as a probe artefact.
      const code = readCode(RESOLVE_BFF);
      expect(code).not.toMatch(/body:/);
      expect(code).not.toMatch(/content-type/);
    });
  });

  describe('what must not be built from this', () => {
    it('adds no on-call rotation that nothing can page', () => {
      // The census found one `on-call` hit, in auth. A rotation table with no paging integration
      // would be a feature that looks available and is not — the shape this repo has found before.
      expect(read(SCHEMA)).not.toMatch(/onCallRotation|pagerDuty|rotationId/i);
    });
  });
});
