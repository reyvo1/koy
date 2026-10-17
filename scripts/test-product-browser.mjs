#!/usr/bin/env node
// Focused browser behavior test: real React components + real go2rtc synthetic video.
// Domain HTTP responses are fixtures, NOT production auth/MQTT/tenant acceptance evidence.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true });
require('reflect-metadata');
const {
  CameraPlaybackService,
} = require('../src/camera/camera-playback.service.ts');
const {
  MediaRuntimeService,
} = require('../src/camera/media-runtime.service.ts');
const { build } = require('esbuild');
const mediaUrl = process.env.PRODUCT_TEST_MEDIA_URL;
const rtspUrl = process.env.PRODUCT_TEST_RTSP_URL;
if (!mediaUrl || !rtspUrl)
  throw new Error(
    'Synthetic fixture PRODUCT_TEST_MEDIA_URL and PRODUCT_TEST_RTSP_URL are required.',
  );
const playback = new CameraPlaybackService(
  { device: { findFirst: async () => ({ id: 'fixture' }) } },
  { resolve: () => ({ rtspUrl }) },
  new MediaRuntimeService(mediaUrl),
);
const bundle = await build({
  entryPoints: ['test/scripts/product-browser-entry.tsx'],
  bundle: true,
  write: false,
  jsx: 'automatic',
  alias: {
    '@': resolve('apps/admin-web'),
    '@iot-platform/design-system': resolve(
      'packages/design-system/src/index.tsx',
    ),
  },
  define: { 'process.env.NODE_ENV': '"test"' },
});
let locations = [],
  scenes = [],
  schedules = [],
  commands = [],
  mutations = [];
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://fixture').pathname;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    res.writeHead(400).end();
    return;
  }
  const json = (payload, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  };
  try {
    if (path === '/') {
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end(
          '<!doctype html><html><style>body{background:#0b0e14;color:#e6e9f0;font:14px system-ui;padding:24px}main{max-width:900px;margin:auto}section{padding:16px;margin:12px 0}button,input,select,textarea{padding:8px;margin:4px;background:#131722;color:#e6e9f0;border:1px solid #475569;border-radius:8px}label{display:block}dialog{background:#131722;color:#e6e9f0}</style><div id="root"></div><script src="/bundle.js"></script></html>',
        );
      return;
    }
    if (path === '/bundle.js') {
      res
        .writeHead(200, { 'content-type': 'application/javascript' })
        .end(bundle.outputFiles[0].text);
      return;
    }
    if (path === '/api/session/me') { json({ role: 'ADMIN' }); return; }
    if (path.startsWith('/api/devices/') && path.endsWith('/location')) {
      if (req.method === 'POST') locations.push({ ...body, id: 'operator-location', deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', recordedAt: new Date().toISOString() });
      json(req.method === 'POST' ? locations.at(-1) : { latest: locations.at(-1) ?? null, items: locations }); return;
    }
    if (path === '/fixture-command') {
      commands.push(body.value);
      json({ status: 'ACKNOWLEDGED_FIXTURE' });
      return;
    }
    if (path.startsWith('/api/camera-playback/')) {
      const id = path.split('/').pop();
      json(
        req.method === 'POST'
          ? await playback.offer('fixture-tenant', id, body.sdp)
          : await playback.stop(
              'fixture-tenant',
              id,
              new URL(req.url, 'http://fixture').searchParams.get('sessionId'),
            ),
      );
      return;
    }
    if (path.startsWith('/api/device-routines/')) {
      const [resource, id, action] = path
        .slice('/api/device-routines/'.length)
        .split('/');
      let rows = resource === 'scenes' ? scenes : schedules;
      if (req.method === 'GET') {
        json(action ? [] : rows);
        return;
      }
      mutations.push({ resource, id, action, method: req.method, body });
      if (req.method === 'POST' && !id) {
        const created = {
          ...body,
          id:
            resource === 'scenes'
              ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
              : 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          enabled: false,
        };
        rows.push(created);
        json(created);
        return;
      }
      const row = rows.find((row) => row.id === id);
      if (!row) {
        json({ message: 'not found' }, 404);
        return;
      }
      if (req.method === 'DELETE') {
        if (
          resource === 'scenes' &&
          schedules.some((schedule) => schedule.targetSceneId === id)
        ) {
          json({ message: 'Scene masih dipakai jadwal.' }, 409);
          return;
        }
        rows = rows.filter((row) => row.id !== id);
        if (resource === 'scenes') scenes = rows;
        else schedules = rows;
        json({ deleted: true });
        return;
      }
      if (req.method === 'PATCH') row.enabled = body.enabled;
      if (action === 'enable' || action === 'disable')
        row.enabled = action === 'enable';
      json(action === 'run' ? { status: 'PENDING_FIXTURE' } : row);
      return;
    }
    json({ message: 'fixture route unavailable' }, 404);
  } catch {
    json({ message: 'Fixture media unavailable.' }, 503);
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}`;
const port = 19322;
let profile = mkdtempSync(join(tmpdir(), 'iot-product-browser-'));
let chrome;
let socket;

/**
 * Launch headless Chrome and wait for its DevTools endpoint to expose a page.
 *
 * The old wait was a flat nine-second poll that read any slow start as "Chrome unavailable". A cold
 * CI runner can legitimately need longer, and a launch error or an early exit deserves its own
 * message instead of the same verdict. The assertions later in this script are untouched; this only
 * makes the environmental failure class detectable and its slow case tolerable.
 */
async function launchChromeAndWait() {
  const child = spawn(
    process.env.PRODUCT_TEST_CHROME ?? 'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let spawnError = null;
  let exited = false;
  let exitCode = null;
  child.on('error', (cause) => {
    spawnError = cause;
  });
  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  const deadline = Date.now() + 30000;
  let tab = null;
  while (Date.now() < deadline) {
    if (spawnError || exited) break;
    try {
      const result = await fetch(`http://127.0.0.1:${port}/json/list`);
      tab = (await result.json()).find((item) => item.type === 'page');
      if (tab) break;
    } catch {}
    await pause(150);
  }
  if (tab) return { child, tab };

  child.kill('SIGKILL');
  if (spawnError) {
    throw new Error(
      `Chrome unavailable: could not launch google-chrome (${spawnError.code ?? spawnError.message})`,
    );
  }
  if (exited) {
    throw new Error(
      `Chrome unavailable: process exited early with code ${exitCode}`,
    );
  }
  throw new Error(
    'Chrome unavailable: DevTools endpoint did not answer within 30s',
  );
}

/** One relaunch with a fresh profile covers a one-off launch crash; the second failure is real. */
async function launchChrome() {
  let lastError;
  for (let launch = 1; launch <= 2; launch += 1) {
    try {
      return await launchChromeAndWait();
    } catch (cause) {
      lastError = cause;
      if (launch < 2) {
        await pause(1000);
        rmSync(profile, { recursive: true, force: true });
        profile = mkdtempSync(join(tmpdir(), 'iot-product-browser-'));
      }
    }
  }
  throw lastError;
}
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
let id = 0;
const pending = new Map(),
  errors = [];
function send(method, params = {}) {
  return new Promise((done, reject) => {
    const key = ++id;
    const timer = setTimeout(() => {
      pending.delete(key);
      reject(new Error(`CDP timeout ${method}`));
    }, 15000);
    pending.set(key, { done, reject, timer });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await pause(200);
  }
  throw new Error(`Browser condition failed: ${expression}`);
}
async function click(text, selector = 'button') {
  assert(
    await evaluate(
      `(() => { const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) return false; button.click(); return true; })()`,
    ),
    `missing enabled ${text}`,
  );
  await pause(250);
}
async function input(label, value) {
  assert(
    await evaluate(
      `(() => { const label = [...document.querySelectorAll('label')].find(el => [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim() === ${JSON.stringify(label)}); const el = label?.querySelector('input,textarea'); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
    ),
    `missing field ${label}`,
  );
  await pause(150);
}
try {
  const launched = await launchChrome();
  chrome = launched.child;
  socket = new WebSocket(launched.tab.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener('open', done, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (pending.has(data.id)) {
      const call = pending.get(data.id);
      pending.delete(data.id);
      clearTimeout(call.timer);
      data.error
        ? call.reject(new Error(data.error.message))
        : call.done(data.result);
    } else if (data.method === 'Runtime.exceptionThrown')
      errors.push(data.params.exceptionDetails.text);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  await waitFor("document.querySelector('#typed input')");
  await input('level (%)', '25.5');
  await click('Kirim', '#typed button');
  await waitFor('document.querySelector("#typed") !== null');
  assert.equal(commands.at(-1), 25.5);
  await input('level (%)', '101');
  await click('Kirim', '#typed button');
  assert.equal(commands.length, 1, 'out-of-range control must not send');
  assert(
    await evaluate(
      "document.querySelector('#location').textContent.includes('Fixture zero')",
    ),
  );
  await input('Nama scene', 'browser scene');
  await input('Nilai target', '40');
  await click('Buat scene');
  await waitFor("document.body.textContent.includes('browser scene')");
  assert.equal(scenes[0].actions[0].value, 40);
  await click('Aktifkan');
  await click('Jalankan');
  assert(mutations.some((row) => row.action === 'run'));
  await input('Nama jadwal', 'browser schedule');
  await click('Buat jadwal');
  await waitFor("document.body.textContent.includes('browser schedule')");
  assert.equal(schedules[0].targetSceneId, scenes[0].id);
  await click('Hapus');
  await waitFor("document.querySelector('dialog').open");
  assert.equal(await evaluate('document.activeElement.textContent'), 'Batal');
  await click('Batal', 'dialog button');
  assert.equal(scenes.length, 1);
  await click('Hapus');
  await click('Hapus', 'dialog button');
  await waitFor(
    "document.querySelector('dialog').textContent.includes('Scene masih dipakai jadwal')",
  );
  assert.equal(scenes.length, 1);
  await click('Batal', 'dialog button');
  assert(
    await evaluate(
      "(() => { const rows = [...document.querySelectorAll('article')]; const row = rows.find(r => r.textContent.includes('browser schedule')); row.querySelectorAll('button')[2].click(); return true; })()",
    ),
  );
  await click('Hapus', 'dialog button');
  await waitFor("!document.querySelector('dialog').open");
  assert.equal(schedules.length, 0);
  await click('Hapus');
  await click('Hapus', 'dialog button');
  await waitFor("!document.querySelector('dialog').open");
  assert.equal(scenes.length, 0);
  await waitFor("document.querySelector('details') !== null");
  await evaluate("document.querySelector('details').open = true");
  await input('Latitude', '0'); await input('Longitude', '0'); await input('Label input operator', 'fixture');
  await click('Simpan koordinat'); assert.equal(locations.at(-1).latitude, 0); assert.equal(locations.at(-1).label, 'Operator: fixture');
  await click('Lihat live');
  await waitFor(
    "document.querySelector('video').readyState >= 2 && document.querySelector('video').videoWidth > 0",
    25000,
  );
  console.log('PASS synthetic camera frames decoded by product CameraPlayer');
  await click('Hentikan');
  await waitFor("document.querySelector('video').srcObject === null");
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(
    'PASS typed command, zero-coordinate marker, scene create/enable/run, schedule create, modal cancel/focus, camera stop',
  );
  console.log(
    'Evidence: BROWSER_FIXTURE + SYNTHETIC_MEDIA_TRANSPORT; production auth/MQTT/full acceptance not claimed.',
  );
} finally {
  if (socket) socket.close();
  if (chrome) chrome.kill();
  for (const call of pending.values()) {
    clearTimeout(call.timer);
    call.reject(new Error('closed'));
  }
  await playback.onModuleDestroy();
  await new Promise((done) => server.close(done));
  await pause(500);
  rmSync(profile, { recursive: true, force: true });
}
