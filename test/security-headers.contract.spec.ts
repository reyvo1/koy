import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

/**
 * Evaluates the real exported config in a child process under a chosen NODE_ENV and returns
 * the `script-src` directive it would actually send. Asserted against the module rather than
 * against its source text: a source grep cannot tell a working conditional from a comment
 * that merely mentions one, and it cannot tell development policy from production policy at
 * all — which is the distinction this whole block exists to protect.
 */
const scriptSrcFor = (app: string, nodeEnv: 'development' | 'production'): string => {
  const configUrl = `file://${resolve(root, `apps/${app}/next.config.mjs`)}`;
  const stdout = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const { default: c } = await import(${JSON.stringify(configUrl)});
       const routes = await c.headers();
       const csp = routes.flatMap((r) => r.headers).find((h) => h.key === 'Content-Security-Policy');
       const m = /script-src ([^;]*)/.exec(csp?.value ?? '');
       process.stdout.write(m ? m[1] : '');`,
    ],
    { env: { ...process.env, NODE_ENV: nodeEnv }, encoding: 'utf8' },
  );
  return stdout.trim();
};

/**
 * The repository shipped with no clickjacking, sniffing, referrer, permissions or CSP
 * protection anywhere: the Fastify adapter set body limits and timeouts but no headers,
 * the nginx template terminated TLS without adding any, and neither Next app declared a
 * `headers()` block. These assertions exist so that state cannot return silently — the
 * failure mode of a missing security header is invisible until someone exploits it.
 *
 * HSTS is asserted only on the nginx template, which is TLS-only. Declaring it in a Next
 * app would also apply it to the plain-http dev origin and pin the browser to a scheme
 * that does not exist there.
 */
describe('security response headers', () => {
  const webApps = ['admin-web', 'user-web'] as const;

  for (const app of webApps) {
    it(`${app} sets clickjacking, sniffing, referrer, permissions and CSP headers`, () => {
      const config = read(`apps/${app}/next.config.mjs`);

      expect(config).toContain('async headers()');
      expect(config).toContain("key: 'X-Content-Type-Options', value: 'nosniff'");
      expect(config).toContain("key: 'X-Frame-Options', value: 'DENY'");
      expect(config).toContain(
        "key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'",
      );
      expect(config).toContain("key: 'Permissions-Policy'");
      expect(config).toContain("key: 'Content-Security-Policy'");
    });

    it(`${app} does not declare HSTS (TLS termination owns it)`, () => {
      expect(read(`apps/${app}/next.config.mjs`)).not.toContain(
        'Strict-Transport-Security',
      );
    });

    it(`${app} CSP denies framing, objects and third-party connections`, () => {
      const config = read(`apps/${app}/next.config.mjs`);

      expect(config).toContain("frame-ancestors 'none'");
      expect(config).toContain("object-src 'none'");
      expect(config).toContain("base-uri 'self'");
      expect(config).toContain("form-action 'self'");
      // `script-src`/`style-src` are required for the policy to be meaningful; what must
      // not appear is a third-party or wildcard origin in either.
      expect(config).toContain("script-src 'self' 'unsafe-inline'");
      expect(config).not.toContain("script-src 'self' 'unsafe-inline' https:");
      expect(config).not.toContain('script-src *');
      expect(config).not.toContain('style-src *');
    });
  }

  /**
   * React's development build calls `eval()` to reconstruct call stacks across the
   * server/browser boundary. Under a `script-src` without `'unsafe-eval'` the browser
   * refuses it and the console fills with:
   *
   *   eval() is not supported in this environment ... React will never use eval() in production mode
   *
   * The same policy has to stay strict in production, where React genuinely never uses
   * eval() and `'unsafe-eval'` would be pure attack surface. So the directive is asserted
   * per environment, against the module that ships, not against its text.
   */
  describe('eval() is permitted only where React actually needs it', () => {
    for (const app of webApps) {
      it(`${app} allows unsafe-eval on the development origin`, () => {
        expect(scriptSrcFor(app, 'development')).toContain("'unsafe-eval'");
      });

      it(`${app} withholds unsafe-eval from the production origin`, () => {
        const scriptSrc = scriptSrcFor(app, 'production');

        expect(scriptSrc).toBe("'self' 'unsafe-inline'");
        expect(scriptSrc).not.toContain("'unsafe-eval'");
      });

      it(`${app} still refuses third-party and wildcard script sources in dev`, () => {
        // The escape hatch is for eval() only. Widening it to a remote origin or a
        // wildcard would let any host inject code into a dev page, which is the failure
        // mode `script-src 'self'` exists to prevent.
        const scriptSrc = scriptSrcFor(app, 'development');

        expect(scriptSrc).not.toContain('https:');
        expect(scriptSrc).not.toContain('http:');
        expect(scriptSrc).not.toContain('*');
        expect(scriptSrc).toContain("'self'");
      });
    }
  });

  it('nginx terminates TLS with HSTS and the matching hardening headers', () => {
    const template = read('ops/nginx/iot-platform.conf.template');

    expect(template).toContain(
      'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
    );
    expect(template).toContain('add_header X-Content-Type-Options "nosniff" always;');
    expect(template).toContain('add_header X-Frame-Options "DENY" always;');
    expect(template).toContain('add_header Referrer-Policy');
    expect(template).toContain('add_header Permissions-Policy');
  });

  it('the API itself relies on the edge for headers and keeps its own body limits', () => {
    // Guards against "fix" being a header block on the app while the API, which the
    // mobile client also talks to directly, stays unprotected behind the edge.
    const adapter = read('src/bootstrap/production-fastify-adapter.ts');

    expect(adapter).toContain('PRODUCTION_HTTP_BODY_LIMIT_BYTES');
    expect(adapter).toContain('PRODUCTION_HTTP_REQUEST_TIMEOUT_MS');
    expect(adapter).toContain('PRODUCTION_TRUSTED_PROXIES');
  });
});
