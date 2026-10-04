import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

/**
 * Contract for the live admin operational summary proxy.
 *
 * This file used to be a behavioural test: it imported the handler from
 * `app/api/operational-summary/route` and drove it with a mocked loader. That route had no
 * in-app caller — the two consumers (`operational-summary-experience.tsx` and
 * `noc-content.tsx`) both read `/api/admin/operational-summary`, which returns the backend
 * payload directly and lets the component derive its own view state from the HTTP status. The
 * duplicate is deleted, and with it the loader-normalisation layer and its `{state: ...}`
 * envelope, which nothing read.
 *
 * The test is a source contract rather than a behavioural one, which is a real reduction in
 * strength and is stated here rather than papered over. The reason is structural:
 * `tsconfig.jest.json` excludes `apps/admin-web/**`, so ts-jest cannot type-check a handler
 * from that app, and a runtime alias mapping in jest.config.js would not help either. Every
 * other admin-web route contract in this repository is asserted the same way, by reading the
 * source.
 */
const route = read('apps/admin-web/app/api/admin/operational-summary/route.ts');

describe('Module 10 Admin Web operational summary route', () => {
  it('forwards the authenticated backend payload from the session-bound client', () => {
    expect(route).toContain('AdminSessionBackendClient.create()');
    expect(route).toContain("client.request('/admin/operational-summary')");
    // The payload is passed through rather than reshaped, so the component sees the real
    // backend contract instead of a projection that can drift from it.
    expect(route).toContain('NextResponse.json(payload, { status: response.status })');
  });

  it('clears only an expired session while preserving backend authorization status', () => {
    // 401 means the session is no longer usable and the browser cookies must be cleared.
    // 403 is an authorization decision for a still-valid session and must flow through the
    // normal backend response path instead of being collapsed into logout.
    expect(route).toContain('if (status === 401)');
    expect(route).not.toContain('status === 401 || status === 403');
    expect(route).toContain("code: 'UNAUTHORIZED'");
    expect(route).toContain('clearSessionCookies(response)');
    expect(route).toContain('finalizeAdminSessionResponse(client, next, response.status)');
    // The backend reason code from an exception must never be reflected from the catch path.
    expect(route).not.toMatch(/cause\.(code|reasonCode)\b/);
  });

  it('bounds an unreachable backend to a server-side failure rather than a device fault', () => {
    expect(route).toContain("code: 'SUMMARY_UNAVAILABLE'");
    // A 5xx from upstream is normalised to 502, so the browser never sees a raw upstream code.
    expect(route).toContain('status >= 500 ? 502 : status');
  });

  it('does not keep a second unnormalised operational summary proxy', () => {
    // The duplicate survived because nothing asserted its absence. Its backend target is served
    // by the surviving route, so keeping both meant two HTTP contracts for one payload.
    const legacy = resolve(
      root,
      'apps/admin-web/app/api/operational-summary/route.ts',
    );
    expect(() => readFileSync(legacy, 'utf8')).toThrow();
  });
});
