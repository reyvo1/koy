#!/usr/bin/env node
/**
 * Wave 4 — prove the production TLS terminator with a real nginx, not with a reading of it.
 *
 * `ops/nginx/iot-platform.conf.template` is the only thing between the public internet and the
 * application, and nothing in CI ever ran nginx over it. Running it found two defects that a
 * source reading did not:
 *
 *   1. `listen 443 ssl http2;` is deprecated in current nginx. `nginx -t` still reports
 *      "test is successful" while warning twice, so a template can be on its way to a
 *      hard failure and no gate in the pipeline notices.
 *   2. The mechanical fix for (1) is easy to misplace. Putting `http2 on;` in the port-80
 *      redirect block also validates cleanly, completes a TLS handshake, and then serves
 *      **HTTP/1.1**. Verified: wrong block negotiated `HTTP/1.1`, right block negotiated
 *      `HTTP/2` over the same certificate.
 *
 * The static spec `test/nginx-tls-terminator.contract.spec.ts` pins the source shape. This
 * probe is the runtime half: it starts nginx on the committed template, checks the config, and
 * then exercises the listener.
 *
 * Only the two substitutions `docs/deployment-recovery.md` tells the operator to make are made
 * here — the example TLS certificate path and the upstream address. Everything else is the
 * committed template verbatim, so a green run describes the file in the repository.
 *
 * Requirements: docker, openssl, curl. Leaves no containers behind.
 */
import { execFileSync, execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = '/home/ivo/Desktop/program/iot';
const TEMPLATE = join(ROOT, 'ops', 'nginx', 'iot-platform.conf.template');
const CONTAINER = 'iot-tls-nginx-verify';
const HTTPS_PORT = 8443;
const HTTP_PORT = 8080;
const HOST_NAME = 'api.example.com';

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  —  ${detail}`);
};

const sh = (cmd, args, opts = {}) => run(cmd, args, { encoding: 'utf8', ...opts });

async function curl(args) {
  try {
    const { stdout } = await sh('curl', args);
    return { code: 0, out: stdout };
  } catch (error) {
    return { code: error.code ?? 1, out: error.stdout ?? '', err: error.stderr ?? '' };
  }
}

const work = mkdtempSync(join(tmpdir(), 'iot-tls-verify-'));
mkdirSync(join(work, 'certs'));
mkdirSync(join(work, 'conf.d'));

try {
  // A throwaway self-signed certificate. This probe proves the terminator's configuration and
  // behaviour; it makes no claim about certificate issuance, which is the operator's job.
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', join(work, 'certs', 'privkey.pem'),
    '-out', join(work, 'certs', 'fullchain.pem'),
    '-days', '2', '-subj', `/CN=${HOST_NAME}`,
  ], { stdio: 'ignore' });
  record('a throwaway certificate was generated', true, 'openssl req -x509, 2 days');

  const template = readFileSync(TEMPLATE, 'utf8')
    .replace(/\/etc\/letsencrypt\/live\/[^/]+\//g, '/etc/nginx/certs/')
    .replace(/server\s+127\.0\.0\.1:\d+;/, 'server 127.0.0.1:80;');
  writeFileSync(join(work, 'conf.d', 'iot-platform.conf'), template);
  record('only the documented substitutions were made', true, 'TLS path + upstream address');

  await sh('docker', ['rm', '-f', CONTAINER]).catch(() => {});
  await sh('docker', [
    'run', '-d', '--name', CONTAINER,
    '-p', `${HTTPS_PORT}:443`, '-p', `${HTTP_PORT}:80`,
    '-v', `${join(work, 'conf.d')}:/etc/nginx/conf.d:ro`,
    '-v', `${join(work, 'certs')}:/etc/nginx/certs:ro`,
    'nginx:alpine',
  ]);
  await new Promise((r) => setTimeout(r, 3000));

  // 1. The config must be accepted, and must not warn. A deprecation warning here is a
  //    template that breaks when the directive is removed, with nothing failing today.
  let test = '';
  try {
    test = (await sh('docker', ['exec', CONTAINER, 'nginx', '-t'])).stdout + '';
    test += (await sh('docker', ['exec', CONTAINER, 'nginx', '-t'])).stderr;
  } catch (error) {
    test = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  record('nginx accepts the committed template', /test is successful/.test(test),
    /test is successful/.test(test) ? 'test is successful' : test.trim().split('\n').slice(-1)[0]);
  const warnings = (test.match(/\[warn\]/g) ?? []).length;
  record('nginx emits no deprecation warning', warnings === 0, `${warnings} warning(s)`);

  // Everything below talks to the listener, so a terminator that never came up has to be
  // reported as one failure with its cause. Probing anyway produced six `000` rows that all
  // looked like separate defects and none of which named the reason.
  const containerUp = await sh('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER])
    .then((r) => r.stdout.trim() === 'true')
    .catch(() => false);
  if (!containerUp) {
    const logs = await sh('docker', ['logs', '--tail', '3', CONTAINER]).catch((e) => ({ stdout: e.stdout ?? '', stderr: e.stderr ?? '' }));
    const cause = `${logs.stdout ?? ''}${logs.stderr ?? ''}`.trim().split('\n').pop() ?? 'container is not running';
    record('nginx is running and listening', false, cause);
    console.log('\nskipped: the remaining checks need a live listener');
  } else {
    record('nginx is running and listening', true, 'container up');

  const resolve = [`--resolve`, `${HOST_NAME}:${HTTPS_PORT}:127.0.0.1`];
  const https = (path) => ['-sk', '-o', '/dev/null', '-w', '%{http_code}', ...resolve, `https://${HOST_NAME}:${HTTPS_PORT}${path}`];

  // 2. HTTP/2 must actually be negotiated. A config that validates while serving HTTP/1.1 is
  //    the defect this probe exists to catch.
  const negotiated = await curl(['-sk', '--http2', '-o', '/dev/null', '-w', '%{http_version}', ...resolve, `https://${HOST_NAME}:${HTTPS_PORT}/health`]);
  record('HTTP/2 is negotiated over TLS', negotiated.out.trim() === '2',
    `ALPN gave HTTP/${negotiated.out.trim() || '?'}`);

  // 3. The proxy must actually forward. The upstream here is nginx's own port 80, whose answer
  //    is a 301, so a 301 proves the round trip rather than nginx answering from its own block.
  const proxied = await curl(https('/health'));
  record('the request is proxied to the upstream', proxied.out.trim() === '301',
    `upstream answered ${proxied.out.trim()}`);

  // 4. Plain HTTP must redirect, never be proxied in the clear.
  const plain = await curl(['-s', '-o', '/dev/null', '-w', '%{http_code}', '--resolve', `${HOST_NAME}:${HTTP_PORT}:127.0.0.1`, `http://${HOST_NAME}:${HTTP_PORT}/health`]);
  record('plain HTTP redirects to HTTPS', plain.out.trim() === '301', `status ${plain.out.trim()}`);

  // 5. /metrics carries tenant operational detail and must not be public.
  const metrics = await curl(https('/metrics'));
  record('/metrics is refused off loopback', metrics.out.trim() === '403',
    `status ${metrics.out.trim()}`);

  // 6. HSTS must actually reach the client, not merely appear in the file.
  const headers = await curl(['-skI', ...resolve, `https://${HOST_NAME}:${HTTPS_PORT}/health`]);
  record('HSTS reaches the client', /strict-transport-security: max-age=31536000/i.test(headers.out),
    /strict-transport-security: max-age=31536000/i.test(headers.out) ? 'max-age=31536000' : 'absent');

  // 7. TLS 1.3 must be negotiable, and 1.0/1.1 must not be offered.
  const sClient = (args) => {
    try {
      return execFileSync('openssl', ['s_client', '-connect', `127.0.0.1:${HTTPS_PORT}`, '-servername', HOST_NAME, ...args],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 });
    } catch (error) {
      return `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
  };
  const modern = sClient(['-tls1_3']);
  record('TLS 1.3 is negotiable', /Protocol\s*:\s*TLSv1\.3/.test(modern),
    /Protocol\s*:\s*(\S+)/.exec(modern)?.[1] ?? 'unknown');
  const legacy = sClient(['-tls1']);
  record('TLS 1.0 is refused', !/Protocol\s*:\s*TLSv1(\s|$)/.test(legacy) && !/Cipher\s*:\s*0000/.test(legacy),
    /Cipher\s*:\s*(\S+)/.exec(legacy)?.[1] ?? 'no cipher offered');
  }
} finally {
  await sh('docker', ['rm', '-f', CONTAINER]).catch(() => {});
  rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exitCode = failed.length === 0 ? 0 : 1;
