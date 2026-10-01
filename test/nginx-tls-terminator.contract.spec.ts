import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * This spec lives in `test/` rather than beside the template because jest's `roots` are
 * `src`, `test` and `apps/user-mobile/src` — a spec parked in `ops/` compiles fine, passes
 * when run by hand, and is silently absent from the full suite. A guard that never runs is
 * worse than no guard, because it reads as coverage.
 *
 * The production reverse-proxy template is the only thing standing between the public internet
 * and the application, and nothing in CI ever ran nginx over it. Both defects below were found
 * by running `nginx -t` and a real TLS handshake against it, not by reading it.
 *
 * 1. `listen 443 ssl http2;` is deprecated in current nginx. It is not fatal, so `nginx -t`
 *    returns "successful" while warning twice — a template that warns on every reload and
 *    breaks when the directive is removed.
 *
 * 2. The mechanical fix is easy to put in the wrong place. Moving `http2 on;` into the
 *    port-80 redirect block also validates cleanly, serves TLS, and quietly serves **HTTP/1.1**
 *    instead of HTTP/2. Verified here: with the directive in the wrong block the negotiated
 *    protocol was `HTTP/1.1`; in the TLS block it was `HTTP/2`.
 *
 * This is a static guard, deliberately. It pins the source shape that a live `nginx -t` plus
 * ALPN handshake confirmed; running Docker inside Jest would make the suite depend on an image
 * pull, and a gate that cannot run is a gate that is skipped.
 */
const TEMPLATE = join(__dirname, '..', 'ops', 'nginx', 'iot-platform.conf.template');
const text = readFileSync(TEMPLATE, 'utf8');

/** Split the template into `server { ... }` blocks, tracking brace depth. */
function serverBlocks(source: string): string[] {
  const blocks: string[] = [];
  let current: string | null = null;
  let depth = 0;
  for (const line of source.split('\n')) {
    if (/^\s*server\s*\{\s*$/.test(line)) {
      current = line;
      depth = 1;
      continue;
    }
    if (current === null) continue;
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    current += `\n${line}`;
    if (depth === 0) {
      blocks.push(current);
      current = null;
    }
  }
  return blocks;
}

const blocks = serverBlocks(text);
const tlsBlock = blocks.find((b) => /listen\s+(\[::\]:)?443\s+ssl/.test(b));
const plainBlock = blocks.find((b) => /^\s*listen\s+80;|listen\s+80;/.test(b));

describe('ops/nginx/iot-platform.conf.template', () => {
  it('parses into a plain-HTTP block and a TLS block', () => {
    expect(plainBlock).toBeDefined();
    expect(tlsBlock).toBeDefined();
  });

  it('does not use the deprecated `listen ... ssl http2` form', () => {
    // nginx warns on this and removes it; `nginx -t` still reports success, so nothing else
    // in the pipeline would notice.
    expect(text).not.toMatch(/listen\s+(\[::\]:)?443\s+ssl\s+http2/);
  });

  it('enables HTTP/2 inside the TLS server block', () => {
    expect(tlsBlock).toMatch(/^\s*http2\s+on;/m);
  });

  it('does not enable HTTP/2 in the plain-HTTP redirect block', () => {
    // The failure this catches is invisible: the config validates, TLS works, and every
    // response is served over HTTP/1.1.
    expect(plainBlock).not.toMatch(/http2\s+on/);
  });

  it('redirects plain HTTP to HTTPS rather than proxying it', () => {
    expect(plainBlock).toMatch(/return\s+301\s+https:\/\/\$host\$request_uri/);
  });

  it('restricts TLS to TLSv1.2 and TLSv1.3', () => {
    expect(tlsBlock).toMatch(/ssl_protocols\s+TLSv1\.2\s+TLSv1\.3;/);
    expect(tlsBlock).not.toMatch(/ssl_protocols[^;]*TLSv1(\s|;)/);
  });

  it('sets HSTS with a one-year max-age on the TLS block', () => {
    expect(tlsBlock).toMatch(
      /add_header\s+Strict-Transport-Security\s+"max-age=31536000; includeSubDomains"\s+always;/,
    );
  });

  it('keeps /metrics reachable only from loopback', () => {
    // `/metrics` carries tenant operational detail. A missing `deny all` here publishes it.
    const metricsLocation = tlsBlock?.match(/location = \/metrics \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    expect(metricsLocation).not.toBe('');
    expect(metricsLocation).toMatch(/allow\s+127\.0\.0\.1;/);
    expect(metricsLocation).toMatch(/deny\s+all;/);
  });

  it('proxies to a loopback upstream, never to a public interface', () => {
    const upstream = text.match(/upstream\s+iot_platform_api\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(upstream).toMatch(/server\s+127\.0\.0\.1:/);
  });

  it('forwards the scheme so the application can see it is behind TLS', () => {
    expect(text).toMatch(/proxy_set_header\s+X-Forwarded-Proto\s+\$scheme;/);
  });
});
