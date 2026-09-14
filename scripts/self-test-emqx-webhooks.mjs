#!/usr/bin/env node

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts/configure-emqx-webhooks.mjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collect(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  const text = body == null ? '' : JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(text);
}

async function withFakeEmqx(mode, fn) {
  const state = { bridges: [], rules: new Map(), mutations: 0, probes: 0 };
  const server = http.createServer(async (req, res) => {
    try {
      const bodyText = await collect(req);
      const body = bodyText ? JSON.parse(bodyText) : null;
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'POST' && url.pathname === '/api/v5/login') {
        json(res, 200, { token: 'fixture-token' }); return;
      }
      if (req.method === 'GET' && ['/api-docs/swagger.json', '/api-spec.json'].includes(url.pathname)) {
        const paths = {
          '/bridges': { get: {}, post: {} },
          '/bridges_probe': { post: {} },
          '/rules': { post: {} },
          '/rules/{id}': { get: {}, put: {} },
        };
        if (mode === 'missing-rules') delete paths['/rules'];
        json(res, 200, { openapi: '3.0.0', paths }); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/v5/bridges_probe') {
        state.probes += 1;
        if (mode === 'probe-reject' || body?.type !== 'webhook') { json(res, 400, { message: 'unsupported' }); return; }
        json(res, 204, null); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/v5/bridges') {
        json(res, 200, state.bridges); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/v5/bridges') {
        state.mutations += 1;
        const stored = mode === 'bridge-alias-roundtrip' ? { ...body, type: 'http', status: 'connected' } : { ...body, status: 'connected' };
        state.bridges.push(stored);
        json(res, 201, stored); return;
      }
      if (req.method === 'PUT' && url.pathname.startsWith('/api/v5/bridges/')) {
        state.mutations += 1;
        const decoded = decodeURIComponent(url.pathname.slice('/api/v5/bridges/'.length));
        const [, name] = decoded.split(':');
        const index = state.bridges.findIndex((item) => item.name === name);
        if (index < 0) { json(res, 404, { message: 'missing bridge' }); return; }
        state.bridges[index] = mode === 'bridge-alias-roundtrip' ? { ...body, type: 'http', status: 'connected' } : { ...body, status: 'connected' };
        json(res, 200, state.bridges[index]); return;
      }
      if (url.pathname.startsWith('/api/v5/rules/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/v5/rules/'.length));
        if (req.method === 'GET') {
          const rule = state.rules.get(id);
          if (!rule) { json(res, 404, { message: 'not found' }); return; }
          if (mode === 'normalized-roundtrip') {
            const fromMatch = /FROM\s+"([^"]+)"/i.exec(rule.sql ?? '');
            json(res, 200, {
              ...rule,
              from: fromMatch?.[1] ?? null,
              sql: String(rule.sql ?? '')
                .replace(/SELECT\s+/i, 'select\n  ')
                .replace(/\s+AS\s+/gi, ' as ')
                .replace(/,\s*/g, ',\n  ')
                .replace(/\s+FROM\s+/i, '\nFROM\n  '),
              action_details: (rule.actions ?? []).filter((action) => typeof action === 'string').map((action) => {
                const [type, name] = action.split(':');
                return { type, name, status: 'connected' };
              }),
            });
            return;
          }
          if (mode === 'wrong-source-roundtrip') {
            json(res, 200, { ...rule, from: 'wrong/topic' }); return;
          }
          json(res, 200, rule); return;
        }
        if (req.method === 'PUT') {
          state.mutations += 1;
          state.rules.set(id, { id, ...body });
          json(res, 200, state.rules.get(id)); return;
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/v5/rules') {
        state.mutations += 1;
        state.rules.set(body.id, body);
        json(res, 201, body); return;
      }
      json(res, 404, { message: `${req.method} ${url.pathname} unsupported` });
    } catch (error) {
      json(res, 500, { message: error.message });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  try { await fn({ state, port }); } finally { await new Promise((resolve) => server.close(resolve)); }
}

function run(port) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      env: {
        ...process.env,
        EMQX_API_URL: `http://127.0.0.1:${port}`,
        IOT_API_FROM_EMQX: 'http://api:3000',
        EMQX_DASHBOARD_USERNAME: 'admin',
        EMQX_DASHBOARD_PASSWORD: 'fixture-dashboard-secret',
        MQTT_WEBHOOK_SECRET: 'fixture-webhook-secret-12345',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

await withFakeEmqx('ok', async ({ state, port }) => {
  let result = await run(port);
  assert(result.status === 0, `first webhook configuration must pass: ${result.stderr || result.stdout}`);
  assert(state.probes === 1, 'supported webhook alias should be selected by no-mutation probe');
  assert(state.bridges.length === 2, 'two webhook bridges must be created');
  assert(state.rules.size === 2, 'two routing rules must be created');
  const telemetry = state.bridges.find((item) => item.name === 'iot_telemetry_webhook');
  const ack = state.bridges.find((item) => item.name === 'iot_command_ack_webhook');
  assert(telemetry?.url.endsWith('/mqtt/webhook/telemetry'), 'telemetry webhook must target canonical API endpoint');
  assert(telemetry?.body.includes('${eventId}') && telemetry?.body.includes('${payload}'), 'telemetry bridge body must use transformed rule fields');
  assert(ack?.url.endsWith('/mqtt/ack'), 'ACK webhook must target canonical API endpoint');
  assert(telemetry?.headers?.['x-webhook-secret'] === 'fixture-webhook-secret-12345', 'webhook secret must be present in broker request headers');
  const telemetryRule = state.rules.get('iot_telemetry_ingest');
  assert(telemetryRule?.sql.includes('payload.eventId AS eventId'), 'telemetry rule must extract eventId from MQTT JSON payload');
  assert(telemetryRule?.actions?.includes('webhook:iot_telemetry_webhook'), 'telemetry rule must bind canonical bridge action');
  assert(state.rules.get('iot_command_ack_ingest')?.actions?.includes('webhook:iot_command_ack_webhook'), 'ACK rule must bind canonical bridge action');
  const firstMutations = state.mutations;

  result = await run(port);
  assert(result.status === 0, `idempotent webhook reconfiguration must pass: ${result.stderr || result.stdout}`);
  assert(state.bridges.length === 2 && state.rules.size === 2, 'reconfiguration must update rather than duplicate managed objects');
  assert(state.mutations === firstMutations + 4, 'second run must deterministically update two bridges and two rules');
});


await withFakeEmqx('bridge-alias-roundtrip', async ({ state, port }) => {
  const result = await run(port);
  assert(result.status === 0, `broker webhook->http bridge alias normalization must pass: ${result.stderr || result.stdout}`);
  assert(state.bridges.length === 2 && state.bridges.every((bridge) => bridge.type === 'http'), 'fixture must normalize stored bridge type to http');
  assert(state.rules.get('iot_telemetry_ingest')?.actions?.includes('http:iot_telemetry_webhook'), 'telemetry rule must use broker-resolved http action id');
  assert(state.rules.get('iot_command_ack_ingest')?.actions?.includes('http:iot_command_ack_webhook'), 'ACK rule must use broker-resolved http action id');
});


await withFakeEmqx('normalized-roundtrip', async ({ state, port }) => {
  const result = await run(port);
  assert(result.status === 0, `EMQX-normalized SQL/action round-trip must pass semantic verification: ${result.stderr || result.stdout}`);
  assert(state.bridges.length === 2 && state.rules.size === 2, 'normalized round-trip fixture must still create canonical managed objects');
});

await withFakeEmqx('wrong-source-roundtrip', async ({ state, port }) => {
  const result = await run(port);
  assert(result.status !== 0, 'unexpected source topic returned by broker must fail closed');
  assert(`${result.stdout}${result.stderr}`.includes('unexpected source topic'), 'source-topic mismatch reason must be explicit');
  assert(state.mutations > 0, 'round-trip mismatch is checked after managed objects are created');
});

await withFakeEmqx('missing-rules', async ({ state, port }) => {
  const result = await run(port);
  assert(result.status !== 0, 'missing live OpenAPI rule contract must fail closed');
  assert(`${result.stdout}${result.stderr}`.includes('required webhook automation contract'), 'OpenAPI failure reason must be explicit');
  assert(state.mutations === 0 && state.probes === 0, 'OpenAPI contract failure must happen before probe or mutation');
});

await withFakeEmqx('probe-reject', async ({ state, port }) => {
  const result = await run(port);
  assert(result.status !== 0, 'bridge probe rejection must fail closed');
  assert(`${result.stdout}${result.stderr}`.includes('rejected both supported HTTP webhook bridge aliases'), 'probe failure reason must be explicit');
  assert(state.mutations === 0, 'bridge probe failure must not mutate broker configuration');
});

console.log('PASS  EMQX webhook helper validates live OpenAPI before mutation');
console.log('PASS  EMQX webhook helper probes bridge compatibility before mutation and configures canonical telemetry/ACK routes');
console.log('PASS  EMQX webhook helper is idempotent and fail-closed on unsupported OpenAPI/probe contracts');
