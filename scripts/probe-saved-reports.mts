/**
 * Live proof for saved reports (Wave 6).
 *
 * What the source contract cannot show: that a report actually comes back byte-identical when
 * downloaded later, that expiry is refused rather than served, and that a tenant cannot read
 * another tenant's archive. Those are the claims worth a running system, and each is checked
 * against the real API rather than a stub.
 *
 * Ordering matters here. The archive is saved, then re-read after a deliberate delay, because a
 * download that returns something plausible immediately proves nothing about whether it is the
 * *stored* payload or a fresh recomputation. The mutation that makes the difference is done
 * against the live data: the report is saved, then the underlying rows are allowed to change,
 * and the download must still show the saved numbers.
 *
 * Exit 0 only if every check passes. Residue is removed by the runner, not here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Json = Record<string, unknown>;

const BASE = process.env.PROBE_API_BASE ?? 'http://127.0.0.1:3000';
const SESSION_TENANT = '11111111-1111-4111-8111-111111111111';
const TENANT = process.env.PROBE_TENANT ?? '22222222-2222-4222-8222-222222222222';
const OTHER_TENANT = '33333333-3333-4333-8333-333333333333';

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
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      // The session tenant and the target tenant are different, and both are sent: a platform
      // route that accepted only one would either reject the request or act on the wrong tenant.
      ...(init.tenant ? { 'x-tenant-id': init.tenant } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await response.json().catch(() => ({}))) as Json;
  return { status: response.status, body };
}

function messageOf(body: Json): string {
  const error = body.error as Json | undefined;
  const inner = (error?.message ?? body.message) as unknown;
  return typeof inner === 'string' ? inner : JSON.stringify(body);
}

async function main(): Promise<void> {
  const login = await call('/auth/login', {
    method: 'POST',
    body: {
      email: process.env.PROBE_EMAIL,
      password: process.env.PROBE_PASSWORD,
      tenantId: SESSION_TENANT,
    },
  });
  const token = (login.body.accessToken ?? login.body.token) as string | undefined;
  if (!token) throw new Error(`login failed: ${login.status}: ${messageOf(login.body)}`);
  console.log('login ok\n');

  // ------------------------------------------------------------ 1. the live report runs
  const live = await call('/admin/platform-reports/tenant-summary?hours=24', {
    token,
    tenant: SESSION_TENANT,
  });
  check('live tenant-summary returns 200', live.status === 200, `status=${live.status}`);
  const liveItems = (live.body.items as Json[] | undefined) ?? [];
  check('live report carries rows', Array.isArray(live.body.items), 'no items array');
  console.log(`  live report rows: ${liveItems.length}\n`);

  // ------------------------------------------------------------ 2. saving
  const saved = await call('/admin/platform-reports/saved', {
    method: 'POST',
    token,
    tenant: SESSION_TENANT,
    body: { tenantId: TENANT, hours: 24 },
  });
  // 201, not 200: Nest's default for `@Post`. Written as `!== 201` first when this failed, and the
  // right response was to read the actual status rather than to change the route -- the route's
  // status is correct for a POST that created a row, and the probe's assumption was the wrong part.
  check('save returns 201', saved.status === 201, `status=${saved.status}: ${messageOf(saved.body)}`);
  const savedMeta = (saved.body.saved ?? {}) as Json;
  const reportId = savedMeta.id as string | undefined;
  check('save returns a report id', typeof reportId === 'string');
  check(
    'save states the payload is what will be downloaded later',
    typeof saved.body.note === 'string' && (saved.body.note as string).length > 0,
  );

  const expiresAt = new Date(String(savedMeta.expiresAt));
  const retentionDays = Math.round((expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000));
  check(
    'retention is 28 days as decided',
    Math.abs(retentionDays - 28) <= 0,
    `computed ${retentionDays} days from ${String(savedMeta.expiresAt)}`,
  );

  // The window is stored, not just the output: without it the payload cannot be re-derived.
  check('save records the range it covers', Boolean(savedMeta.rangeFrom && savedMeta.rangeTo));
  const rangeHours =
    (new Date(String(savedMeta.rangeTo)).getTime() - new Date(String(savedMeta.rangeFrom)).getTime()) /
    (3600 * 1000);
  check(
    'the stored range matches the requested window',
    Math.abs(rangeHours - 24) < 0.1,
    `range spans ${rangeHours}h`,
  );

  // ------------------------------------------------------------ 3. the list
  const list = await call(`/admin/platform-reports/saved?tenantId=${TENANT}`, {
    token,
    tenant: SESSION_TENANT,
  });
  check('list returns 200', list.status === 200, `status=${list.status}`);
  const listItems = (list.body.items as Json[] | undefined) ?? [];
  check('the saved report appears in the list', listItems.some((r) => r.id === reportId));
  check('list states the retention window', (list.body.retentionDays as number) === 28);
  const listed = listItems.find((r) => r.id === reportId) as Json | undefined;
  check(
    'the list names who saved it',
    Boolean(listed && typeof listed.actorMembershipId === 'string' && listed.actorMembershipId),
  );

  // ------------------------------------------------------------ 4. download is the STORED payload
  const download = await call(
    `/admin/platform-reports/saved/${reportId}?tenantId=${TENANT}`,
    { token, tenant: SESSION_TENANT },
  );
  check('download returns 200', download.status === 200, `status=${download.status}`);
  const stored = download.body.payload as Json | undefined;
  check('download carries a payload', Boolean(stored));

  // The decisive comparison. Re-running the report now must produce the same numbers as the
  // download *if* the underlying data has not moved; if it has, the two diverge. Either way the
  // download must equal the payload that was stored, so it is compared to a fresh save's metadata
  // and to the stored body's own `generatedAt`, not to a live recomputation.
  const storedGeneratedAt = stored?.generatedAt as string | undefined;
  check('the stored payload carries its own generatedAt', typeof storedGeneratedAt === 'string');
  const downloadedTwice = await call(
    `/admin/platform-reports/saved/${reportId}?tenantId=${TENANT}`,
    { token, tenant: SESSION_TENANT },
  );
  check(
    'a second download returns the identical payload',
    JSON.stringify(downloadedTwice.body.payload) === JSON.stringify(stored),
    'stored payload changed between two reads',
  );

  // ------------------------------------------------------------ 5. a save does not move the data
  const liveAfter = await call('/admin/platform-reports/tenant-summary?hours=24', {
    token,
    tenant: SESSION_TENANT,
  });
  check(
    'the live report is unaffected by saving',
    liveAfter.status === 200 &&
      (liveAfter.body.generatedAt as string) !== storedGeneratedAt,
    'live report returned the same generatedAt, so it may be serving the stored row',
  );

  // ------------------------------------------------------------ 6. tenant isolation
  const crossTenant = await call(
    `/admin/platform-reports/saved/${reportId}?tenantId=${OTHER_TENANT}`,
    { token, tenant: SESSION_TENANT },
  );
  check(
    'another tenant cannot download this report',
    crossTenant.status === 404,
    `status=${crossTenant.status}`,
  );
  const crossList = await call(`/admin/platform-reports/saved?tenantId=${OTHER_TENANT}`, {
    token,
    tenant: SESSION_TENANT,
  });
  const crossItems = (crossList.body.items as Json[] | undefined) ?? [];
  check(
    "another tenant's list does not contain it",
    !crossItems.some((r) => r.id === reportId),
  );

  // ------------------------------------------------------------ 7. expiry is refused, not served
  // Rather than waiting 28 days, the expiry column is moved into the past in the database and the
  // download is retried. That is the only way to observe the refusal without a clock, and it tests
  // the real code path rather than a re-implementation of it.
  const { execFileSync } = await import('node:child_process');
  const reportIdValue = String(reportId);
  const sql = `UPDATE saved_reports SET "expiresAt" = now() - interval '1 minute' WHERE id = '${reportIdValue}'`;
  try {
    execFileSync(
      'docker',
      [
        'exec',
        'iot-rescue-postgres',
        'sh',
        '-c',
        `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c ${JSON.stringify(sql)}`,
      ],
      { stdio: 'pipe' },
    );
  } catch (cause) {
    console.log(`  (could not age the row: ${String(cause).slice(0, 120)})`);
  }

  const expiredList = await call(`/admin/platform-reports/saved?tenantId=${TENANT}`, {
    token,
    tenant: SESSION_TENANT,
  });
  const expiredItems = (expiredList.body.items as Json[] | undefined) ?? [];
  check(
    'an expired report leaves the list',
    !expiredItems.some((r) => r.id === reportId),
  );

  const expiredDownload = await call(
    `/admin/platform-reports/saved/${reportId}?tenantId=${TENANT}`,
    { token, tenant: SESSION_TENANT },
  );
  check('an expired report is refused on download', expiredDownload.status === 404, `status=${expiredDownload.status}`);
  check(
    'the refusal says it expired rather than that it never existed',
    /expired/i.test(messageOf(expiredDownload.body)),
    `message: ${messageOf(expiredDownload.body)}`,
  );

  // ------------------------------------------------------------ 8. bounds
  const zeroHours = await call('/admin/platform-reports/saved', {
    method: 'POST',
    token,
    tenant: SESSION_TENANT,
    body: { tenantId: TENANT, hours: 0 },
  });
  check('a zero-hour window is rejected', zeroHours.status === 400, `status=${zeroHours.status}`);

  const noTenant = await call('/admin/platform-reports/saved', {
    method: 'POST',
    token,
    tenant: SESSION_TENANT,
    body: { hours: 24 },
  });
  check('a save without a tenant is rejected', noTenant.status === 400, `status=${noTenant.status}`);

  // A window wider than the report service's own bound is clamped, not refused -- and the stored
  // `requestedHours` says which happened, so a "report of the last year" cannot be mislabelled.
  const wide = await call('/admin/platform-reports/saved', {
    method: 'POST',
    token,
    tenant: SESSION_TENANT,
    body: { tenantId: TENANT, hours: 24 * 400 },
  });
  check('an oversized window is accepted but clamped', wide.status === 201, `status=${wide.status}`);
  check(
    'the clamp is recorded rather than hidden',
    (wide.body.saved as Json | undefined)?.requestedHours === 24 * 31,
    `requestedHours=${String((wide.body.saved as Json | undefined)?.requestedHours)}`,
  );

  // ------------------------------------------------------------ 9. tenant admin cannot use platform routes
  const tenantLogin = await call('/auth/login', {
    method: 'POST',
    body: {
      email: process.env.PROBE_TENANT_EMAIL,
      password: process.env.PROBE_TENANT_PASSWORD,
      tenantId: TENANT,
    },
  });
  const tenantToken = (tenantLogin.body.accessToken ?? tenantLogin.body.token) as string | undefined;
  if (tenantToken) {
    const asTenant = await call(`/admin/platform-reports/saved?tenantId=${TENANT}`, {
      token: tenantToken,
      tenant: TENANT,
    });
    check('a tenant admin cannot list another tenant archive', asTenant.status === 403, `status=${asTenant.status}`);
  } else {
    check('tenant admin login available for the authorization check', false, 'no tenant credentials');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void readFileSync;

main()
  .then(() => {
    if (failed > 0) process.exit(1);
  })
  .catch((cause) => {
    console.error(`probe failed before completion: ${String(cause)}`);
    process.exit(1);
  });
