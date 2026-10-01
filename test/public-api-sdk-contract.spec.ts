import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

/**
 * An SDK that drifts from its server is worse than no SDK.
 *
 * The client is a convenience, so its failure mode is silent: a method whose route was
 * renamed keeps compiling, keeps type-checking, and returns a 404 at the caller's site,
 * months later, in someone else's integration. The fix is to read the controller's own
 * decorators rather than trust that the two were written together.
 *
 * Both directions are asserted. A route in the client that the server does not declare, and a
 * route the server declares that the client cannot reach, are the two ways this pair rots.
 */
describe('public API SDK ↔ controller contract', () => {
  const controller = () => read('src/public-api/public-api.controller.ts');
  const sdk = () => read('packages/sdk/src/index.ts');

  const serverRoutes = (): string[] =>
    [...controller().matchAll(/@Get\('([^']+)'\)/g)].map((m) => `/v1/${m[1]}`);

  // `this.get<ListResponse<Device>>(...)` nests generics, so `[^>]+` stops at the inner `>`
  // and the pattern silently matched nothing. The `toBeGreaterThan(0)` assertion below is
  // what caught it: a route extractor that matches zero is a spec that passes for free.
  const clientRoutes = (): string[] =>
    [...sdk().matchAll(/this\.get<[\s\S]{0,80}?>\('(\/v1\/[^']+)'/g)].map((m) => m[1]);

  it('has a live probe, and the probe is wired to a runnable script', () => {
    // Everything else in this file is source-shaped: it reads the two sides and compares them.
    // That proves they agree, not that a call works. `scripts/probe-public-api-sdk.mts` is
    // the tier that settles it — it constructs the real client, calls the real API, and
    // asserts a credential column does not reach the wire — and it had never existed, so the
    // SDK's every claim was a claim about code that reads code.
    //
    // Asserted here so it cannot quietly disappear: a probe with no `package.json` entry is
    // a probe nobody runs, which is the same as no probe at all.
    const probe = read('scripts/probe-public-api-sdk.mts');
    expect(probe).toContain("from '../packages/sdk/src/index.ts'");
    expect(probe).toContain('PublicApiClient');
    const scripts = read('package.json');
    expect(scripts).toContain('sdk:probe');
    expect(scripts).toContain('node --experimental-strip-types scripts/probe-public-api-sdk.mts');
  });

  it('stays loadable by the consumer it claims to serve', () => {
    // `packages/sdk/package.json` declares `"type": "module"`. That is right for an SDK — a
    // `node` user imports it with ESM — but it means the repo's CJS `ts-node` cannot
    // `require` it, which is why the probe is `.mts` and run under `--experimental-strip-types`
    // rather than through `ts-node`. Pinned so a future "simplification" of the file
    // extension does not silently move the probe onto a runner that cannot load the SDK.
    expect(read('packages/sdk/package.json')).toContain('"type": "module"');
    // And the declaration the SDK's own comment calls out: parameter properties break
    // `--experimental-strip-types`, so the SDK must keep declaring `status`/`code` as fields.
    //
    // Scoped past the file's own prose. The comment that *explains* the rule quotes
    // `constructor(readonly status: number, ...)` verbatim, so a bare search matches the
    // documentation and fails — a guard that cannot distinguish an explanation from the thing
    // it explains is a guard that will be "fixed" by deleting the explanation.
    const withoutComments = sdk()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(withoutComments).toContain('readonly status: number');
    expect(withoutComments).not.toMatch(/constructor\s*\(\s*readonly\s+/);
  });

  it('every route the SDK calls is declared by the controller', () => {
    const declared = serverRoutes();
    const called = clientRoutes();

    // Both sides must actually be extracted, or "no drift" is trivially true.
    expect(declared.length).toBeGreaterThan(0);
    expect(called.length).toBeGreaterThan(0);
    // The point of the contract: a client method pointing at a route the server does not
    // serve is a 404 waiting to happen in someone else's integration.
    expect(called.filter((route) => !declared.includes(route))).toEqual([]);
  });

  it('every route the controller declares is reachable from the SDK', () => {
    const declared = serverRoutes();
    const called = clientRoutes();

    expect(declared.length).toBeGreaterThan(0);
    expect(called.length).toBeGreaterThan(0);
    // The other direction: a new public route nobody can call from the SDK is a feature that
    // exists only for curl users.
    expect(declared.filter((route) => !called.includes(route))).toEqual([]);
  });

  it('sends the key as X-API-Key, the header the guard reads', () => {
    expect(sdk()).toContain("'x-api-key'");
    // The guard accepts both spellings, but the SDK must use one of them and it must be one
    // the guard actually reads.
    expect(read('src/public-api/guards/api-key.guard.ts')).toContain("'x-api-key'");
  });

  it('surfaces a 403 as a permission failure distinct from a 401', () => {
    // The BFF used to flatten 403 into 401, so an integrator reading only the status cannot
    // tell a bad key from an insufficient one. The client keeps both.
    expect(sdk()).toContain('isAuthFailure');
    expect(sdk()).toContain('isPermissionFailure');
  });

  it('keeps the scope vocabulary in sync with the DTO the console offers', () => {
    const consoleScopes = [
      ...read('apps/admin-web/app/tenant/api-keys/page.tsx').matchAll(/value: '([A-Z_]+)'/g),
    ].map((m) => m[1]);
    const sdkScopes = [
      ...sdk().matchAll(/^  '([A-Z_]+)',$/gm),
    ].map((m) => m[1]);

    expect(sdkScopes.length).toBeGreaterThan(0);
    expect(consoleScopes.length).toBeGreaterThan(0);
    // A scope the console will not let you mint but the SDK names is a scope that cannot be
    // exercised, and one the console offers but the SDK omits is a capability with no client.
    expect(sdkScopes.filter((scope) => !consoleScopes.includes(scope))).toEqual([]);
  });

  it('refuses to construct without a key, rather than failing on the first call', () => {
    expect(sdk()).toContain('apiKey wajib diisi');
  });

  it('never sends a tenant header, because the tenant comes from the key', () => {
    // The server takes the tenant from the key record only. A client that also asserted
    // `x-tenant-id` would invite a caller to believe it can widen its own scope.
    expect(sdk()).not.toContain('x-tenant-id');
  });
});
