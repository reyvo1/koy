import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The self-service auth runner was green while the flow it claims to prove was broken.
 *
 * `npm run rescue:auth:flow` reported 16/16 PASS against a stack where registration could
 * not be completed at all: `register` mailed a bare token, no page accepted it
 * (`/verifikasi`, `/verify-email`, `/konfirmasikan-email` all 404), and a verified account
 * still could not reach the console. Two independent reasons it could not see any of that:
 *
 * 1. It minted its own verification token.
 *    `prisma.user.update({ data: { verificationTokenHash, verificationTokenLookup } })`
 *    overwrote the fields `register` had just written, using a token the runner invented.
 *    The redemption that followed therefore proved the proxy and `verifyEmail` work — never
 *    that the token a real user receives is redeemable. The hop that was missing sat exactly
 *    between those two facts.
 *
 * 2. It asserted nothing about the token's delivery, and never asked whether a page exists to
 *    receive it. A runtime runner can catch a missing page; a source-grep contract cannot be
 *    the only thing standing between "the flow works" and "the flow works".
 *
 * It also leaked. The `finally` cleanup was `prisma.user.deleteMany(...).catch(() => null)`,
 * and `user_credentials` has no cascade, so the delete raised a foreign-key violation that
 * the `.catch` swallowed. Measured after one run: 1 user, 1 credential, 2 notifications and
 * 1 tenant left behind, with the runner reporting PASS. Every run grew the database, and the
 * one check meant to keep fixtures isolated was the check that never ran.
 */
describe('self-service auth runner proves the flow a real user walks', () => {
  const root = resolve(__dirname, '..');
  const runner = readFileSync(
    resolve(root, 'scripts/run-rescue-auth-selfservice-flow.mjs'),
    'utf8',
  );

  describe('redeems the token register actually issued', () => {
    it('does not overwrite the verification token the registration produced', () => {
      // Writing either column here means the runner swapped in a token of its own making.
      // `register` is the only thing allowed to set these.
      expect(runner).not.toMatch(/verificationTokenHash\s*:/);
      expect(runner).not.toMatch(/verificationTokenLookup\s*:/);
    });

    it('reads the token out of the delivered notification instead', () => {
      // The notification body is byte-for-byte what the relay mails, so reading the row is
      // reading the user's inbox rather than bypassing the flow.
      expect(runner).toContain('prisma.notification');
      expect(runner).toMatch(/destination:\s*email/);
      // And it must fail loudly when nothing was delivered, rather than quietly skipping the
      // hop it exists to prove.
      expect(runner).toMatch(/assert\([^)]*notification/i);
    });

    it('asks whether a page exists to accept the token', () => {
      // This is the check that would have caught the missing `/verifikasi`. It is a runtime
      // HTTP probe, so it fails when the route is gone — the thing a source contract can only
      // assert indirectly.
      expect(runner).toContain('/verifikasi');
    });
  });

  describe('cleans up after itself, or says it did not', () => {
    it('removes the dependent rows before the user row', () => {
      // `user_credentials` has no cascade, so deleting the user first always fails.
      const credential = runner.indexOf('userCredential.deleteMany');
      const membership = runner.indexOf('membership.deleteMany');
      const user = runner.indexOf('prisma.user.deleteMany');
      expect(credential).toBeGreaterThan(-1);
      expect(membership).toBeGreaterThan(-1);
      expect(user).toBeGreaterThan(-1);
      expect(credential).toBeLessThan(user);
      expect(membership).toBeLessThan(user);
    });

    it('does not swallow a failed cleanup', () => {
      // The exact defect: `.catch(() => null)` turned a foreign-key violation into silence,
      // and the run reported PASS with five rows still in the database.
      const finallyBlock = runner.slice(runner.lastIndexOf('} finally {'));
      expect(finallyBlock).toContain('prisma.user.deleteMany');
      expect(finallyBlock).not.toMatch(
        /prisma\.user\.deleteMany\([^)]*\)\s*\.catch\(/,
      );
      // A leak must surface as a failure, not as a comment in the header.
      expect(finallyBlock).toMatch(/failed\s*\+?=|assert\(/);
    });

    it('removes the tenant fixture too', () => {
      const finallyBlock = runner.slice(runner.lastIndexOf('} finally {'));
      expect(finallyBlock).toContain('prisma.tenant.deleteMany');
    });

    it('does not filter a deleteMany on a compound unique', () => {
      // `email_tenantId` is accepted by `findUnique`/`update`/`delete` and rejected by
      // `deleteMany`/`count` with an invocation error. Paired with `.catch(() => null)` that
      // produced a run that reported PASS and left its whole fixture behind, every time.
      // Found by running the runner, not by reading it: the FK story was a dead end, because
      // the dependent rows were already gone and the delete still failed.
      const finallyBlock = runner.slice(runner.lastIndexOf('} finally {'));
      expect(finallyBlock).not.toMatch(
        /deleteMany\(\s*\{\s*where:\s*\{\s*email_tenantId:/,
      );
      expect(finallyBlock).not.toMatch(/count\(\s*\{\s*where:\s*\{\s*email_tenantId:/);
      // The scalar pair is the form Prisma actually accepts for a bulk filter.
      expect(finallyBlock).toMatch(/const fixture = \{ email, tenantId \}/);
    });
  });
});
