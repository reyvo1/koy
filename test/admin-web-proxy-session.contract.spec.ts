import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

/**
 * The BFF turned every 403 into a 401 and cleared the session.
 *
 * `proxyBackend` collapsed `status === 401 || status === 403` into one branch that answered
 * 401 `UNAUTHORIZED` with "Sesi tidak valid." and called `clearSessionCookies`. A 403 is an
 * authorization decision about one resource — a tenant admin reading an organization that is
 * not theirs, a MEMBER attempting a write — and answering it by destroying the session signs
 * the operator out of the console for having been told they lack a permission they already
 * hold. The session was valid; the request was not allowed.
 *
 * It bites concretely: the organization branch refusal is a 403, so through this proxy the
 * admin whose access was refused would have been logged out by the refusal itself.
 *
 * This is a source-shaped contract, matching the other `apps/admin-web` contracts in this
 * directory, because `@/lib/session` is unresolvable from the root jest project and importing
 * the module would need a jest alias change to shared config. The behavioural half is proved
 * against the running console instead — see the checkpoint — which is stronger evidence than
 * this assertion, not a substitute for it.
 */
describe('admin-web proxyBackend session handling', () => {
  const proxy = () => read('apps/admin-web/lib/proxy.ts');

  it('clears the session only on 401', () => {
    const source = proxy();
    // The single combined condition is the defect: `401 || 403` makes an authorization
    // decision indistinguishable from an expired session.
    expect(source).not.toMatch(/status === 401 \|\| status === 403/);
    expect(source).toMatch(/status === 401\b/);
  });

  it('does not clear cookies on a 403', () => {
    const source = proxy();
    const guard = source.slice(source.indexOf('if (status === 401'));
    // `clearSessionCookies` must live inside the 401 branch, not the 403/401 pair.
    const forbiddenBlock = guard.slice(0, guard.indexOf('return NextResponse.json({\n        error: { code: '));
    expect(forbiddenBlock).toContain('clearSessionCookies');
    expect(forbiddenBlock).not.toMatch(/403/);
  });

  it('relays a 403 with the backend status and its own error code', () => {
    const source = proxy();
    // Returning `status: status` rather than 401 is what lets the console render the real
    // reason instead of bouncing the operator to the login screen.
    expect(source).toMatch(/status >= 500 \? 502 : status/);
    expect(source).toContain('PROXY_UNAVAILABLE');
  });
});
