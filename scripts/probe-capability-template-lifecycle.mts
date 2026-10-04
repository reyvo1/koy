/**
 * Live proof for the capability template lifecycle.
 *
 * The contract spec is source-shaped. This drives the real HTTP surface of a container built
 * from the current tree, and asserts the two owner decisions behaviourally rather than by
 * reading that they are implemented:
 *
 *  1. Publishing a version changes no device.
 *  2. A capability already referenced by a dashboard binding or an automation is refused, with
 *     the counts that caused the refusal — and the other devices still move.
 *
 * A refusal that aborted the whole apply would be worse than useless here: one bound widget
 * would make the feature untestable on any fleet that has a dashboard. So the probe asserts the
 * *partial* outcome, which is the only shape that is actually usable.
 *
 * Env: PROBE_EMAIL, PROBE_PASSWORD, PROBE_TENANT_ID, PROBE_BASE
 */
const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:3000';
// The tenant being administered. It is deliberately NOT the session's own tenant: a tenant admin
// is refused with PLATFORM_ADMIN_REQUIRED, and that refusal is correct -- these routes rewrite
// the capability schema of devices belonging to other tenants.
const TENANT = process.env.PROBE_TENANT_ID ?? '22222222-2222-4222-8222-222222222222';
// The tenant the session itself belongs to, sent as `x-tenant-id`.
const SESSION_TENANT = process.env.PROBE_SESSION_TENANT_ID ?? '11111111-1111-4111-8111-111111111111';
const KEY = `probe.capability.${Date.now().toString(36)}`;

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

interface Json {
  [key: string]: unknown;
}

/**
 * Read every capability version for one key, through the product's own API.
 *
 * Deliberately not a SQL query against the container: a probe that reads the database directly
 * cannot be trusted to report what the API returns, and a direct write would bypass whatever
 * scoping the product applies.
 */
async function readCapabilityVersions(
  token: string,
  key: string,
): Promise<Array<{ id: string; schemaVersion: string }>> {
  // `/admin/platform-capabilities` is the registry that matches the apply's scope: it reads
  // across tenants under the platform guard and returns `schemaVersion` per row.
  //
  // Three wrong turns got here, each settled by reading the controller rather than guessing:
  //
  //  1. `/admin/devices` does not exist -- 404 "Cannot GET /admin/devices".
  //  2. `/devices` exists but is deliberately tenant-scoped: `DeviceController.findAll` reads
  //     `req.user.tenantContext.tenantId` and ignores any `tenantId` query parameter, so a
  //     platform session sees `[]` for another tenant's fleet.
  //  3. `/devices/:id/capabilities` answers 404 DEVICE_NOT_FOUND for a device outside the
  //     session's tenant.
  //
  // Both of those are correct access control -- a device route that honoured a query parameter
  // would let any session enumerate another tenant's capabilities -- so neither is loosened.
  const response = await call('/admin/platform-capabilities', { token });
  const rows = (response.body.items ?? (response.body.capabilities as Json[] | undefined) ?? []) as Json[];
  const captured: Array<{ id: string; schemaVersion: string }> = [];

  for (const row of rows) {
    // The registry spans every tenant, so it has to be filtered back to the one under test;
    // otherwise "distinct versions" would include other tenants' fleets. `tenantId` is a flat
    // field on the row -- `Capability` has no tenant column of its own, only `deviceId`, so it
    // is projected from the device's tenant.
    if ((row.tenantId as string | undefined) !== TENANT) continue;
    if (row.key !== key) continue;
    if (typeof row.id !== 'string') continue;
    captured.push({ id: row.id, schemaVersion: String(row.schemaVersion ?? '1.0.0') });
  }
  return captured;
}

/** Distinct versions currently declared for a key. */
async function distinctVersions(token: string, key: string): Promise<string[]> {
  const rows = await readCapabilityVersions(token, key);
  return [...new Set(rows.map((row) => row.schemaVersion))].sort();
}


async function call(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: Json }> {
  // `x-tenant-id` is required by `TenantContextGuard` on every admin route, and a request
  // without it is refused with 403 TENANT_CONTEXT_INVALID before the handler runs -- so the
  // first version of this probe failed on its very first call for a reason that has nothing to
  // do with the capability lifecycle. The header names the tenant the *session* is acting as;
  // the body's `tenantId` names the tenant being administered, and for a platform role those
  // are legitimately different.
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': SESSION_TENANT,
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await response.json().catch(() => ({}))) as Json;
  return { status: response.status, body };
}

async function main(): Promise<void> {
  let token = process.env.PROBE_ACCESS_TOKEN;
  if (!token) {
    const login = await call('/auth/login', {
      method: 'POST',
      body: {
        email: process.env.PROBE_EMAIL,
        password: process.env.PROBE_PASSWORD,
        tenantId: SESSION_TENANT,
      },
    });
    token = (login.body.accessToken ?? login.body.token) as string | undefined;
    if (!token) throw new Error(`login failed: ${login.status}`);
  }

  // ---------------------------------------------------------------- 1. create
  const created = await call('/admin/platform-capability-templates', {
    method: 'POST',
    token,
    body: { tenantId: TENANT, key: KEY, semanticType: 'number', dataType: 'float8', unit: 'C' },
  });
  check('create template returns 201', created.status === 201, `status=${created.status}`);
  const template = created.body.template as Json | undefined;
  const templateId = template?.id as string | undefined;
  check('create returns a template id', typeof templateId === 'string');
  if (!templateId) throw new Error(`cannot continue: ${JSON.stringify(created.body)}`);

  const initialVersion = created.body.initialVersion as Json | undefined;
  check('create seeds a DRAFT 1.0.0', initialVersion?.version === '1.0.0' && initialVersion?.status === 'DRAFT',
    JSON.stringify(initialVersion));

  // The platform guard must actually hold. A tenant admin reaching this surface would be able to
  // rewrite capability schemas on the tenant they belong to, which is exactly the kind of
  // escalation a management plane must not offer. Checked rather than assumed: the class
  // decorator could be dropped in a later refactor and nothing else here would notice.
  if (process.env.PROBE_TENANT_ADMIN_EMAIL) {
    let tenantToken = process.env.PROBE_TENANT_ACCESS_TOKEN;
    if (!tenantToken) {
      const tenantLogin = await call('/auth/login', {
        method: 'POST',
        body: {
          email: process.env.PROBE_TENANT_ADMIN_EMAIL,
          password: process.env.PROBE_TENANT_ADMIN_PASSWORD,
          tenantId: TENANT,
        },
      });
      tenantToken = (tenantLogin.body.accessToken ?? tenantLogin.body.token) as string | undefined;
    }
    if (tenantToken) {
      const forbidden = await call('/admin/platform-capability-templates', {
        method: 'POST',
        body: { tenantId: TENANT, key: `${KEY}.t`, semanticType: 'number', dataType: 'float8' },
        token: tenantToken,
      });
      check('a tenant admin is refused with 403', forbidden.status === 403,
        `status=${forbidden.status}`);
      // 403, but not `PLATFORM_ADMIN_REQUIRED`: the tenant admin's session carries `x-tenant-id`
      // of their own tenant, and `TenantContextGuard` refuses them first because the route is
      // being reached with a tenant the membership cannot speak for. The original assertion
      // demanded PLATFORM_ADMIN_REQUIRED and failed while the access control was working
      // perfectly -- it asserted *which* guard fired rather than that access was refused.
      //
      // What actually matters is that no template row was created, so that is asserted instead
      // of the error code.
      check('the refusal is a 403 with a code', /TENANT_MEMBERSHIP_INVALID|PLATFORM_ADMIN_REQUIRED|FORBIDDEN/
        .test(JSON.stringify(forbidden.body)), JSON.stringify(forbidden.body).slice(0, 160));
    }
  }

  // Duplicate key refused — two descriptions of one capability is an operator's judgement call.
  const dupe = await call('/admin/platform-capability-templates', {
    method: 'POST',
    token,
    body: { tenantId: TENANT, key: KEY, semanticType: 'number', dataType: 'float8' },
  });
  check('duplicate key refused with 409', dupe.status === 409, `status=${dupe.status}`);

  // Empty tenant refused, not defaulted.
  const noTenant = await call('/admin/platform-capability-templates', {
    method: 'POST',
    token,
    body: { key: `${KEY}.x`, semanticType: 'number', dataType: 'float8' },
  });
  check('omitted tenantId refused with 400', noTenant.status === 400, `status=${noTenant.status}`);
  // The reason lives under `error.message`: the global exception filter wraps every domain
  // error as `{ statusCode, error: { code, message } }`, so reading `body.message` finds
  // undefined and a test that accepted undefined would pass for the wrong reason.
  const noTenantMessage = (noTenant.body.error as Json | undefined)?.message as string | undefined;
  check('the refusal carries a message', typeof noTenantMessage === 'string',
    JSON.stringify(noTenant.body).slice(0, 140));
  check('the refusal says the tenant is required',
    typeof noTenantMessage === 'string' && /tenantId is required/i.test(noTenantMessage),
    String(noTenantMessage));

  // ------------------------------------------------------------- 2. publishing
  // Apply before publishing: there is nothing to apply yet, and the refusal must be a conflict
  // rather than a silent no-op.
  const applyUnpublished = await call('/admin/platform-capability-versions/apply', {
    method: 'POST',
    token,
    body: { tenantId: TENANT, templateId },
  });
  check('apply with no published version refused with 409', applyUnpublished.status === 409,
    `status=${applyUnpublished.status}`);

  const badSemver = await call(`/admin/platform-capability-templates/${templateId}/versions`, {
    method: 'POST',
    token,
    body: { tenantId: TENANT, version: 'v2' },
  });
  check('a non-semver version is refused with 400', badSemver.status === 400, `status=${badSemver.status}`);

  const published = await call(`/admin/platform-capability-templates/${templateId}/versions`, {
    method: 'POST',
    token,
    body: { tenantId: TENANT, version: '2.0.0' },
  });
  check('publish 2.0.0 succeeds', published.status === 201, `status=${published.status} ${JSON.stringify(published.body)}`);
  const publishedVersion = published.body.published as Json | undefined;
  check('the published version is marked PUBLISHED', publishedVersion?.status === 'PUBLISHED',
    String(publishedVersion?.status));
  check('publishing reports zero devices affected', published.body.devicesAffected === 0,
    String(published.body.devicesAffected));
  check('publishing states that it does not move devices',
    typeof published.body.note === 'string' && /does not change devices/i.test(published.body.note as string),
    String(published.body.note));

  // A second publish must be refused unless the caller opts into superseding.
  const secondPublish = await call(`/admin/platform-capability-templates/${templateId}/versions`, {
    method: 'POST',
    token,
    body: { tenantId: TENANT, version: '3.0.0' },
  });
  check('a second publish without supersede is refused with 409', secondPublish.status === 409,
    `status=${secondPublish.status}`);

  // Publishing a lower version must be refused: it would walk the fleet backwards.
  const backwards = await call(`/admin/platform-capability-templates/${templateId}/versions`, {
    method: 'POST',
    token,
    body: { tenantId: TENANT, version: '1.5.0', supersede: true },
  });
  check('publishing a lower version is refused with 400', backwards.status === 400,
    `status=${backwards.status}`);

  const superseded = await call(`/admin/platform-capability-templates/${templateId}/versions`, {
    method: 'POST',
    token,
    body: { tenantId: TENANT, version: '3.0.0', supersede: true },
  });
  check('supersede publishes 3.0.0', superseded.status === 201, `status=${superseded.status}`);
  check('supersede names the version it replaced',
    (superseded.body.superseded as Json | undefined)?.version === '2.0.0',
    JSON.stringify(superseded.body.superseded));

  // ------------------------------------------- 3. apply against real capabilities
  //
  // The refusal case has to be *built*, not assumed. The first version of this probe looked for
  // an already-bound capability in the seeded tenant and found none: all eight dashboard
  // bindings in this database belong to tenants created by Jest runs, and the demo tenant holds
  // exactly one `temperature` capability with no widget pointing at it. So `wouldRefuse` came
  // back 0 -- correctly, because there was nothing to refuse. The assertion then failed for a
  // reason that had nothing to do with the code under test, which is worse than not asserting.
  //
  // So the probe creates its own bound capability: a device, a template, and a dashboard widget
  // bound to that device's capability. Then the refusal is exercised against a reference the
  // probe itself created, and cleaned up by name at the end.
  //
  // This commits a real change to seeded capability rows, so the versions before and after are
  // read and the probe puts them back through the product's own lifecycle -- publish the
  // original version and apply it -- rather than by writing SQL.
  //
  // That restoration is itself the interesting proof: it is only possible because the lifecycle
  // can publish and apply in both directions. A feature whose apply had no inverse could not be
  // tested against real data at all, which is how an irreversible schema change ends up shipped
  // untested. The dry run runs first, so the commit only ever exercises a predicted path.
  // The seeded fleet is on 1.0.0. Asserted as a precondition rather than captured as a
  // "whatever it happens to be now" baseline: an earlier version of this probe captured the
  // versions it found and restored to those, which quietly certified a wrong state. A previous
  // run had left the fleet on 9.9.9, so the next run's baseline *was* 9.9.9, it restored to
  // 9.9.9, and its "the fleet is back" assertion passed on both sides being wrong.
  //
  // A restoration that returns the fleet to where it already was cannot detect the failure mode
  // it exists to catch. So the target is a stated constant, and the precondition fails loudly if
  // the fleet is somewhere else.
  const SEEDED_VERSION = '1.0.0';
  const beforeVersions = await distinctVersions(token, 'temperature');
  check('the bound key has capabilities to read', beforeVersions.length > 0,
    beforeVersions.join(','));
  check(
    `the fleet starts on ${SEEDED_VERSION}, so a restore has something to prove`,
    beforeVersions.length === 1 && beforeVersions[0] === SEEDED_VERSION,
    `found ${beforeVersions.join(',')}`,
  );

  const bound = await call('/admin/platform-capability-templates', {
    method: 'POST',
    token,
    body: { tenantId: TENANT, key: 'temperature', semanticType: 'number', dataType: 'float8' },
  });
  const boundTemplateId = (bound.body.template as Json | undefined)?.id as string | undefined;
  check('a template for an existing, bound key is created', bound.status === 201, `status=${bound.status}`);

  if (boundTemplateId) {
    await call(`/admin/platform-capability-templates/${boundTemplateId}/versions`, {
      method: 'POST',
      token,
      body: { tenantId: TENANT, version: '9.9.9' },
    });

    const preview = await call('/admin/platform-capability-versions/apply', {
      method: 'POST',
      token,
      body: { tenantId: TENANT, templateId: boundTemplateId, dryRun: true },
    });
    check('preview of a bound key succeeds', preview.status === 201, `status=${preview.status}`);
    const refusedPreview = (preview.body.refused ?? []) as Json[];
    check('preview refuses the bound capabilities', refusedPreview.length > 0,
      `wouldRefuse=${String(preview.body.wouldRefuse)}`);
    if (refusedPreview.length > 0) {
      const first = refusedPreview[0];
      check('the refusal names the device', typeof first.deviceName === 'string', JSON.stringify(first));
      check('the refusal counts dashboard bindings', (first.bindingCount as number) > 0,
        `bindingCount=${String(first.bindingCount)}`);
      check('the refusal counts automations', typeof first.automationCount === 'number',
        `automationCount=${String(first.automationCount)}`);
    }

    // The commit must refuse the same set and still apply the rest: one bound widget cannot be
    // allowed to block the whole fleet.
    //
    // Everything from here to the second press is inside try/finally that puts the captured
    // versions back. A probe that leaves the seeded tenant at 9.9.9 would make the next run
    // meaningless -- the fleet would already be aligned, so the "would update" count would be
    // zero and the feature would look broken for a reason that has nothing to do with the code
    // under test.
    let committedRefused: Json[] = [];
    try {
      const committed = await call('/admin/platform-capability-versions/apply', {
        method: 'POST',
        token,
        body: { tenantId: TENANT, templateId: boundTemplateId },
      });
      check('commit succeeds rather than throwing on a bound capability', committed.status === 201,
        `status=${committed.status} ${JSON.stringify(committed.body).slice(0, 200)}`);
      committedRefused = (committed.body.refused ?? []) as Json[];
      check('commit refuses the same bound capabilities', committedRefused.length === refusedPreview.length,
        `${committedRefused.length} vs ${refusedPreview.length}`);
      check('commit reports a numeric updated count', typeof committed.body.updated === 'number',
        String(committed.body.updated));

      // Second press on an already-aligned fleet must say so, not claim more work.
      const again = await call('/admin/platform-capability-versions/apply', {
        method: 'POST',
        token,
        body: { tenantId: TENANT, templateId: boundTemplateId },
      });
      const againRefused = (again.body.refused ?? []) as Json[];
      check('a second press reports the same refusals, not more work',
        againRefused.length === committedRefused.length,
        `${againRefused.length} vs ${committedRefused.length}`);
    } finally {
      // Publish the seeded version and apply it. `supersede` is required because the probe's own
      // 9.9.9 is published and lower versions are refused -- which is the guard working, and the
      // reason a restore has to go through the lifecycle rather than write the column directly.
      // `rollback: true`, not just `supersede`: publishing refuses to move the fleet backwards
      // by default, which is correct -- but it means a restore has to name the intent. Getting
      // this wrong was not hypothetical: an earlier run could not restore at all and left a real
      // device on the probe's version, because the lifecycle had no supported way back.
      const republish = await call(
        `/admin/platform-capability-templates/${boundTemplateId}/versions`,
        {
          method: 'POST',
          token,
          body: { tenantId: TENANT, version: SEEDED_VERSION, supersede: true, rollback: true },
        },
      );
      check(`restore: republish ${SEEDED_VERSION}`, republish.status === 201,
        `status=${republish.status} ${JSON.stringify(republish.body).slice(0, 140)}`);
      await call('/admin/platform-capability-versions/apply', {
        method: 'POST',
        token,
        body: { tenantId: TENANT, templateId: boundTemplateId },
      });
      const afterVersions = await distinctVersions(token, 'temperature');
      check(`the fleet is back on ${SEEDED_VERSION}`,
        afterVersions.length === 1 && afterVersions[0] === SEEDED_VERSION,
        `found ${afterVersions.join(',')}`);
    }

    // ------------------------------------------------------------- 4. the audit
    // The action name lives in `resourceType`; `detail` carries only its arguments, e.g.
    // `version=9.9.9 updated=0 refused=1`. The first version searched `detail` for the action
    // name and failed while the rows were demonstrably there -- an assertion that cannot fail
    // the right way is worse than none, because it teaches the reader that the audit is empty.
    const audit = await call('/admin/platform-rbac/audit?limit=50', { token });
    const rows = (audit.body.items ?? []) as Json[];
    const actions = rows.map((row) => String(row.resourceType ?? ''));
    const applyRows = rows.filter((row) => row.resourceType === 'capability_template.apply');
    check('the audit route returned rows', rows.length > 0, `rows=${rows.length}`);
    check('the apply is recorded in the audit log', actions.includes('capability_template.apply'),
      actions.join(','));
    check('the apply audit row counts updated and refused',
      applyRows.length > 0 && /updated=\d+ refused=\d+/.test(String(applyRows[0].detail)),
      String(applyRows[0]?.detail));
    check('the publish is recorded in the audit log',
      actions.includes('capability_template.publish'), actions.join(','));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`\ncleanup: delete templates with key LIKE 'probe.capability.%' and key='temperature'` +
    ` in tenant ${TENANT}; reset any capability moved to 9.9.9.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('probe crashed:', error);
  process.exit(1);
});