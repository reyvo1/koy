import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Live MQTT management evidence.
 *
 * MQTT already works and is already proven: `mqtt-js-publisher.adapter` connects, and the running
 * container shows a live client `iot-platform-api-…` / `iot-platform-publisher` on the EMQX node. The
 * webhook side is real too -- `mqtt/auth` and `mqtt/acl` are the paths every device connection
 * takes.
 *
 * What does not exist is any way to *see* that from inside the platform. The EMQX dashboard is
 * published on 18083 and its credentials sit in `.env`, but no source file reads them: management
 * is a browser tab a human opens by hand, with no record in the console, no tenant boundary, and
 * nothing for an operator to correlate with a device. The roadmap asks for "live MQTT management
 * evidence", and the honest reading of that is the evidence, not the publishing.
 *
 * The design decisions here are the load-bearing ones:
 *
 *  - **Read-only.** This surfaces connections and subscriptions. It must not be able to kick a
 *    device or change a topic, because a management surface that can disconnect a tenant's fleet
 *    is a much larger blast radius than one that observes it, and nothing in the roadmap asks for
 *    it. `disconnect` is asserted absent, not merely unused.
 *  - **Broker credentials are server-side only.** They are read from configuration, never from a
 *    request. A console that proxied EMQX would otherwise hand every platform operator the broker's
 *    administrator token, and the token has far more power than the page it came from.
 *  - **The token is per-call, not cached across requests.** EMQX tokens are short-lived; caching
 *    one turns a transient broker hiccup into a persistent failure, and holding it for the process
 *    lifetime means a rotated credential keeps working until restart, which is exactly the window
 *    an operator needs closed.
 *  - **A broker that is down is not an empty fleet.** The response states which, because "0
 *    connected clients" and "I could not ask" are different facts and an operator acting on the
 *    first one during an outage is how a healthy platform gets restarted for no reason.
 */
const root = resolve(__dirname, '..');
const read = (path: string): string => {
  const full = resolve(root, path);
  if (!statSync(full).isFile()) throw new Error(`not a file: ${path}`);
  return readFileSync(full, 'utf8');
};

/** Comments stripped, for negative assertions about code rather than prose. */
const readCode = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

const SERVICE = 'src/admin-operations/mqtt-management.service.ts';
const CONTROLLER = 'src/admin-operations/admin-platform-observability.controller.ts';
const PAGE = 'apps/admin-web/components/super-mqtt-content.tsx';

describe('live MQTT management evidence', () => {
  describe('the broker is asked, and the answer is attributed', () => {
    it('reaches the broker API rather than reporting what it knows already', () => {
      // The publisher's own connected state is not evidence: it is what the platform believes, and
      // a platform that believes its publisher is connected while the broker disagrees is the
      // exact failure this is meant to catch. The only real evidence is the broker's own answer.
      const service = read(SERVICE);
      expect(service).toMatch(/api\/v5/);
      expect(service).toMatch(/login/);
      expect(service).toMatch(/\/clients/);
    });

    it('says so when the broker cannot be reached, instead of showing an empty fleet', () => {
      // The distinction is the whole point of the surface. Zero connected clients is a fact about
      // the fleet; zero clients because the dashboard is unreachable is a fact about the platform,
      // and an operator who cannot tell them apart will restart a healthy broker.
      const code = readCode(SERVICE);
      // Every snapshot sets the flag, so it cannot be left out on one path. A regex over the whole
      // file for "brokerReachable" passed even when the unreachable path returned `true`, which is
      // the exact lie this guard exists to prevent -- so the *value* is checked per constructor.
      const flags = [...code.matchAll(/brokerReachable:\s*(true|false)/g)].map((m) => m[1]);
      expect(flags).toContain('false');
      // And the counts are zeroed in the same object, so a caller cannot read "0 clients" without
      // also reading the flag.
      const unreachableBody = code.slice(code.indexOf('private unreachable'));
      expect(unreachableBody).toMatch(/brokerReachable:\s*false/);
      expect(unreachableBody).toMatch(/clientCount:\s*0/);
      expect(unreachableBody).toMatch(/subscriptionCount:\s*null/);
      // A broker failure must not throw into a 500 that looks like a platform fault.
      expect(code).toMatch(/catch/);
    });

    it('reports the node state as well as the clients', () => {
      // A client list is unreadable on its own: one running node and a stopped node produce the
      // same empty list.
      const service = read(SERVICE);
      expect(service).toMatch(/\/nodes/);
    });
  });

  describe('broker credentials never leave the server', () => {
    it('reads the dashboard credentials from configuration, not from the request', () => {
      const code = readCode(CONTROLLER);
      const start = code.indexOf("@Get('platform-mqtt/management')");
      expect(start).toBeGreaterThanOrEqual(0);
      const rest = code.slice(start);
      const nextRoute = rest.slice(1).search(/@(Get|Post|Delete|Put|Patch)\(/);
      const block = nextRoute === -1 ? rest : rest.slice(0, nextRoute);
      // No credential in the route, and nothing from a body: the broker password is read from
      // configuration inside the service and never travels through a request.
      expect(block).not.toMatch(/password|dashboardPassword|brokerToken|body\./i);
    });

    it('never returns the token to the console', () => {
      // Even the redacted form is a leak: a short token is enough to identify the credential, and
      // the console has no use for it.
      const service = read(SERVICE);
      expect(service).not.toMatch(/token:\s*token/);
      expect(service).not.toMatch(/return\s*{[^}]*\btoken\b/);
    });

    it('authenticates per call instead of holding a token for the process lifetime', () => {
      // Caching would make a transient failure persistent, and would keep a rotated credential
      // working until the next restart -- the exact window an operator needs closed.
      const service = read(SERVICE);
      expect(service).not.toMatch(/private (cached|hold)Token|private tokenCache/i);
    });
  });

  describe('read-only by construction', () => {
    it('cannot disconnect a client or change a topic', () => {
      // Asserted absent rather than unused. A management surface that can kick a device has a far
      // larger blast radius than one that observes, and nothing in the roadmap asks for it.
      const service = readCode(SERVICE);
      expect(service).not.toMatch(/DELETE|disconnect|clients\/\$\{|kick/i);
    });

    it('exposes no write route for the management surface', () => {
      // Sliced from the management route to the *next* route decorator, not to the end of the
      // file: this controller also holds `POST platform-reports/saved`, and an earlier version of
      // this guard asserted over everything after the management route, so it failed on a write
      // route that belongs to a different feature. Slicing to the next decorator tests the thing it
      // names. The comment above the route also says "@Get only", so the slice has to skip it.
      const code = readCode(CONTROLLER);
      const start = code.indexOf("@Get('platform-mqtt/management')");
      expect(start).toBeGreaterThanOrEqual(0);
      const rest = code.slice(start);
      const nextRoute = rest.slice(1).search(/@(Get|Post|Delete|Put|Patch)\(/);
      const block = nextRoute === -1 ? rest : rest.slice(0, nextRoute);
      expect(block).not.toMatch(/@Post|@Delete|@Put|@Patch/);
    });
  });

  describe('console', () => {
    it('tells a failed request apart from a reachable broker with nothing to report', () => {
      // Three states, and an earlier version collapsed two of them: "not asked yet" and "the
      // request failed" both rendered as the same sentence, so a session the platform had just
      // rejected looked like a screen that had not loaded. An operator then reloaded, or waited,
      // and neither helped -- because the broker was fine and the console was not.
      // Asserted on the render condition, not on the presence of the words. A guard that only
      // checked `snapshotError` appears somewhere passed even after the branch was disabled, which
      // is the exact regression it was written for -- and the third time in this file a string
      // check has outlived the behaviour it was meant to pin.
      // Asserted on the rendered condition, not on position or on the mere presence of a word.
      // Two earlier versions of this guard passed against a disabled branch: one checked only that
      // `snapshotError` appeared somewhere, and one compared string offsets, which survived even
      // after comment-stripping renamed the branch -- `{snapshotError}` inside the message template
      // still satisfied it. A fourth kind of check is needed: the *ternary itself*.
      //
      // So the guard now requires the actual decision shape: the error branch is a condition that
      // mentions the error state, and it sits inside the expression that picks the message. A
      // disabled branch is `{false ? ... : ...}`, which mentions no condition at all.
      const page = read(PAGE);
      const ternary = /\{\s*(snapshotError|snapshotError\s*\?[^?]*\?)\s*\n/.exec(page);
      expect(ternary).not.toBeNull();

      // And the three states are three distinct sentences, so none of them can be reached by
      // falling through to another's wording.
      expect(page).toMatch(/Belum ditanyakan/);
      expect(page).toMatch(/tidak dapat diambil/);
      expect(page).toMatch(/Broker tidak dapat dijangkau/);
      // The message names whose fault it is, so a failed request cannot be misread as broker state.
      expect(page).toMatch(/Broker mungkin sehat/i);
    });

    it('renders the count only when the broker answered', () => {
      // Order alone was not enough to test, and an earlier version of this guard measured it by
      // string position -- which still passed when the count block was moved above the banner,
      // because the word "clients" appears in the snapshot interface far earlier in the file.
      //
      // What actually matters is the render condition, not the position: the counts are inside a
      // `snapshot.brokerReachable` branch, so a snapshot that says "unreachable" cannot paint a
      // number at all. Asserted on that branch rather than on layout.
      const code = readCode(PAGE);
      const countAt = code.indexOf('snapshot.clientCount');
      expect(countAt).toBeGreaterThanOrEqual(0);

      // Walk back from the count to the nearest `snapshot.brokerReachable` guard and require it to
      // be a *positive* condition, not a `!`.
      const before = code.slice(Math.max(0, countAt - 1200), countAt);
      const guards = [...before.matchAll(/snapshot\.brokerReachable/g)];
      expect(guards.length).toBeGreaterThan(0);
      expect(before.lastIndexOf('!snapshot.brokerReachable')).toBeLessThan(
        before.lastIndexOf('snapshot.brokerReachable'),
      );
      // And the unreachable wording is stated in plain language, not only as a flag.
      expect(read(PAGE)).toMatch(/Broker tidak dapat dijangkau/);
    });

    it('shows when the evidence was gathered, not just the current total', () => {
      // A total with no timestamp cannot be correlated with a device that went quiet, which is the
      // comparison an operator actually makes.
      const page = read(PAGE);
      expect(page).toMatch(/checkedAt|Diperiksa|padaJam/i);
    });
  });

  describe('what must not be built from this', () => {
    it('adds no broker write configuration to the console', () => {
      // Same reasoning as the saved-report scheduler: a field that looks available and is not
      // available in the product is a defect this repo has found before.
      const page = read(PAGE);
      expect(page).not.toMatch(/restart broker|Ubah password broker|create topic/i);
    });
  });
});
