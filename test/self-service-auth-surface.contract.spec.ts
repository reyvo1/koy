import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string): string =>
  readFileSync(resolve(root, path), 'utf8');

/**
 * The audit found four working auth endpoints with no UI and no proxy at all:
 * `/auth/register`, `/auth/verify-email`, `/auth/forgot-password` and
 * `/auth/reset-password`. The only way to onboard a user before this was an administrator
 * resetting a password by hand.
 *
 * This is a source-level contract for that surface. It cannot replace the live runner
 * (`scripts/run-rescue-auth-selfservice-flow.mjs`, `npm run rescue:auth:flow`), which
 * drives the real chain against a running stack. What it does do is lock the properties
 * that must not silently regress, none of which a happy-path test would catch:
 *
 *  - none of the four proxies may set a session cookie. Registering, verifying and
 *    resetting a password are not signing in, and a request that quietly established a
 *    session would be a real authentication defect.
 *  - forgot-password must answer identically for a known and an unknown account, and must
 *    not distinguish an unresolvable tenant. If it ever does, it becomes an account
 *    enumeration oracle.
 *  - the reset path must not leak why a token was rejected.
 */
describe('self-service auth surface contract', () => {
  const authProxies = {
    register: read('apps/admin-web/app/api/auth/register/route.ts'),
    verifyEmail: read('apps/admin-web/app/api/auth/verify-email/route.ts'),
    forgotPassword: read('apps/admin-web/app/api/auth/forgot-password/route.ts'),
    resetPassword: read('apps/admin-web/app/api/auth/reset-password/route.ts'),
  };

  const pages = {
    register: read('apps/admin-web/app/daftar/page.tsx'),
    forgotPassword: read('apps/admin-web/app/lupa-password/page.tsx'),
    resetPassword: read('apps/admin-web/app/reset-password/page.tsx'),
    login: read('apps/admin-web/app/login/page.tsx'),
  };

  const controller = read('src/auth/auth.controller.ts');
  const loginProxy = read('apps/admin-web/app/api/session/login/route.ts');

  it('wires a proxy for every self-service auth endpoint the backend exposes', () => {
    for (const route of ['register', 'verify-email', 'forgot-password', 'reset-password']) {
      expect(controller).toContain(`'${route}'`);
      expect(
        existsSync(resolve(root, `apps/admin-web/app/api/auth/${route}/route.ts`)),
      ).toBe(true);
    }
  });

  it('never establishes a session from a self-service auth proxy', () => {
    // Registering, verifying and resetting are not signing in. A session cookie set here
    // would let an unauthenticated request mint a valid session.
    for (const [name, source] of Object.entries(authProxies)) {
      expect({ [name]: source }).toEqual({
        [name]: expect.not.stringContaining('setSessionCookies'),
      });
      expect({ [name]: source }).toEqual({
        [name]: expect.not.stringContaining('setRoleCookie'),
      });
    }
    // The login proxy, by contrast, must still establish a real session.
    expect(loginProxy).toContain('setSessionCookies');
  });

  it('answers forgot-password identically whether or not the account exists', () => {
    const proxy = authProxies.forgotPassword;
    // One shared constant, returned on every path, so the two branches cannot drift.
    expect(proxy).toContain('GENERIC_ACCEPTED');
    expect(proxy).toMatch(/status:\s*202/);
    // An unresolvable tenant must take the same path as a resolvable one. Returning 400
    // for an unknown tenant would disclose which tenants are provisioned.
    expect(proxy).toMatch(
      /if \(!resolvedTenantId\)[\s\S]{0,400}status:\s*202/,
    );
    // The backend's own answer, which does distinguish, must be discarded rather than
    // forwarded to the anonymous caller.
    expect(proxy).not.toContain('await backendResponse.json()');
  });

  it('does not leak why a reset token was rejected', () => {
    const proxy = authProxies.resetPassword;
    expect(proxy).toContain('OPAQUE_FAILURE');
    // Every rejection path returns the same constant.
    const failureReturns = proxy.match(/OPAQUE_FAILURE/g) ?? [];
    expect(failureReturns.length).toBeGreaterThanOrEqual(3);
  });

  it('offers the new flows from the login page', () => {
    expect(pages.login).toContain('href="/daftar"');
    expect(pages.login).toContain('href="/lupa-password"');
  });

  it('does not tell the user that a reset email was sent', () => {
    // Delivery depends on the notification runtime, which is off by default, and the
    // response cannot distinguish a real account. The copy must stay conditional.
    expect(pages.forgotPassword).toContain('Jika ada akun yang cocok');
    expect(pages.forgotPassword).not.toMatch(/email (telah |sudah )?(dikirim|dikirimkan)/i);
  });

  it('keeps the auth shell out of the page module', () => {
    // The App Router only permits `default` and framework exports from `page.tsx`, so the
    // shared shell has to live in a component file.
    const exportedNames = [...pages.register.matchAll(/^export\s+(?:async\s+)?(\w+)/gm)].map(
      (match) => match[1],
    );
    expect(exportedNames).toEqual(['default']);
    expect(existsSync(resolve(root, 'apps/admin-web/components/auth-shell.tsx'))).toBe(true);
  });
});
