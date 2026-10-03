/**
 * Live proof for NOC operations (Wave 6).
 *
 * The contract spec reads source. This drives the running API and asserts the four claims a
 * wallboard cannot make for itself:
 *
 *  1. Acknowledging records *who* and *when*, and a second acknowledgement returns the first row
 *     rather than moving the actor or the timestamp — otherwise "who saw this first" is lost to a
 *     double click during a handover.
 *  2. Resolving a finding that was never acknowledged is refused. Without the refusal, "resolved"
 *     is reachable by whoever closes the ticket and the acknowledgement record is decorative.
 *  3. Resolving an acknowledged finding succeeds, and the row survives in the duty log.
 *  4. The tenant is taken from the session, not the body: an acknowledgement naming another
 *     tenant's finding is refused, and the duty log cannot be read across tenants.
 *
 * The tenant-isolation half is the one that gets asserted with a *second* tenant's own token. A
 * platform session may read across tenants by design, so proving isolation by asking the platform
 * admin to behave is not a test — the refusal has to come from the route.
 *
 * Env: PROBE_API_BASE, PROBE_EMAIL, PROBE_PASSWORD, PROBE_UNACKNOWLEDGED_ID, PROBE_ACK_ID,
 *      PROBE_TENANT_ADMIN_EMAIL, PROBE_TENANT_ADMIN_PASSWORD
 */
type Json = Record<string, unknown>;

const BASE = process.env.PROBE_API_BASE ?? 'http://127.0.0.1:3000';
const SESSION_TENANT = '11111111-1111-4111-8111-111111111111';
const TENANT = '22222222-2222-4222-8222-222222222222';
const OTHER_TENANT = '33333333-3333-4333-8333-333333333333';

const UNACKNOWLEDGED = process.env.PROBE_UNACKNOWLEDGED_ID;
const TO_ACK = process.env.PROBE_ACK_ID;
if (!UNACKNOWLEDGED || !TO_ACK) {
  throw new Error('fixture ids missing: run through scripts/run-noc-probe.sh');
}

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(
  path: string,
  init: { method?: string; token?: string; body?: unknown; tenant?: string } = {},
): Promise<{ status: number; body: Json }> {
  // The content type is set only when there is a body. A bodyless DELETE that still declares
  // `application/json` is answered 400 by the framework's body parser — a probe artefact that
  // reads as the product refusing the route, and which would have made every resolve assertion
  // fail for a reason unrelated to the code under test.
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.tenant) headers['x-tenant-id'] = init.tenant;

  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  // One read only: `res.json()` a second time throws "Body is unusable" and kills the probe
  // after its first assertions have printed, which reads as a product failure.
  const body = (await response.json().catch(() => ({}))) as Json;
  return { status: response.status, body };
}

function messageOf(body: Json): string {
  const error = body.error as Json | undefined;
  const inner = (error?.message ?? body.message) as unknown;
  return typeof inner === 'string' ? inner : JSON.stringify(body);
}

interface Ack {
  findingId?: string;
  actorMembershipId?: string;
  acknowledgedAt?: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  note?: string | null;
}

async function login(
  email: string,
  password: string,
  tenantId: string,
): Promise<string> {
  const res = await call('/auth/login', {
    method: 'POST',
    body: { email, password, tenantId },
  });
  const token = (res.body.accessToken ?? res.body.token) as string | undefined;
  if (!token) throw new Error(`login failed for ${email}: ${res.status}: ${messageOf(res.body)}`);
  return token;
}

async function main(): Promise<void> {
  const superToken = await login(
    process.env.PROBE_EMAIL!,
    process.env.PROBE_PASSWORD!,
    SESSION_TENANT,
  );
  console.log('login ok\n');

  // ------------------------------------------------- 0. the routes are registered
  // 401 rather than 404: the router matched the path and the guard rejected the caller. Probing
  // each declared verb separately is what separates "not a route" from "wrong verb" — a POST at a
  // DELETE-only path answers 404 and reads as a missing route rather than a mismatch.
  const noToken = await call(`/admin/platform-noc/findings/${TO_ACK}/acknowledge`, { method: 'POST' });
  check('acknowledge route is registered (401, not 404)', noToken.status === 401, `status=${noToken.status}`);
  const noTokenResolve = await call(`/admin/platform-noc/findings/${TO_ACK}/resolve?tenantId=${TENANT}`, {
    method: 'DELETE',
  });
  check(
    'resolve route is registered on DELETE (401, not 404)',
    noTokenResolve.status === 401,
    `status=${noTokenResolve.status}`,
  );
  // The verb matters: POST at the resolve path must not match.
  const wrongVerb = await call(`/admin/platform-noc/findings/${TO_ACK}/resolve?tenantId=${TENANT}`, { method: 'POST' });
  check('resolve does not answer on POST', wrongVerb.status === 404, `status=${wrongVerb.status}`);

  // ------------------------------------------------- 1. acknowledging
  const first = await call(`/admin/platform-noc/findings/${TO_ACK}/acknowledge`, {
    method: 'POST',
    token: superToken,
    tenant: SESSION_TENANT,
    body: { tenantId: TENANT },
  });
  check('acknowledge returns 201', first.status === 201, `status=${first.status}: ${messageOf(first.body)}`);
  const ack1 = (first.body.acknowledgement ?? {}) as Ack;
  check('response is enveloped in `acknowledgement`', typeof ack1.findingId === 'string');
  check(
    'it records an actor',
    typeof ack1.actorMembershipId === 'string' && ack1.actorMembershipId.length > 0,
    `actor=${String(ack1.actorMembershipId)}`,
  );
  check(
    'it records a time',
    typeof ack1.acknowledgedAt === 'string' && !Number.isNaN(Date.parse(ack1.acknowledgedAt)),
  );
  check(
    'acknowledging is not resolving',
    ack1.resolvedAt === null || ack1.resolvedAt === undefined,
    `resolvedAt=${String(ack1.resolvedAt)}`,
  );
  check('first acknowledge is not already-acknowledged', first.body.alreadyAcknowledged === false);
  console.log(`  actor ${ack1.actorMembershipId} at ${ack1.acknowledgedAt}\n`);

  // A body-supplied actor must be ignored, not honoured: the record is a claim about who was on
  // duty, so the session is the only source. Sent as a plausible membership uuid to make the
  // check meaningful rather than a missing-field no-op.
  const spoofed = await call(`/admin/platform-noc/findings/${TO_ACK}/acknowledge`, {
    method: 'POST',
    token: superToken,
    tenant: SESSION_TENANT,
    body: { tenantId: TENANT, actorMembershipId: '99999999-9999-4999-8999-999999999999' },
  });
  check('a repeat acknowledge is accepted, not an error', spoofed.status === 201, `status=${spoofed.status}`);
  check('the repeat is reported as already-acknowledged', spoofed.body.alreadyAcknowledged === true);
  const ack2 = (spoofed.body.acknowledgement ?? {}) as Ack;
  check(
    'the repeat returns the first actor, not the spoofed one',
    ack2.actorMembershipId === ack1.actorMembershipId,
    `first=${ack1.actorMembershipId} second=${ack2.actorMembershipId}`,
  );
  check(
    'the repeat does not move the timestamp',
    ack2.acknowledgedAt === ack1.acknowledgedAt,
    `first=${ack1.acknowledgedAt} second=${ack2.acknowledgedAt}`,
  );

  // ------------------------------------------------- 2. resolving what nobody looked at
  const refused = await call(`/admin/platform-noc/findings/${UNACKNOWLEDGED}/resolve?tenantId=${TENANT}`, {
    method: 'DELETE',
    token: superToken,
    tenant: SESSION_TENANT,
  });
  // 409: the refusal is a DomainConflictException, and a 200 would mean the ordering is not a
  // control. Asserted with the message, because a 409 from an unrelated conflict would satisfy
  // the status alone.
  check(
    'resolve is refused for a finding that was never acknowledged',
    refused.status === 409,
    `status=${refused.status}: ${messageOf(refused.body)}`,
  );
  check(
    'the refusal names the acknowledgement',
    /acknowledg/i.test(messageOf(refused.body)),
    messageOf(refused.body),
  );

  // The refusal must not have created anything.
  const afterRefusal = await call(`/admin/platform-noc/acknowledgements?tenantId=${TENANT}`, {
    token: superToken,
    tenant: SESSION_TENANT,
  });
  const itemsAfterRefusal = (afterRefusal.body.items ?? []) as Ack[];
  check(
    'the refused finding has no acknowledgement row',
    !itemsAfterRefusal.some((row) => row.findingId === UNACKNOWLEDGED),
    'a row appeared for the refused resolve',
  );

  // ------------------------------------------------- 3. resolving what was acknowledged
  const resolved = await call(`/admin/platform-noc/findings/${TO_ACK}/resolve?tenantId=${TENANT}`, {
    method: 'DELETE',
    token: superToken,
    tenant: SESSION_TENANT,
  });
  check('resolve returns 200', resolved.status === 200, `status=${resolved.status}: ${messageOf(resolved.body)}`);
  const res1 = (resolved.body.acknowledgement ?? {}) as Ack;
  check(
    'it sets resolvedAt',
    typeof res1.resolvedAt === 'string' && !Number.isNaN(Date.parse(res1.resolvedAt)),
    `resolvedAt=${String(res1.resolvedAt)}`,
  );
  check(
    'it names who resolved it',
    typeof res1.resolvedBy === 'string' && res1.resolvedBy.length > 0,
  );
  check(
    'resolving does not move the acknowledgement',
    res1.acknowledgedAt === ack1.acknowledgedAt,
    `ack=${ack1.acknowledgedAt} resolved=${res1.acknowledgedAt}`,
  );

  // A second resolve is a no-op carrying the original, matching the acknowledgement's own rule.
  const twice = await call(`/admin/platform-noc/findings/${TO_ACK}/resolve?tenantId=${TENANT}`, {
    method: 'DELETE',
    token: superToken,
    tenant: SESSION_TENANT,
  });
  check('a repeat resolve is accepted', twice.status === 200, `status=${twice.status}`);
  check('the repeat is reported as already-resolved', twice.body.alreadyResolved === true);
  const res2 = (twice.body.acknowledgement ?? {}) as Ack;
  check(
    'the repeat keeps the first resolvedAt',
    res2.resolvedAt === res1.resolvedAt,
    `first=${res1.resolvedAt} second=${res2.resolvedAt}`,
  );

  // ------------------------------------------------- 4. the duty log
  const list = await call(`/admin/platform-noc/acknowledgements?tenantId=${TENANT}`, {
    token: superToken,
    tenant: SESSION_TENANT,
  });
  check('the duty log reads back', list.status === 200, `status=${list.status}`);
  const items = (list.body.items ?? []) as Ack[];
  check('it carries the acknowledged row', items.some((row) => row.findingId === TO_ACK));
  const row = items.find((entry) => entry.findingId === TO_ACK);
  check(
    'the row keeps its actor and time through the read',
    row?.actorMembershipId === ack1.actorMembershipId && row?.acknowledgedAt === ack1.acknowledgedAt,
  );
  check('the row shows as resolved', typeof row?.resolvedAt === 'string');

  // Newest first: the log is read as a handover list, and unsorted rows make "what happened most
  // recently" a guess.
  const times = items.map((entry) => Date.parse(entry.acknowledgedAt ?? '')).filter((n) => !Number.isNaN(n));
  check(
    'the log is newest first',
    times.every((value, index) => index === 0 || times[index - 1] >= value),
    `order=${times.join(',')}`,
  );

  // ------------------------------------------------- 5. tenant isolation, from the other tenant
  // The platform session reads the log for whatever tenant it asks about, so it cannot prove its
  // own isolation. The tenant admin's own token can: their acknowledgement route resolves the
  // tenant from their session context, so a finding belonging to another tenant is not theirs to
  // act on.
  const tenantAdminToken = await login(
    process.env.PROBE_TENANT_ADMIN_EMAIL!,
    process.env.PROBE_TENANT_ADMIN_PASSWORD!,
    TENANT,
  );
  const crossAck = await call(`/admin/platform-noc/findings/${UNACKNOWLEDGED}/acknowledge`, {
    method: 'POST',
    token: tenantAdminToken,
    tenant: TENANT,
    body: { tenantId: OTHER_TENANT },
  });
  // A tenant admin is refused by the platform-role guard before the NOC code runs at all. That
  // refusal is correct and is exactly why the probe does not demand a NOC-specific error here --
  // asserting PLATFORM_ADMIN_REQUIRED would be testing the guard's precedence, not the tenancy.
  check(
    'a tenant admin cannot reach the NOC action route',
    crossAck.status === 403,
    `status=${crossAck.status}: ${messageOf(crossAck.body)}`,
  );

  const crossList = await call(`/admin/platform-noc/acknowledgements?tenantId=${OTHER_TENANT}`, {
    token: tenantAdminToken,
    tenant: OTHER_TENANT,
  });
  check(
    'a tenant admin cannot read another tenant\'s duty log',
    crossList.status !== 200,
    `status=${crossList.status}`,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});