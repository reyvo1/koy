import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The registration chain is only half-wired, and every existing gate agreed it was fine.
 *
 * `POST /auth/register` creates the user with `isVerified: false` (the Prisma default) and
 * enqueues `body: \`Verification token: ${token}\`` — a bare 64-hex token, with no link and
 * no host in it. `login` then refuses the account outright: `if (!user || !user.credential
 * || !user.isVerified) throw ... 'Invalid credentials or unverified'`.
 *
 * So the chain a real person has to walk is
 *
 *   register -> receive a bare token in an email -> put that token somewhere -> log in
 *
 * and the middle step had nowhere to go. The four auth endpoints got a UI in commit
 * 993f957, but `/verifikasi` did not exist: `GET /verifikasi`, `/verify-email` and
 * `/konfirmasi-email` all answered 404, and the only page even mentioning the flow said
 * "periksa email Anda untuk verifikasi" — which is a dead end, because the email carries
 * a token and the console carried no field to paste it into.
 *
 * The `rescue:auth:flow` runner is why this survived: it writes the verification token
 * straight to the database (`prisma.user.update({ data: { verificationTokenHash,
 * verificationTokenLookup } })`) instead of redeeming the token `register` actually
 * issued. It therefore exercises the proxy and the login, and steps over the exact hop
 * that is missing. A green flow proves the endpoints; it does not prove the person can
 * finish.
 *
 * This spec pins the missing hop. It is deliberately a source-level contract, because the
 * thing being asserted is that a page exists and is linked — a runtime probe can only
 * discover its absence by hitting 404 on every candidate path.
 */
describe('self-service email verification is reachable by the person who registered', () => {
  const root = resolve(__dirname, '..');
  const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

  const verifyPagePath = 'apps/admin-web/app/verifikasi/page.tsx';
  const registerPage = read('apps/admin-web/app/daftar/page.tsx');
  const loginPage = read('apps/admin-web/app/login/page.tsx');
  const authService = read('src/auth/auth.service.ts');
  const notificationService = read('src/notification/notification.service.ts');
  const flowRunner = read('scripts/run-rescue-auth-selfservice-flow.mjs');

  it('ships a page that can accept the verification token', () => {
    expect(existsSync(resolve(root, verifyPagePath))).toBe(true);
  });

  it('the registration gate is real, so the token is not optional', () => {
    // If either of these ever changes, the missing page stops being a defect and this
    // spec should be revisited rather than silently passing. `register` leaves
    // `isVerified` at the Prisma default and `login` refuses anything unverified.
    expect(authService).toContain('!user.isVerified');
    expect(authService).toMatch(/isVerified:\s*true/); // only verifyEmail sets it
    // The schema default is what makes a fresh registration unverified.
    expect(read('prisma/schema.prisma')).toMatch(/isVerified\s+Boolean\s+@default\(false\)/);
  });

  it('the emailed token is bare, so the console has to offer a field for it', () => {
    // A link would make the page optional; a bare token does not. This assertion exists so
    // that changing the email to carry a link is a deliberate, visible change.
    expect(notificationService).toContain('Verification token: ${token}');
    expect(notificationService).not.toMatch(/Verification token:.*https?:\/\//);
  });

  it('the verification page posts the token to the existing proxy', () => {
    const page = read(verifyPagePath);
    expect(page).toContain("fetch('/api/auth/verify-email'");
    expect(page).toContain('name="token"');
    // Verification is not signing in. A session cookie here would let an anonymous
    // request mint a session, and the proxy contract already forbids it — the page must
    // not paper over that by establishing one on the success path.
    expect(page).not.toContain('setSessionCookies');
  });

  it('accepts a token handed over in the URL, the way a mailed link would', () => {
    const page = read(verifyPagePath);
    expect(page).toContain("get('token')");
  });

  it('is linked from both entry points a new user actually visits', () => {
    // The register success message is the exact moment the user is told to go verify, so
    // that is where the destination has to be reachable from.
    expect(registerPage).toContain('href="/verifikasi"');
    // And from login, for the user who registered earlier and is now trying to get in.
    expect(loginPage).toContain('href="/verifikasi"');
  });

  it('does not claim the flow is proven end to end while the runner skips the token hop', () => {
    // The runner mints its own token into the database. That is legitimate for testing the
    // proxy and the login, but it means `rescue:auth:flow` cannot fail on this defect. The
    // reason has to stay written down, or the next reader treats that green as coverage.
    expect(flowRunner).toContain('verificationTokenLookup');
    expect(flowRunner).toMatch(/Verification token|issued by register|redeem/);
  });
});

/**
 * Every self-service auth page reported success as failure.
 *
 * Each of these handlers reads `event.currentTarget` twice: once for the FormData, and
 * again after `await fetch(...)` to clear the form. React nulls `currentTarget` once the
 * handler yields, so the second read is `null` and `.reset()` throws. The throw lands in
 * the surrounding `catch`, which renders it as the error branch — after the request had
 * already succeeded.
 *
 * Observed live on `/daftar`: the POST returned 201 and the user row and its verification
 * notification were both created, while the page displayed
 * `Cannot read properties of null (reading 'reset')`. The operator is told registration
 * failed, retries, and is then told the account already exists — the flow looks broken in
 * a way that sends support hunting a backend fault that does not exist.
 *
 * The fix is to capture the form element before awaiting, so the reference is stable.
 */
describe('self-service auth pages do not null-deref after a successful request', () => {
  const root = resolve(__dirname, '..');
  const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

  const affected = [
    'apps/admin-web/app/daftar/page.tsx',
    'apps/admin-web/app/lupa-password/page.tsx',
    'apps/admin-web/app/reset-password/page.tsx',
  ];

  for (const path of affected) {
    it(`${path} holds the form element across the await`, () => {
      const source = read(path);
      // The handler must capture the element into a local before any `await`, and use that
      // local afterwards. Reading `event.currentTarget` after the await is the defect.
      expect(source).toMatch(/const\s+formEl\w*\s*=\s*event\.currentTarget/);
      expect(source).not.toMatch(/event\.currentTarget\.reset\(\)/);
      // The captured element is the one that gets cleared, and the FormData still comes
      // from the live form rather than from a detached reference.
      expect(source).toMatch(/formEl\w*\.reset\(\)/);
      expect(source).toMatch(/new FormData\(/);
    });
  }

  it('the new verification page does not repeat the pattern', () => {
    // It has no form to clear, which is why it is not in the list above; assert that
    // explicitly so a future "just reset the form too" edit is caught here.
    expect(read('apps/admin-web/app/verifikasi/page.tsx')).not.toContain('currentTarget.reset');
  });
});

/**
 * A self-registered account had no membership at all, so it could never be promoted.
 *
 * `AuthService.register` created the `User` and its `UserCredential` and stopped there.
 * `login` resolves the role from membership — `role: membership?.role ?? 'MEMBER'` — so a
 * registrant was permanently `MEMBER`, and the admin-web login proxy refuses anything that
 * is not `ADMIN` or `PLATFORM_ADMIN` with `403 Akun ini tidak memiliki akses ke konsol
 * administrator`. Observed live: register 201, verify 200, login 403.
 *
 * The missing row was not only an access problem. `TenantContextGuard` resolves the caller's
 * membership and rejects anything that is not `ACTIVE`, and the user-management path
 * (`PATCH /admin/tenant-users/:userId`) updates an existing membership. With no membership
 * to update, an administrator had nothing to promote: the account was stranded rather than
 * merely unprivileged.
 *
 * The fix creates the membership in the registration transaction, and deliberately does NOT
 * grant console access:
 *
 *  - role `MEMBER` — the console admits only ADMIN/PLATFORM_ADMIN.
 *  - status `PENDING` — `TenantContextGuard` requires ACTIVE.
 *
 * Promotion stays an administrator's decision through the ordinary user-management path.
 * Minting ADMIN at registration would let anyone who knows a tenant UUID — the register form
 * asks only for that — escalate themselves to tenant administrator, so that is refused here
 * rather than "fixed" for convenience.
 */
describe('a self-registered account is a real account an administrator can promote', () => {
  const root = resolve(__dirname, '..');
  const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

  const authService = read('src/auth/auth.service.ts');
  const loginProxy = read('apps/admin-web/app/api/session/login/route.ts');
  const tenantContextGuard = read('src/users/guards/tenant-context.guard.ts');
  const provisioningService = read('src/admin-operations/admin-user-provisioning.service.ts');

  it('registration creates the membership the tenant-scoped guards resolve', () => {
    // Without this row the account cannot be promoted at all: user management updates an
    // existing membership, and TenantContextGuard has nothing to look up.
    expect(authService).toMatch(
      /memberships:\s*\{\s*create:\s*\{[\s\S]{0,200}?tenantId:\s*dto\.tenantId/,
    );
    expect(tenantContextGuard).toContain("membership.status !== 'ACTIVE'");
    expect(provisioningService).toContain('requireMembership');
  });

  it('does not let registration grant console access on its own', () => {
    // The console admits exactly these two roles; registration must not hand out either.
    expect(loginProxy).toContain("role !== 'ADMIN' && role !== 'PLATFORM_ADMIN'");
    const created = /memberships:\s*\{\s*create:\s*\{([\s\S]{0,300}?)\}\s*,?\s*\}/.exec(authService);
    const body = created?.[1] ?? '';
    expect(body).toMatch(/role:\s*'MEMBER'/);
    expect(body).not.toMatch(/role:\s*'(ADMIN|PLATFORM_ADMIN)'/);
    // And it is not usable until an administrator activates it.
    expect(body).toMatch(/status:\s*'PENDING'/);
  });

  it('leaves promotion to the administrator path rather than the registration form', () => {
    // The role/status an admin applies is the one that actually admits the account, so the
    // registration values must not be the same thing.
    expect(provisioningService).toMatch(
      /patch:\s*\{[^}]*role\?:\s*'MEMBER'\s*\|\s*'ADMIN'[^}]*status\?:\s*'ACTIVE'\s*\|\s*'REVOKED'/,
    );
  });
});
