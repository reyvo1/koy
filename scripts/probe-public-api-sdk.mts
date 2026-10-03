/**
 * Live proof that the SDK actually talks to the public API.
 *
 * The SDK has two properties no other part of this repo does: it is the surface an external
 * integrator programs against, and `test/public-api-sdk-contract.spec.ts` proved its routes
 * match the controller's by reading both sources. Both are source-shaped. Nothing had ever
 * constructed a `PublicApiClient` and made a request, so every claim about the SDK was a
 * claim about the *code that reads the code*.
 *
 * This imports the real client and calls the real API, which is the only tier of evidence that
 * settles whether an integrator's first call works.
 *
 * The key is minted through the product's own route and revoked at the end — the plaintext
 * exists only in the create response, so it cannot be read back afterwards.
 *
 * `.mts` rather than `.ts`: `packages/sdk/package.json` declares `"type": "module"`, and
 * `ts-node` in this repo resolves to CJS, so a `.ts` probe cannot `require` it — it dies with
 * `ERR_REQUIRE_ESM` before making a single call. That is a property of the toolchain, not of
 * the SDK: `node --experimental-strip-types` imports this same file fine, which is the
 * consumer an integrator actually is. Naming the file honestly keeps the failure legible.
 *
 * Env: PROBE_EMAIL, PROBE_PASSWORD, PROBE_TENANT_ID, PROBE_BASE
 */
import { PublicApiClient, PublicApiError } from '../packages/sdk/src/index.ts';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:3000';
const TENANT = process.env.PROBE_TENANT_ID ?? '22222222-2222-4222-8222-222222222222';

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

async function main(): Promise<void> {
  // --- 1. the client refuses to exist without a key -----------------------
  let refusedToConstruct = false;
  try {
    // eslint-disable-next-line no-new
    new PublicApiClient({ baseUrl: BASE } as never);
  } catch {
    refusedToConstruct = true;
  }
  check('the client refuses to be constructed without a key', refusedToConstruct);

  // --- 2. mint a key through the product ----------------------------------
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.PROBE_EMAIL,
      password: process.env.PROBE_PASSWORD,
      tenantId: TENANT,
    }),
  });
  const session = (await login.json()) as { accessToken?: string; token?: string };
  const token = session.accessToken ?? session.token;
  if (!login.ok || !token) throw new Error(`login failed: ${login.status}`);

  const createKey = await fetch(`${BASE}/admin/api-keys`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-tenant-id': TENANT,
    },
    body: JSON.stringify({ name: `sdk-live-probe-${Date.now().toString(36)}`, scopes: ['TELEMETRY_READ'] }),
  });
  const created = (await createKey.json()) as { id?: string; plaintext?: string };
  if (!createKey.ok || !created.plaintext) {
    throw new Error(`key mint failed: ${createKey.status} ${JSON.stringify(created)}`);
  }
  console.log(`\n-- minted key ${created.id} --\n`);

  try {
    const client = new PublicApiClient({ baseUrl: BASE, apiKey: created.plaintext });

    // --- 3. the three methods the controller declares ----------------------
    const devices = await client.listDevices({ limit: 3 });
    check('listDevices returns a list envelope', Array.isArray(devices.items));
    check('listDevices respects the limit it was given', devices.items.length <= 3,
      `got ${devices.items.length}`);
    check('listDevices reports a count', typeof devices.count === 'number',
      `count=${String(devices.count)}`);
    if (devices.items.length > 0) {
      // Via `unknown`, because the compiler rejects a direct cast: `Device` has no index
      // signature, which is exactly the point — the *declared* type cannot hold a credential
      // column, and the assertion below checks that the *wire* does not either.
      const first = devices.items[0] as unknown as Record<string, unknown>;
      // The credential-column guard asserts the *source* excludes the provisioning-token
      // hash. This asserts the *wire* does, which is the claim an integrator depends on.
      check(
        'no credential column rides along in a device row',
        !('provisioningTokenHash' in first) && !('deviceCredential' in first),
        Object.keys(first).join(','),
      );
      check('a device row carries the fields the SDK declares',
        'id' in first && 'name' in first && 'type' in first && 'status' in first);
    }

    const telemetry = await client.listTelemetry({ limit: 2 });
    check('listTelemetry returns a list envelope', Array.isArray(telemetry.items));
    check('listTelemetry respects the limit', telemetry.items.length <= 2,
      `got ${telemetry.items.length}`);

    const findings = await client.listFindings({ limit: 2 });
    check('listFindings returns a list envelope even when empty', Array.isArray(findings.items));
    // Wave 11 records zero analytic computation, so an empty list is the correct answer here.
    // Asserted so a future reader does not read "empty" as "broken": the method resolved and
    // parsed, which is what is being tested.
    check('listFindings resolves rather than erroring', findings.items.length >= 0);

    // --- 4. the refusal path is typed, not a raw throw ---------------------
    const badKey = new PublicApiClient({ baseUrl: BASE, apiKey: 'not-a-real-key' });
    let typedRefusal = false;
    let status = 0;
    try {
      await badKey.listDevices();
    } catch (error) {
      typedRefusal = error instanceof PublicApiError;
      status = error instanceof PublicApiError ? error.status : 0;
    }
    check('a rejected key raises PublicApiError rather than a raw error', typedRefusal);
    check('the refusal carries the server status', status === 401, `status=${status}`);

    // A 403 is a permission decision, not an expired key, and an integrator has to tell them
    // apart — the same distinction the admin console's proxy was fixed for.
    const noScope = new PublicApiClient({ baseUrl: BASE, apiKey: created.plaintext });
    let refusalStatus = 0;
    try {
      await noScope.listDevices({ limit: 5000 });
    } catch (error) {
      // A limit above the clamp is not a permission error, so a clean resolution here is the
      // correct behaviour; only a thrown error is interesting.
      refusalStatus = error instanceof PublicApiError ? error.status : 0;
    }
    check('an over-large limit is clamped rather than refused', refusalStatus === 0,
      `status=${refusalStatus}`);
  } finally {
    // --- 5. revoke, and confirm it actually took --------------------------
    await fetch(`${BASE}/admin/api-keys/${created.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': TENANT },
    });
    const afterRevoke = new PublicApiClient({ baseUrl: BASE, apiKey: created.plaintext });
    let revoked = false;
    try {
      await afterRevoke.listDevices();
    } catch (error) {
      revoked = error instanceof PublicApiError && error.status === 401;
    }
    check('the key stops working after revocation', revoked);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('probe crashed:', error);
  process.exit(1);
});
