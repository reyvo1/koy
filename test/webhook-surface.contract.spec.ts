import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeTransportFailure } from '../src/webhook/webhook-runtime.service';

/**
 * The console's webhook event vocabulary is a second copy of a list the backend owns.
 *
 * `SUBSCRIBABLE_EVENTS` in `src/webhook/webhook.controller.ts` is the only list the API will
 * accept, and the console mirrored it rather than fetching it — a console that fetched the
 * list would have to call the backend before it could render the form. A mirror is a
 * legitimate design; a mirror with nothing keeping it honest is not. The copy drifted:
 * the BFF offered `device.telemetry.received`, `alert.resolved`, `command.issued`,
 * `command.acknowledged` and `firmware.rollout.progress`, none of which the backend accepts,
 * and omitted `telemetry.threshold_breached` and `incident.opened`, which it does. An
 * operator who ticked "Perintah diterbitkan" got a 400 from a checkbox the product rendered.
 *
 * Three properties are asserted, and they partition by what each one owes:
 *
 *  1. **Vocabulary parity** — the BFF list and the page's option list are the backend's list,
 *     read out of the controller source. Source-shaped on purpose: this is a duplicate that
 *     only exists as a literal, so reading the literal is the only way to compare it.
 *  2. **Every advertised event has an emitter** — a list entry nothing dispatches is a
 *     subscription that can never fire, which is the exact defect the runtime was built to
 *     remove (see the `DeviceService` constructor note). `*` is exempt because it is a
 *     wildcard, not an event name.
 *  3. **The wildcard rule holds in both copies** — `*` cannot be combined with other events,
 *     and the backend enforces it, so a console that offers the combination is offering a
 *     request the server will refuse.
 */
const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const CONTROLLER = 'src/webhook/webhook.controller.ts';
const BFF_ROUTE = 'apps/admin-web/app/api/admin/webhooks/endpoints/route.ts';
const PAGE = 'apps/admin-web/app/tenant/webhooks/page.tsx';

/**
 * Pull a `const NAME = [ ... ] as const` array out of a TypeScript source file.
 *
 * Fails loudly on an empty extraction rather than returning `[]`. A guard that compares two
 * empty lists reports "no drift" from a file that no longer declares the list at all, which
 * is the vacuous-pass shape this repo has been bitten by before.
 */
function declaredArray(source: string, name: string): string[] {
  const start = source.indexOf(`const ${name} = [`);
  if (start === -1) {
    throw new Error(
      `could not find \`const ${name} = [\` — the declaration this guard reads has been renamed or removed`,
    );
  }
  const open = source.indexOf('[', start);
  const close = source.indexOf(']', open);
  const body = source.slice(open + 1, close);
  const values = Array.from(body.matchAll(/'([^']+)'/g), (m) => m[1]);
  if (values.length === 0) {
    throw new Error(`\`${name}\` extracted no entries — the guard would compare nothing`);
  }
  return values;
}

/** The option values the page's checkbox list actually offers. */
function pageEventOptions(source: string): string[] {
  const values = Array.from(source.matchAll(/\{ value: '([^']+)', label:/g), (m) => m[1]);
  if (values.length === 0) {
    throw new Error('the page declares no `{ value: "...", label: ... }` event options');
  }
  return values;
}

describe('webhook event vocabulary', () => {
  const backend = declaredArray(read(CONTROLLER), 'SUBSCRIBABLE_EVENTS');
  const bff = declaredArray(read(BFF_ROUTE), 'SUBSCRIBABLE_EVENTS');
  const page = pageEventOptions(read(PAGE));

  it('offers the backend vocabulary and nothing else, in the BFF route', () => {
    // The whole defect in one assertion: a checkbox the server refuses is worse than a
    // missing one, because the operator is told the product does not support it.
    expect([...bff].sort()).toEqual([...backend].sort());
  });

  it('offers the backend vocabulary and nothing else, in the console page', () => {
    // The page is a second mirror of the same list, so it can drift independently of the
    // BFF. It is what the operator actually sees, so it is the one that has to be right.
    expect([...page].sort()).toEqual([...backend].sort());
  });

  it('lists an event only when the backend can actually emit it', () => {
    // The stronger half of "the API and the product describe the same list". `telemetry
    // .threshold_breached`, `alert.raised` and `incident.opened` are accepted by the
    // validator and dispatched by nothing, so subscribing to one is a promise the platform
    // cannot keep. Every non-wildcard entry must name an event some call site dispatches.
    const srcRoot = resolve(root, 'src');
    const emitted = new Set<string>();
    // Two shapes, because both exist. A guard that knows only `.dispatch(` reports "nothing
    // is emitted" the moment an emitter is refactored onto a shared helper — which is exactly
    // what this assertion did when `DeviceService` gained `emitEvent`. The failure mode is
    // the same as a guard that matches nothing: the extractor has to track reality, and
    // reality moves.
    const EMITTERS = [
      /\.dispatch\(\s*[^,]+,\s*'([^']+)'/g,
      /\.emitEvent\(\s*[^,]+,\s*'([^']+)'/g,
    ];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          const source = readFileSync(full, 'utf8');
          for (const pattern of EMITTERS) {
            for (const m of source.matchAll(pattern)) {
              emitted.add(m[1]);
            }
          }
        }
      }
    };
    walk(srcRoot);

    // Asserted positively as well as negatively, on purpose. The negative assertion alone is
    // satisfied by an extractor that matches nothing at all — the vacuous-pass shape this
    // repo has been bitten by before — so the emitted set is named explicitly. If this list
    // ever empties, the extractor broke; the product did not improve.
    expect([...emitted].sort()).toEqual(['device.registered', 'device.state_changed']);

    const unemitted = backend.filter((event) => event !== '*' && !emitted.has(event));
    expect({ unemitted }).toEqual({ unemitted: [] });
  });

  it('keeps the wildcard exclusive in both copies', () => {
    // `assertBackendCannotMixWildcard`-shaped rule, asserted on the console side: the backend
    // refuses `['*', 'alert.raised']`, so a console that offers both is offering a request
    // that cannot succeed. The page's `toggleEvent` clears the rest, and the BFF refuses
    // the combination before the round trip.
    const route = read(BFF_ROUTE);
    expect(route).toMatch(/events\.includes\('\*'\)/);

    const pageSource = read(PAGE);
    // Ticking `*` returns `['*']` alone, and ticking a specific event drops the wildcard.
    expect(pageSource).toMatch(/return current\.includes\('\*'\) \? \[\] : \['\*'\]/);
    expect(pageSource).toContain("current.filter((e) => e !== '*')");
  });

  it('rejects an unknown event at the BFF before it costs a round trip', () => {
    // The 400 carries the vocabulary back, so a console that has drifted still tells the
    // operator what the server accepts instead of only "400".
    const route = read(BFF_ROUTE);
    expect(route).toMatch(/events: SUBSCRIBABLE_EVENTS/);
    expect(route).toContain('Event tidak dikenal');
  });
});

describe('webhook signing-secret rotation surface', () => {
  it('exposes rotation through the tenant BFF with UUID validation and one-time secret response', () => {
    const route = read('apps/admin-web/app/api/admin/webhooks/endpoints/[endpointId]/rotate-secret/route.ts');
    expect(route).toContain("/rotate-secret");
    expect(route).toContain('UUID.test(endpointId)');
    expect(route).toContain("method: 'POST'");
  });

  it('requires explicit confirmation and shows the replacement secret only in one-time state', () => {
    const page = read(PAGE);
    expect(page).toContain('confirmRotateId');
    expect(page).toContain('Yakin rotasi');
    expect(page).toContain('Secret dirotasi — simpan secret baru sekarang');
    expect(page).toContain('/rotate-secret');
  });

  it('live probe proves new-secret validity and immediate old-secret invalidation', () => {
    const probe = read('scripts/probe-webhook-event-vocabulary.sh');
    expect(probe).toContain('signing-secret rotation invalidates the old secret');
    expect(probe).toContain('endpoint listing never leaks the rotated secret');
    expect(probe).toContain('post-rotation delivery verifies with the new secret');
    expect(probe).toContain('the old signing secret is invalid immediately after rotation');
    expect(probe).toContain("createHmac('sha256', oldSecret)");
    expect(probe).toContain("createHmac('sha256', newSecret)");
  });
});

describe('webhook delivery failure disclosure', () => {
  it('records why a delivery failed, not only that it did', () => {
    // A row saying `ok: false, statusCode: null` cannot be told apart from a receiver that
    // was never reached, which is the ambiguity the operator surface exists to remove. The
    // reason is captured at the point it is still known — the `catch` in `dispatch` — because
    // by the time the row is read it is gone.
    //
    // Read out of the `catch` block itself rather than by proximity: the assignment is
    // preceded by an explanatory comment, and a distance-bounded regex would quietly stop
    // matching the day that comment grew.
    const service = read('src/webhook/webhook-runtime.service.ts');
    const dispatch = service.slice(service.indexOf('async dispatch('));
    const catchStart = dispatch.indexOf('} catch (error) {');
    expect(catchStart).toBeGreaterThan(-1);
    const catchBlock = dispatch.slice(catchStart, dispatch.indexOf('}\n', catchStart) + 1);
    // The reason is *assigned* inside the catch — that is the only point it exists — and
    // *forwarded* on the call that follows it. Asserting both halves separately, because a
    // reason captured and then dropped at the call site is the same silence one function
    // further down.
    expect(catchBlock).toMatch(/reason\s*=\s*describeTransportFailure\(error\)/);
    const record = dispatch.slice(dispatch.indexOf('this.repository.recordDelivery('));
    expect(record).toMatch(/reason,/);
  });

  it('records the cause of a transport failure, not the wrapper message', () => {
    // `TypeError: fetch failed` is what Node's `fetch` throws for a refused connection, an
    // unresolvable host and a malformed URL alike. Storing it satisfies the column while
    // telling the operator nothing — the ambiguity this work removed, reintroduced one layer
    // up. Asserted because the column is only worth having if the values differ.
    const service = read('src/webhook/webhook-runtime.service.ts');
    expect(service).toContain('function describeTransportFailure');
    // The cause chain is walked, not just read once.
    expect(service).toMatch(/current = candidate\.cause/);
  });

  it('distinguishes the transport failures the console claims to tell apart', () => {
    // Behavioural, not source-shaped: the three failures an operator most needs separated,
    // run through the same helper `dispatch` uses. A helper that collapsed them to one
    // string would pass every source assertion above while leaving the console useless.
    const cases: [unknown, RegExp][] = [
      [
        Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9'), {
            code: 'ECONNREFUSED',
          }),
        }),
        /ECONNREFUSED/,
      ],
      [
        Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('getaddrinfo ENOTFOUND receiver.invalid'), {
            code: 'ENOTFOUND',
          }),
        }),
        /ENOTFOUND/,
      ],
      [
        Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('bad port'), {}),
        }),
        /bad port/,
      ],
    ];
    for (const [error, expected] of cases) {
      expect(describeTransportFailure(error)).toMatch(expected);
    }
    // And the three really are three different strings — the property that matters.
    const rendered = cases.map(([error]) => describeTransportFailure(error));
    expect(new Set(rendered).size).toBe(3);
  });

  it('gives every outbound delivery a deadline', () => {
    // Found by a live probe, not by reading: a receiver that accepts the connection and never
    // answers held the `fetch` promise open forever. `dispatch` awaits each endpoint in a
    // `for` loop, so one wedged receiver stopped delivery to every endpoint queued behind it —
    // and because the heartbeat path does not await the dispatch, nothing in the process ever
    // reported it.
    const service = read('src/webhook/webhook-runtime.service.ts');
    expect(service).toMatch(/const DISPATCH_TIMEOUT_MS = \d/);
    // Named constant, not a literal at the call site: the number is a policy decision, and a
    // literal makes the next reader guess whether it was chosen or typed.
    const dispatch = service.slice(service.indexOf('async dispatch('));
    expect(dispatch).toMatch(/signal: AbortSignal\.timeout\(DISPATCH_TIMEOUT_MS\)/);
  });

  it('carries the failure reason through to the operator surface', () => {
    const service = read('src/webhook/webhook-runtime.service.ts');
    // `recentDeliveries` is what the console reads. A column written and never selected is
    // a column the operator cannot see, which is the same silence in a different place.
    const recent = service.slice(service.indexOf('async recentDeliveries('));
    expect(recent).toMatch(/reason: row\.reason/);

    const page = read(PAGE);
    // Declared on the row type *and* rendered. A field the page declares and never shows is
    // the "control that is displayed, specced, and enforces nothing" shape: the type says
    // the console reads it, the markup never uses it, and nothing notices.
    expect(page).toMatch(/reason\?:\s*string \| null/);
    expect(page).toContain('delivery.reason');
    // And it is not merely declared: the header row and the cell both exist.
    expect(page).toContain('Alasan');
  });

  it('has the column the reason is written to', () => {
    // A write to a field the schema does not declare fails at runtime, not at build, so the
    // column is asserted here rather than discovered by a probe.
    const schema = read('prisma/schema.prisma');
    const model = schema.slice(schema.indexOf('model WebhookDelivery'));
    expect(model.slice(0, model.indexOf('}'))).toMatch(/reason\s+String\?/);
  });
});