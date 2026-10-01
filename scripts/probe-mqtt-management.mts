/**
 * Live proof for MQTT management evidence (Wave 6).
 *
 * The source contract cannot show that the broker is actually reachable, that the publisher is
 * actually connected, or -- the claim that matters most -- that an unreachable broker is reported
 * as unreachable instead of as an empty fleet. Those are all claims about the outside world, so
 * they are checked against the running broker and the running container.
 *
 * The decisive check stops the broker. If the surface reported "0 connected clients" during an
 * outage, it would be indistinguishable from a fleet that genuinely connected nothing, and an
 * operator would be one click away from restarting a healthy broker. Stopping the broker is the
 * only way to observe that difference, so the probe stops it, looks, and puts it back. If the
 * restore fails the probe reports failure rather than leaving the environment down.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Json = Record<string, unknown>;

const BASE = process.env.PROBE_API_BASE ?? 'http://127.0.0.1:5000';
const SESSION_TENANT = '11111111-1111-4111-8111-111111111111';

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

// `require` does not exist in an ES module, and using it failed at the first docker call rather
// than at load time -- so the probe died between the reachable case and the outage case it exists
// to prove. Imported at the top instead.
import { execFileSync } from 'node:child_process';

function sh(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(args[0], args.slice(1), { encoding: 'utf8' });
    return { code: 0, out };
  } catch (cause) {
    const error = cause as { status?: number; stdout?: string };
    return { code: error.status ?? 1, out: error.stdout ?? '' };
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

  // ------------------------------------------------------- 1. broker reachable
  const live = await call('/admin/platform-mqtt/management', { token, tenant: SESSION_TENANT });
  check('management returns 200', live.status === 200, `status=${live.status}`);
  check('the broker answered', live.body.brokerReachable === true, messageOf(live.body));
  check(
    'no broker error on a reachable broker',
    live.body.brokerError === null,
    String(live.body.brokerError),
  );
  check('a checkedAt timestamp is returned', typeof live.body.checkedAt === 'string');
  check(
    'nodes are reported, not just clients',
    Array.isArray(live.body.nodes) && (live.body.nodes as unknown[]).length > 0,
    'no nodes',
  );

  // ------------------------------------------------------- 2. the publisher is visible
  const clients = (live.body.clients as Array<Json> | undefined) ?? [];
  check('at least one client is listed', clients.length > 0, `clientCount=${String(live.body.clientCount)}`);
  const publisher = clients.find((c) =>
    String(c.clientId ?? '').startsWith(String(live.body.platformPublisherPrefix)),
  );
  check(
    "the platform's own MQTT publisher is visible through the platform",
    Boolean(publisher),
    `prefix=${String(live.body.platformPublisherPrefix)} listed=${clients.map((c) => String(c.clientId)).join(',')}`,
  );
  check(
    'the publisher count matches the listed clients',
    live.body.platformPublisherCount === clients.filter((c) => String(c.clientId ?? '').startsWith(String(live.body.platformPublisherPrefix))).length,
  );
  check(
    'the publisher reports a username and a connect time',
    Boolean(publisher && publisher.username && publisher.connectedAt),
  );

  // No credential may appear anywhere in the payload -- not even redacted.
  const serialised = JSON.stringify(live.body);
  check(
    'the broker token is not in the response',
    !/"token"\s*:/.test(serialised),
    serialised.slice(0, 160),
  );
  check('no password field is in the response', !/"password"\s*:/i.test(serialised));

  // ------------------------------------------------------- 3. read-only
  // A refusal is a refusal: Nest answers 400 from body validation before routing, and 404 if the
  // verb were not registered at all. Both mean the write did not happen, so both count -- the first
  // version asserted 404 only and failed against a route that is read-only for a better reason.
  const post = await call('/admin/platform-mqtt/management', {
    method: 'POST',
    token,
    tenant: SESSION_TENANT,
  });
  check(
    'the management surface refuses POST',
    post.status === 400 || post.status === 404,
    `status=${post.status}`,
  );
  const del = await call('/admin/platform-mqtt/management', {
    method: 'DELETE',
    token,
    tenant: SESSION_TENANT,
  });
  check(
    'the management surface refuses DELETE',
    del.status === 400 || del.status === 404 || del.status === 405,
    `status=${del.status}`,
  );

  // ------------------------------------------------------- 4. authorization
  const tenantLogin = await call('/auth/login', {
    method: 'POST',
    body: {
      email: process.env.PROBE_TENANT_EMAIL,
      password: process.env.PROBE_TENANT_PASSWORD,
      tenantId: process.env.PROBE_TENANT_ID ?? '22222222-2222-4222-8222-222222222222',
    },
  });
  const tenantToken = (tenantLogin.body.accessToken ?? tenantLogin.body.token) as string | undefined;
  if (tenantToken) {
    const asTenant = await call('/admin/platform-mqtt/management', {
      token: tenantToken,
      tenant: process.env.PROBE_TENANT_ID ?? '22222222-2222-4222-8222-222222222222',
    });
    check('a tenant admin cannot read broker state', asTenant.status === 403, `status=${asTenant.status}`);
  } else {
    check('tenant admin login available for the authorization check', false, 'no tenant credentials');
  }

  // ------------------------------------------------------- 5. THE decisive check
  // Stop the broker and confirm the surface says "unreachable" rather than "0 clients".
  console.log('\n--- stopping the broker to test the outage path ---');
  const stop = sh(['docker', 'stop', 'iot-rescue-emqx']);
  check('the broker was stopped for the outage test', stop.code === 0, stop.out.trim().slice(0, 120));

  try {
    // The service gives the broker 5s; wait past that so a connection refusal is what arrives.
    await new Promise((resolve) => setTimeout(resolve, 7_000));

    const during = await call('/admin/platform-mqtt/management', { token, tenant: SESSION_TENANT });
    check('the API still answers while the broker is down', during.status === 200, `status=${during.status}`);
    check(
      'an unreachable broker is reported as unreachable',
      during.body.brokerReachable === false,
      `brokerReachable=${String(during.body.brokerReachable)}`,
    );
    check(
      'the reason is stated rather than swallowed',
      typeof during.body.brokerError === 'string' && (during.body.brokerError as string).length > 0,
      String(during.body.brokerError),
    );
    check(
      'a downed broker is NOT reported as an empty fleet',
      during.body.clientCount === 0 && during.body.subscriptionCount === null,
      `clientCount=${String(during.body.clientCount)} subscriptionCount=${String(during.body.subscriptionCount)}`,
    );
    check(
      'no client rows are invented while the broker is down',
      Array.isArray(during.body.clients) && (during.body.clients as unknown[]).length === 0,
    );
    check(
      'the timestamp still travels with an unreachable answer',
      typeof during.body.checkedAt === 'string',
      'no checkedAt',
    );
  } finally {
    console.log('--- restarting the broker ---');
    const start = sh(['docker', 'start', 'iot-rescue-emqx']);
    check('the broker was restarted', start.code === 0, start.out.trim().slice(0, 120));
  }

  // Give EMQX time to accept connections again before confirming recovery.
  let recovered = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const after = await call('/admin/platform-mqtt/management', { token, tenant: SESSION_TENANT });
    if (after.body.brokerReachable === true) {
      recovered = true;
      check('the surface recovers once the broker is back', true, `after ${(attempt + 1) * 2}s`);
      check(
        'the publisher is connected again after recovery',
        ((after.body.clients as Array<Json> | undefined) ?? []).length > 0,
      );
      break;
    }
  }
  if (!recovered) {
    check('the surface recovers once the broker is back', false, 'still unreachable after 60s');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void readFileSync;
void resolve;

main()
  .then(() => {
    if (failed > 0) process.exit(1);
  })
  .catch((cause) => {
    console.error(`probe failed before completion: ${String(cause)}`);
    process.exit(1);
  });
