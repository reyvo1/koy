#!/usr/bin/env node
/**
 * Headless sweep of every admin-web route, measured in a real browser.
 *
 * Why this exists: the repository's own gates are source-text assertions. They cannot see
 * a page that renders an empty shell, a control that is drawn but never wired, a client
 * error, or a horizontal overflow. This walks the actual routes in Chrome, waits for the
 * data to settle, and reports what an operator would really see.
 *
 * Usage: node scripts/audit-ui-sweep.mjs [--role tenant|super] [--out <file>]
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROLE = process.argv.includes('--role')
  ? process.argv[process.argv.indexOf('--role') + 1]
  : 'tenant';
const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : `reports/ui-sweep-${ROLE}.json`;
const BASE = process.env.SWEEP_BASE ?? 'http://127.0.0.1:5001';
const PORT = 9222 + Math.floor(Math.random() * 300);

const CREDENTIALS = {
  tenant: {
    tenantId: '22222222-2222-4222-8222-222222222222',
    email: 'demo.admin@iot.local',
  },
  super: {
    tenantId: '11111111-1111-4111-8111-111111111111',
    email: 'demo.superadmin@iot.local',
  },
};

const ROUTES = {
  tenant: [
    '/tenant/dashboard', '/tenant/perangkat', '/tenant/grup-perangkat', '/tenant/ruangan',
    '/tenant/gedung', '/tenant/lokasi', '/tenant/realtime', '/tenant/grafik',
    '/tenant/historis', '/tenant/perintah', '/tenant/otomatisasi', '/tenant/scenes',
    '/tenant/schedules', '/tenant/workspace', '/tenant/temuan', '/tenant/laporan',
    '/tenant/pengguna', '/tenant/notifikasi',
  ],
  super: [
    '/super/dashboard', '/super/tenants', '/super/subscriptions', '/super/quotas',
    '/super/billing', '/super/users', '/super/roles', '/super/api-keys', '/super/devices',
    '/super/device-groups', '/super/provisioning', '/super/credentials', '/super/firmware',
    '/super/capabilities', '/super/telemetry', '/super/commands', '/super/mqtt',
    '/super/monitoring', '/super/alerts', '/super/ai', '/super/reports', '/super/settings',
    '/super/security',
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const dir = mkdtempSync(join(tmpdir(), 'sweep-chrome-'));
  const child = spawn('google-chrome', [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--window-size=1600,1000', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return { child, info: await res.json() };
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('chrome tidak siap');
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; }

  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    const cdp = new Cdp(ws);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id);
        cdp.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        cdp.events.push(msg);
      }
    });
    return cdp;
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`timeout ${method}`)); }
      }, 45000);
    });
  }

  drain() { const e = this.events; this.events = []; return e; }
}

const MEASURE = `(() => {
  const doc = document;
  const main = doc.querySelector('main') || doc.body;
  const text = main.innerText || '';
  const buttons = [...doc.querySelectorAll('button')];
  const links = [...doc.querySelectorAll('a[href]')];
  const tables = [...doc.querySelectorAll('table')];
  const emptyStates = [...doc.querySelectorAll('*')]
    .filter((el) => el.children.length === 0)
    .map((el) => (el.textContent || '').trim())
    .filter((t) => /tidak ada data|belum ada|kosong|no data|—$/i.test(t));
  const skeletons = doc.querySelectorAll('.iot-skeleton, [class*="animate-pulse"]').length;
  const disabled = buttons.filter((b) => b.disabled).length;
  const labels = buttons.map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean);
  // Elements escaping the document scroll horizontally, ignoring descendants of a
  // deliberate scroll container (an ancestor with overflow-x auto/scroll/hidden).
  const escapes = [...doc.querySelectorAll('main *')].filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return false;
    if (r.right <= doc.documentElement.clientWidth + 2) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return false;
    }
    return true;
  }).length;
  return {
    title: doc.title,
    path: location.pathname,
    heading: (doc.querySelector('h1') || {}).innerText || '',
    textChars: text.trim().length,
    buttonCount: buttons.length,
    distinctLabels: new Set(labels).size,
    labels: [...new Set(labels)].slice(0, 40),
    disabledButtons: disabled,
    linkCount: links.length,
    tableCount: tables.length,
    tableRows: tables.reduce((n, t) => n + t.querySelectorAll('tbody tr').length, 0),
    emptyStates: [...new Set(emptyStates)].slice(0, 5),
    skeletons,
    nan: /NaN|undefined|\\[object Object\\]|Rp\\s*NaN/.test(text),
    overflowX: doc.documentElement.scrollWidth - doc.documentElement.clientWidth,
    escaping: escapes,
    alerts: [...doc.querySelectorAll('[role=alert]')].map((e) => e.innerText.trim()).filter(Boolean),
  };
})()`;

async function main() {
  const { child } = await launch();
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const cdp = await Cdp.attach(page.webSocketDebuggerUrl);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');

  // Log in through the same form an operator uses.
  const cred = CREDENTIALS[ROLE];
  const pw = process.env.SWEEP_PASSWORD;
  if (!pw) throw new Error('SWEEP_PASSWORD wajib diisi (dari seed demo)');

  const login = await fetch(`${BASE}/api/session/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: cred.tenantId, email: cred.email, password: pw }),
  });
  if (!login.ok) throw new Error(`login gagal: ${login.status} ${await login.text()}`);
  const token = (await login.json()).accessToken;
  const cookies = login.headers.getSetCookie?.() ?? [];
  if (cookies.length === 0) throw new Error('login tidak mengembalikan cookie sesi');
  await cdp.send('Network.setCookies', {
    cookies: cookies.map((c) => {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      return {
        name: pair.slice(0, idx).trim(),
        value: pair.slice(idx + 1).trim(),
        domain: '127.0.0.1', path: '/',
      };
    }),
  });
  await cdp.send('Runtime.evaluate', {
    expression: `sessionStorage.setItem('iot.accessToken', ${JSON.stringify(token)})`,
  });

  const results = [];
  for (const route of ROUTES[ROLE]) {
    cdp.drain();
    const status = await cdp.send('Page.navigate', { url: BASE + route });
    // Settle: first compile plus the page's own fetches.
    await sleep(4500);
    const { result } = await cdp.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
    const events = cdp.drain();
    const consoleErrors = events
      .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
      .map((e) => e.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    const exceptions = events
      .filter((e) => e.method === 'Runtime.exceptionThrown')
      .map((e) => e.params.exceptionDetails.text + ' ' + (e.params.exceptionDetails.exception?.description ?? '').slice(0, 300));
    const failedRequests = events
      .filter((e) => e.method === 'Network.loadingFailed')
      .map((e) => e.params.errorText);

    results.push({
      route, httpError: status?.errorText ?? null, ...result.value,
      consoleErrors, exceptions, failedRequests,
    });
    process.stdout.write(
      `${route.padEnd(30)} chars=${String(result.value.textChars).padStart(5)} btn=${String(result.value.buttonCount).padStart(3)}/${String(result.value.distinctLabels).padStart(2)} tbl=${result.value.tableCount}/${String(result.value.tableRows).padStart(3)} err=${consoleErrors.length + exceptions.length}\n`,
    );
  }

  writeFileSync(OUT, JSON.stringify({ role: ROLE, at: new Date().toISOString(), results }, null, 2));
  cdp.ws.close();
  child.kill();
  process.stdout.write(`\nDitulis: ${OUT}\n`);
}

main().catch((e) => { process.stderr.write(`SWEEP GAGAL: ${e.message}\n`); process.exit(1); });
