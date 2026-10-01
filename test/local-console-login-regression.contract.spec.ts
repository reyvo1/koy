import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the local console login path.
 *
 * Three real defects made the seeded demo accounts unusable from a browser, and each one is
 * invisible to the existing suites because none of them render a page in a real browser:
 *
 * 1. Next 16 blocks its own dev resources for an unrecognised origin, so opening the console
 *    on the loopback IP served markup that never hydrated. An un-hydrated credential form
 *    falls back to a native submit, which puts the password in the URL, the history entry
 *    and the server log. `allowedDevOrigins` is the fix; the form guards are the second layer
 *    so the leak cannot happen even if the bundle is blocked for some other reason.
 * 2. `IOT_API_BASE_URL` defaulted to port 3000 while the API actually listens on the port in
 *    the repository .env, so every server-side proxy call failed with "API unreachable".
 * 3. `CountUp` guarded its animation with a ref that survived StrictMode's effect re-run, so
 *    the statistic counters stayed frozen at their initial value and the dashboard reported
 *    "Perangkat 0" for a tenant that really had one device.
 */

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

const CREDENTIAL_PAGES = [
  'apps/admin-web/app/login/page.tsx',
  'apps/admin-web/app/daftar/page.tsx',
  'apps/admin-web/app/reset-password/page.tsx',
  'apps/admin-web/app/lupa-password/page.tsx',
];

describe('Local console login path regression guard', () => {
  describe('dev origin', () => {
    it.each(['apps/admin-web/next.config.mjs', 'apps/user-web/next.config.mjs'])(
      '%s allows the loopback origins used by local scripts and docs',
      (configPath) => {
        const config = read(configPath);
        expect(config).toContain('allowedDevOrigins');
        expect(config).toContain("'127.0.0.1'");
        expect(config).toContain("'localhost'");
      },
    );
  });

  describe('credential forms cannot leak a secret into the URL', () => {
    it.each(CREDENTIAL_PAGES)('%s posts instead of falling back to GET', (page) => {
      expect(read(page)).toMatch(/<form[^>]*method="post"/);
    });

    it.each(CREDENTIAL_PAGES)('%s stays inert until React has hydrated', (page) => {
      const source = read(page);
      expect(source).toContain('hydrated');
      expect(source).toMatch(/disabled=\{[^}]*!hydrated/);
    });
  });

  describe('backend base URL', () => {
    it.each([
      'apps/admin-web/.env.example',
      'apps/user-web/.env.example',
    ])('%s points at the API port the repository configures', (envPath) => {
      const env = read(envPath);

      // The tracked `.env.example` is the canonical statement of the port, because `.env` itself is
      // gitignored and therefore does not exist on a CI checkout. Reading `.env` unconditionally made
      // this suite throw ENOENT in CI: 10 suites failed to load and 175 tests never ran, which the
      // green local runs hid perfectly.
      const port = /^PORT=(\d+)$/m.exec(read('.env.example'))?.[1];
      expect(port).toBeTruthy();
      expect(env).toContain(`IOT_API_BASE_URL=http://127.0.0.1:${port}`);

      // When a local `.env` does exist it must agree with the tracked one, so the example files cannot
      // drift away from a running local stack. Not a replacement for the assertion above: that one
      // runs everywhere, this one only has something to check on a developer machine.
      if (existsSync(resolve(root, '.env'))) {
        const localPort = /^PORT=(\d+)$/m.exec(read('.env'))?.[1];
        expect(localPort).toBe(port);
      }
    });
  });

  describe('statistic counters', () => {
    const polish = read('apps/admin-web/components/ui-polish.tsx');

    it('animates on every value change instead of latching a one-shot guard', () => {
      expect(polish).toContain('setDisplay(value)');
      // The StrictMode-unsafe latch: a ref set on the first effect run that suppresses every
      // later run, leaving the counter permanently at its initial value.
      expect(polish).not.toMatch(/startedRef/);
    });
  });
});
