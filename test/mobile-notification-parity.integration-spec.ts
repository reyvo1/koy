import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
import { readFileSync } from 'node:fs';
import {
  loadMobileNotificationHistory,
  loadMobileNotificationSummary,
} from '../apps/user-mobile/src/device-control/mobile-notification-client';

/**
 * Wave 7 live proof: the mobile client against the running API.
 *
 * The unit spec drives the client with a fake gateway, so it proves the client's parsing and its
 * refusal logic — and nothing about the wire. This is the half that closes that gap: it calls the
 * same exported functions against `http://127.0.0.1:5000` with a real session, which is the only
 * thing that proves the paths it asks for exist and that its picture of the response matches the
 * server's.
 *
 * The gateway below is deliberately the thinnest thing satisfying `MobileDeviceGateway`, and it is
 * not a reimplementation of `MobileSessionClient` — that class is bundled for Expo and reads its
 * token from a secure store, so plain node cannot construct it. It forwards a bearer token and the
 * tenant header the same way that class does, and the comment says so rather than letting the probe
 * quietly become evidence about itself.
 *
 * Two things are asserted here that only the wire can decide, and both were false before this wave:
 * an unknown `status` used to come back **200 with every row**, so a client-side guard was not
 * enough — the server had to refuse it too, and this checks that it does.
 *
 * Requires the writer probe to have run, since it reads rows rather than creating them:
 *   `npm run mobile:notification:probe` runs the writer first.
 */
jest.setTimeout(60000);

const BASE = process.env.PROBE_API_BASE ?? 'http://127.0.0.1:5000';
const TENANT = '44444444-4444-4444-8444-444444444444';
const OTHER_TENANT = '33333333-3333-4333-8333-333333333333';

interface ProbeError extends Error {
  status?: number;
  body?: string;
}

/**
 * `MobileApiError`'s shape, narrowed locally rather than imported.
 *
 * The class lives in `mobile-session-client.ts`, which imports `expo-secure-store` through its
 * store module — so requiring it here would drag the Expo runtime into a plain-node spec. The
 * contract is what matters and it is asserted rather than typed by assumption: `code` is declared
 * optional and the test below requires it to be present.
 */
interface MobileApiErrorShape extends ProbeError {
  code?: string;
}

// Written by scripts/run-mobile-notification-probe.sh via probe_login, under the git-ignored reports/
// tree. It used to name a scratch directory that exists on one machine, so this integration spec could
// only ever run there. PROBE_LOGIN_FILE overrides it, which is how the wrapper points at its own path.
const login = (): { accessToken: string } =>
  JSON.parse(
    readFileSync(
      process.env.PROBE_LOGIN_FILE ?? resolve(root, 'reports/probe-session.json'),
      'utf8',
    ),
  );

/**
 * The minimum a session can do: attach the token and the tenant, then report the status.
 *
 * Thrown errors carry `status` and the raw body, because "the server refused it" and "the server
 * said 200 anyway" are the two answers this probe exists to tell apart, and a thrown `Error` with
 * only a message would collapse them.
 */
function gatewayFor(tenantId: string) {
  return {
    async requestJson<T>(pathname: string, init: RequestInit = {}): Promise<T> {
      const headers = new Headers(init.headers);
      headers.set('accept', 'application/json');
      headers.set('authorization', `Bearer ${login().accessToken}`);
      headers.set('x-tenant-id', tenantId);
      const response = await fetch(`${BASE}${pathname}`, { ...init, headers });
      if (!response.ok) {
        const body = await response.text();
        const error: ProbeError = new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
        error.status = response.status;
        error.body = body;
        throw error;
      }
      return (await response.json()) as T;
    },
  };
}

describe('the mobile delivery client against the running API', () => {
  it('reads the delivery log the shell asks for', async () => {
    const history = await loadMobileNotificationHistory(gatewayFor(TENANT));

    expect(history.source).toBe('NOTIFICATION_DELIVERY_LOG');
    expect(history.destinationListed).toBe(false);
    expect(history.appliedStatus).toBeNull();
    // The writer probe has run by the time this spec does, so rows exist. Asserting `> 0` is what
    // makes this a test of the wire rather than of a parser against an empty array.
    expect(history.total).toBeGreaterThan(0);
    expect(history.droppedRows).toBe(0);
  });

  it('sees the rows the product writers produced', async () => {
    const history = await loadMobileNotificationHistory(gatewayFor(TENANT));
    const templates = history.items.map((row) => row.templateKey);

    // Two registered verbs enqueue: `register` (verification) and `forgot-password` (reset). Both
    // must be visible, which is the difference between a delivery log and a hardcoded fixture.
    expect(templates).toContain('auth.verify-email.v1');
    expect(templates).toContain('auth.reset-password.v1');
  });

  it('never marks an unsent row as sent', async () => {
    const history = await loadMobileNotificationHistory(gatewayFor(TENANT));
    const unsent = history.items.filter((row) => row.status !== 'SENT');

    // The delivery worker has not run against an `example.invalid` destination, so every row here
    // is genuinely unsent — which is exactly the state a status label would get wrong.
    expect(unsent.length).toBeGreaterThan(0);
    for (const row of unsent) {
      expect(row.sentAt).toBeNull();
      expect(row.wasSent).toBe(false);
    }
  });

  it('derives sent from the timestamp for every row, not from the label', async () => {
    const history = await loadMobileNotificationHistory(gatewayFor(TENANT));

    for (const row of history.items) {
      expect(row.wasSent).toBe(row.sentAt !== null);
    }
  });

  it('reads the summary with every status present, and its total agrees with the log', async () => {
    const [summary, history] = await Promise.all([
      loadMobileNotificationSummary(gatewayFor(TENANT)),
      loadMobileNotificationHistory(gatewayFor(TENANT)),
    ]);

    for (const status of ['PENDING', 'DELIVERING', 'SENT', 'FAILED', 'EXHAUSTED']) {
      expect(summary.byStatus).toHaveProperty(status);
    }
    expect(summary.total).toBe(history.total);
  });

  it('applies a valid filter, and every returned row carries it', async () => {
    const filtered = await loadMobileNotificationHistory(gatewayFor(TENANT), 'PENDING');

    expect(filtered.appliedStatus).toBe('PENDING');
    for (const row of filtered.items) {
      expect(row.status).toBe('PENDING');
    }
    expect(filtered.total).toBeLessThanOrEqual(
      (await loadMobileNotificationHistory(gatewayFor(TENANT))).total,
    );
  });

  it('refuses a typo locally, before any request is made', async () => {
    const gateway = gatewayFor(TENANT);
    const spy = jest.spyOn(gateway, 'requestJson');

    await expect(
      loadMobileNotificationHistory(gateway, 'FAILY'),
    ).rejects.toMatchObject({ status: 400 });

    // The load-bearing half: a local refusal that still sent the request would have learned nothing.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('refuses an inherited Object key too, which `in` would have accepted', async () => {
    for (const key of ['toString', 'constructor']) {
      await expect(
        loadMobileNotificationHistory(gatewayFor(TENANT), key),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('and the server refuses the same typo, because the client guard is not the only defence', async () => {
    // Before this wave the backend dropped an unrecognised filter and answered 200 with every row.
    // A client-side guard alone would have hidden that: any other caller would still get the
    // unfiltered list and see a filter that appears to work.
    let status = 0;
    let body = '';
    try {
      await gatewayFor(TENANT).requestJson('/notifications?status=FAILY');
    } catch (cause) {
      status = (cause as ProbeError).status ?? 0;
      body = (cause as ProbeError).body ?? '';
    }

    expect(status).toBe(400);
    for (const value of ['PENDING', 'DELIVERING', 'SENT', 'FAILED', 'EXHAUSTED']) {
      expect(body).toContain(value);
    }
  });

  it('treats an empty status as no filter at all, not as a search for nothing', async () => {
    // A UI with no filter chosen sends an empty value. Reading that literally returns an empty list,
    // which is the "no notifications exist" rendering this whole area was written to avoid.
    const empty = await loadMobileNotificationHistory(gatewayFor(TENANT), '');
    const absent = await loadMobileNotificationHistory(gatewayFor(TENANT));

    expect(empty.appliedStatus).toBeNull();
    expect(empty.total).toBe(absent.total);
  });

  it('refuses another tenant at the wire, before the client is involved', async () => {
    // Split from the pass-through assertion below on purpose.
    //
    // `MobileSessionClient` is the thing that raises `MobileApiError`, and it cannot be constructed
    // under plain node — it reads its token from an Expo secure store. So this gateway raises a
    // plain error, and the client correctly wraps a foreign error as 502. Asserting 403 here would
    // be asserting something this harness cannot produce; asserting 502 would say nothing about
    // isolation.
    //
    // So the wire is checked directly: the row exists in TENANT, and a request naming a tenant the
    // session has no membership in is refused. The half that proves the *client* passes a
    // `MobileApiError` through untouched is in the unit spec, which can construct one.
    let status = 0;
    let body = '';
    try {
      await gatewayFor(OTHER_TENANT).requestJson('/notifications?limit=50');
    } catch (cause) {
      status = (cause as ProbeError).status ?? 0;
      body = (cause as ProbeError).body ?? '';
    }

    expect([401, 403]).toContain(status);
    // And the refusal must not be a disguised empty list: the answer has to name itself.
    expect(body).not.toContain('"items"');
  });

  it('wraps a foreign error as 502 rather than guessing a status', async () => {
    // The flip side, asserted so the 502 above reads as a deliberate choice rather than a surprise.
    // A gateway that answered 403 with a body the client failed to parse must not be reported as
    // 403, and must not be reported as 200-with-no-rows either.
    let cause: MobileApiErrorShape | null = null;
    try {
      await loadMobileNotificationHistory(gatewayFor(OTHER_TENANT));
    } catch (error) {
      cause = error as MobileApiErrorShape;
    }

    expect(cause).not.toBeNull();
    expect(cause!.status).toBe(502);
    expect(cause!.code).toBe('NOTIFICATION_HISTORY_FAILED');
  });
});