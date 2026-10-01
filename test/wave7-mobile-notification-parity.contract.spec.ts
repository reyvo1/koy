import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Wave 7: the mobile notification delivery surface has to be reachable, not merely present.
 *
 * The census for this wave counted vocabulary and found the backend whole: `NotificationController`
 * serves `/notifications`, `/notifications/summary` and `/notifications/:id`, and two real product
 * writers feed it (`AuthService.register` enqueues a verification, `AuthService.forgotPassword`
 * enqueues a reset). The mobile app counted zero for the same vocabulary outside one client file.
 *
 * That is the shape this repo keeps meeting: a method that exists, typechecks, has a spec, and no
 * caller can reach. So these assertions are about reachability, and each one is written so that
 * deleting the wiring — not just the word — turns it red.
 */
const root = resolve(__dirname, '..');

const read = (path: string): string => {
  const full = resolve(root, path);
  if (!statSync(full).isFile()) throw new Error(`not a file: ${path}`);
  return readFileSync(full, 'utf8');
};

/**
 * Comments stripped before matching.
 *
 * Not optional here: two of the strings these assertions look for — `notificationDeliveryHistory`
 * and `alertDeliveryHistory` — appear in prose explaining exactly why they were false. A guard that
 * cannot tell an explanation from the thing it explains is "fixed" by deleting the explanation, and
 * the next reader rediscovers the trap unaided.
 */
const readCode = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

const SHELL = 'apps/user-mobile/src/ui/mobile-authenticated-shell.tsx';
const ALERTS_PANEL = 'apps/user-mobile/src/ui/mobile-alerts-panel.tsx';
/**
 * The delivery panel, not the alerts panel.
 *
 * The first version of these assertions pointed at `mobile-alerts-panel.tsx`, which is where the
 * *analytics* findings render — and it went green the moment the delivery panel existed, because the
 * four field names it checks are in that new file and not in the old one. A guard aimed at the wrong
 * file is decoration: it reads as coverage of a screen it never opened. Naming the panel that
 * actually renders the rows is the fix, and the distinction matters because the two panels answer
 * different questions and sit adjacent on purpose.
 */
const DELIVERY_PANEL =
  'apps/user-mobile/src/ui/mobile-notification-delivery-panel.tsx';
const CLIENT = 'apps/user-mobile/src/device-control/mobile-notification-client.ts';
const CLIENT_SPEC = 'apps/user-mobile/src/device-control/mobile-notification-client.spec.ts';
const BACKEND_LOG_SPEC = 'test/notification-operator-log.contract.spec.ts';

/** The statement that opened a method, found by its own unique prefix rather than by its name. */
function methodBody(code: string, signaturePrefix: string): string {
  const start = code.indexOf(signaturePrefix);
  expect(start).toBeGreaterThanOrEqual(0);
  const braceAt = code.indexOf('{', start);
  expect(braceAt).toBeGreaterThan(start);
  return code.slice(braceAt);
}

describe('Wave 7: the mobile app can answer "did the notification go out?"', () => {
  describe('the client exists and is honest about what it read', () => {
    it('reads the delivery log rather than the analytics findings', () => {
      // The distinction is the whole unit. `/analytics/alerts/accessible` answers "what did the
      // detector find"; `/notifications` answers "did the message leave". A client pointed at the
      // first would render a clean analytics list under a heading that promises delivery.
      expect(readCode(CLIENT)).toContain('/notifications?');
      expect(readCode(CLIENT)).not.toContain('/analytics/alerts');
    });

    it('names its own source, so a row cannot be read as the other surface', () => {
      expect(readCode(CLIENT)).toMatch(/NOTIFICATION_DELIVERY_LOG/);
    });

    it('never calls res.json twice on one response', () => {
      // The client returns `items` and `total` from a single body. Reading the body a second time
      // throws "Body is unusable" and kills the load after its first assertions, which reads as a
      // product fault rather than a probe artefact.
      const code = readCode(CLIENT);
      const jsonReads = code.match(/\.json\(\)/g) ?? [];
      expect(jsonReads).toHaveLength(0);
    });

    it('is covered by a spec that lives inside jest roots', () => {
      // `apps/user-mobile/src` is a root. A spec parked next to the client but outside the roots
      // compiles, passes by hand, and never runs — which reads as coverage.
      expect(statSync(resolve(root, CLIENT_SPEC)).isFile()).toBe(true);
      expect(readCode(CLIENT_SPEC)).toContain('wasSent');
    });
  });

  describe('the console reaches it', () => {
    it('loads the delivery history from the shell, not from a helper nobody calls', () => {
      // The zero-caller shape. Asserting the export exists is satisfied by a file no screen imports,
      // so this asserts the *call site* instead.
      const code = readCode(SHELL);
      expect(code).toMatch(/loadMobileNotificationHistory\s*\(/);
      expect(code).toMatch(/loadMobileNotificationSummary\s*\(/);
    });

    it('fetches the delivery history when the alerts tab opens', () => {
      // Written after a mutation proved the assertion above was half a guard. Deleting the
      // `useEffect` that calls `loadNotifications` — while leaving the client call, the import, the
      // state and the rendered panel all in place — kept all twenty-one assertions green. The
      // panel received `history={null}` forever, which is a screen that renders "not read yet" and
      // never reads anything, and it typechecks perfectly.
      //
      // So this asserts the fetch is *wired to the tab*, not merely present in the file. Bounded to
      // the effect's own body: a `loadNotifications()` call anywhere else in the file satisfies
      // nothing here, which is the point.
      const code = readCode(SHELL);
      const effectAt = code.indexOf('if (tab ===');
      expect(effectAt).toBeGreaterThanOrEqual(0);
      const alertsEffect = code.slice(effectAt, effectAt + 200);
      expect(alertsEffect).toMatch(/loadNotifications/);

      // And the callback it invokes must itself perform the read, so a no-op wrapper cannot stand
      // in for it.
      const callback = methodBody(code, 'const loadNotifications = useCallback');
      expect(callback).toMatch(/loadMobileNotificationHistory/);
      expect(callback).toMatch(/loadMobileNotificationSummary/);
    });

    it('imports it from the client module, with a real import statement', () => {
      const code = readCode(SHELL);
      expect(code).toMatch(
        /import\s*\{[^}]*\bloadMobileNotificationHistory\b[^}]*\}\s*from\s*'[^']*mobile-notification-client'/,
      );
    });

    it('holds the history in state, so it can render a failure', () => {
      // Fail-closed: an unread history must be distinguishable from an empty one, which needs
      // somewhere to put the error. `useState(null)` for the payload is what makes "not loaded yet"
      // a state the UI can say out loud.
      const code = readCode(SHELL);
      expect(code).toMatch(/useState<MobileNotificationHistory \| null>\(null\)/);
      expect(code).toMatch(/notificationHistoryError/);
    });

    it('separates the loading error from the empty state in the render', () => {
      // The literal console rule: `[]` claims "this list is empty" before any request has run. A
      // first render and a render after an outage must not look alike.
      const code = readCode(SHELL);
      expect(code).not.toMatch(/useState<MobileNotificationHistory>\(\[\]\)/);
      expect(code).not.toMatch(/useState<MobileNotificationSummary>\(\{\}\)/);
    });

    it('renders the destination as absent, not as an empty field', () => {
      // The list route omits `destination` on purpose. A panel that renders the field anyway prints
      // nothing where an address should be, and an empty box reads as a data fault.
      //
      // `destinationListed` is a payload flag, not markup, so the panel does not have to render the
      // literal identifier — it has to *say* the address is not here, which the next assertion
      // checks in the words an operator reads. Asserting the identifier was the wrong question and
      // it failed on this panel's own implementation rather than on a defect.
      const code = readCode(DELIVERY_PANEL);
      expect(code).toMatch(/destination|tujuan/i);
    });

    it('renders the destination field nowhere at all', () => {
      // The positive half of the assertion above, and the one that survives the obvious
      // "fix". `destinationListed` can sit in a comment or a docblock while the row still renders
      // `row.destination` into an empty box. So the field itself must be absent from the markup.
      const code = readCode(DELIVERY_PANEL);
      expect(code).not.toMatch(/row\.destination|\.destination\b/);
    });

    it('says the address is not listed here, in words the operator can read', () => {
      // A `false` flag nobody renders is a type assertion, not an explanation. The panel has to
      // tell the operator where the address actually is.
      const code = readCode(DELIVERY_PANEL);
      expect(code).toMatch(/Alamat tujuan tidak ditampilkan/);
    });

    it('still calls the alerts panel by its own name, and does not merge the two questions', () => {
      // The two panels sit adjacent. If the delivery panel ever absorbed the analytics findings —
      // or the alerts panel started rendering delivery rows — the screen would answer one question
      // while looking like it answered both.
      const alerts = readCode(ALERTS_PANEL);
      expect(alerts).toMatch(/MobileAlertsPayload/);
      expect(alerts).not.toMatch(/NOTIFICATION_DELIVERY_LOG|MobileNotificationHistory/);

      const shell = readCode(SHELL);
      expect(shell).toMatch(/<MobileAlertsPanel/);
      expect(shell).toMatch(/<MobileNotificationDeliveryPanel/);
    });

    it('states which filter it applied, so a silent unfiltered list is impossible to mistake for one', () => {
      const code = readCode(DELIVERY_PANEL);
      expect(code).toMatch(/appliedStatus/);
    });

    it('does not claim a row was sent on the strength of a status label', () => {
      // The inverted assertion from the client spec, kept at the render layer: the panel must read
      // the derived `wasSent`, never the `status` string, or a DELIVERING row with a stale
      // `sentAt` renders as a delivery.
      const code = readCode(DELIVERY_PANEL);
      expect(code).toMatch(/wasSent/);
      expect(code).not.toMatch(/status\s*===\s*'SENT'/);
    });

    it('reconciles the two counts instead of showing one', () => {
      // `total` is the server's count and `droppedRows` is what this client could not render.
      // Showing only `total` would report rows the user cannot see; showing only `items.length`
      // would hide that anything was dropped.
      const code = readCode(DELIVERY_PANEL);
      expect(code).toMatch(/droppedRows/);
    });
  });

  describe('the delivery filter is honoured on both sides of the hop', () => {
    it('the backend refuses a status it cannot match, rather than dropping it', () => {
      // The live probe found this: `?status=NOT_A_STATUS` answered 200 with every row, so an
      // operator holding a typo'd filter saw a full list and a filter that appeared to work.
      const code = readCode('src/notification/notification.service.ts');
      const body = methodBody(code, 'async listForOperator');
      const throwAt = body.search(
        /throw\s+new\s+DomainBadRequestException\s*\(\s*\n?\s*ERROR_CODES\.ValidationFailed/,
      );
      expect(throwAt).toBeGreaterThanOrEqual(0);
      // And it must precede the query, or it is a guard that guards nothing.
      expect(throwAt).toBeLessThan(body.indexOf('findMany'));
    });

    it('the check is not `in`, which answers true for inherited Object keys', () => {
      // `'toString' in NotificationStatus` is `true` on the generated enum object, so a caller
      // naming an inherited key would have been believed and Prisma handed a status that exists
      // nowhere in the schema. A mutation swapped the check back to `in` and every assertion in the
      // spec stayed green, which is why this one exists.
      const code = readCode('src/notification/notification.service.ts');
      const at = code.indexOf('isKnownStatus');
      expect(at).toBeGreaterThanOrEqual(0);
      const helper = methodBody(code, 'private isKnownStatus');
      expect(helper).toMatch(/Object\.values\(NotificationStatus\)/);
      expect(helper).not.toMatch(/value\s+in\s+NotificationStatus/);
    });

    it('an empty filter is an absence, not a search for nothing', () => {
      // A UI with no filter chosen sends `?status=`. Reading that as a literal empty status returns
      // an empty list, which is the exact "no notifications exist" rendering the old fallback was
      // written to avoid — reached by correct code.
      const code = readCode('src/notification/notification.service.ts');
      const body = methodBody(code, 'async listForOperator');
      const at = body.search(/trim\(\)/);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(body).toMatch(/requested\s*\?\s*\{ status:/);
    });

    it('the refusal is pinned by a behavioural spec, not only by a source guard', () => {
      const spec = readCode(BACKEND_LOG_SPEC);
      expect(statSync(resolve(root, BACKEND_LOG_SPEC)).isFile()).toBe(true);
      // A source guard cannot see whether the query ran. This asserts the *absence* of the call,
      // which is the half that makes the refusal honest.
      expect(spec).toMatch(/expect\(notification\.findMany\)\.not\.toHaveBeenCalled\(\)/);
    });
  });

  describe('what must not be built on the back of this', () => {
    it('adds no retry-now button on the operator log', () => {
      // Retry is the worker's job, and a hand-triggered resend would race the lease the worker
      // already holds. The log is for reading.
      expect(readCode('src/notification/notification.controller.ts')).not.toMatch(
        /@(Post|Patch|Delete)\b/,
      );
    });

    it('adds no on-call rotation that nothing can page', () => {
      // The Wave 6 NOC census found exactly one `on-call` hit, in auth. A rotation table with no
      // paging integration is the shape this repo has found before: a feature that looks available
      // and is not.
      expect(read('prisma/schema.prisma')).not.toMatch(/onCallRotation|pagerDuty|rotationId/i);
    });
  });
});