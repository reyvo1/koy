#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const envArg = process.argv.slice(2).find((value) => value.startsWith('--env='));
const envPath = path.resolve(envArg ? envArg.slice('--env='.length) : '.env');

function parseEnv(file) {
  const values = {};
  if (!existsSync(file)) return values;
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = { ...parseEnv(envPath), ...process.env };
const emqxApiUrl = (env.EMQX_API_URL ?? 'http://127.0.0.1:18083').replace(/\/$/, '');
const apiFromEmqx = (env.IOT_API_FROM_EMQX ?? 'http://api:3000').replace(/\/$/, '');
const dashboardUsername = env.EMQX_DASHBOARD_USERNAME?.trim();
const dashboardPassword = env.EMQX_DASHBOARD_PASSWORD;
const webhookSecret = env.MQTT_WEBHOOK_SECRET;

function fail(message) {
  const error = new Error(message);
  error.exitCode = 1;
  throw error;
}

function requireConfig() {
  if (!dashboardUsername) fail('EMQX_DASHBOARD_USERNAME is required in the selected environment.');
  if (!dashboardPassword || /replace_with|change_me/i.test(dashboardPassword)) {
    fail('EMQX_DASHBOARD_PASSWORD is required and must not be a placeholder.');
  }
  if (!webhookSecret || webhookSecret.length < 16 || /replace_with|change_me/i.test(webhookSecret)) {
    fail('MQTT_WEBHOOK_SECRET is required, non-placeholder, and at least 16 characters.');
  }
}

async function jsonOrText(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function request(url, options = {}, allowed = [200, 201, 204]) {
  const response = await fetch(url, options);
  const body = await jsonOrText(response);
  if (!allowed.includes(response.status)) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body ?? {});
    fail(`${options.method ?? 'GET'} ${url} failed with HTTP ${response.status}: ${detail.slice(0, 600)}`);
  }
  return { response, body };
}

async function login() {
  const { body } = await request(`${emqxApiUrl}/api/v5/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ username: dashboardUsername, password: dashboardPassword }),
  }, [200]);
  const token = body?.token;
  if (typeof token !== 'string' || !token) fail('EMQX login response did not contain a bearer token.');
  return token;
}

function operationExists(spec, suffix, method) {
  const paths = spec?.paths && typeof spec.paths === 'object' ? spec.paths : {};
  const candidates = [suffix, `/api/v5${suffix}`];
  return candidates.some((candidate) => Boolean(paths[candidate]?.[method]));
}

async function loadAndValidateApiSpec(headers) {
  const candidates = ['/api-docs/swagger.json', '/api-spec.json'];
  let last = null;
  for (const candidate of candidates) {
    const response = await fetch(`${emqxApiUrl}${candidate}`, { headers });
    if (response.ok) {
      const spec = await response.json();
      const required = [
        ['/bridges', 'get'], ['/bridges', 'post'], ['/bridges_probe', 'post'],
        ['/rules', 'post'], ['/rules/{id}', 'get'], ['/rules/{id}', 'put'],
      ];
      const missing = required.filter(([suffix, method]) => !operationExists(spec, suffix, method));
      if (missing.length > 0) {
        fail(`EMQX OpenAPI does not expose the required webhook automation contract: ${missing.map(([p,m]) => `${m.toUpperCase()} ${p}`).join(', ')}.`);
      }
      return { specEndpoint: candidate, spec };
    }
    last = `${candidate} -> HTTP ${response.status}`;
  }
  fail(`EMQX OpenAPI specification is unavailable; refusing webhook mutation (${last ?? 'no response'}).`);
}

const webhookDefinitions = [
  {
    key: 'telemetry',
    bridgeName: 'iot_telemetry_webhook',
    ruleId: 'iot_telemetry_ingest',
    topic: 'tenants/+/devices/+/telemetry',
    url: `${apiFromEmqx}/mqtt/webhook/telemetry`,
    body: '{"topic":"${topic}","eventId":"${eventId}","payload":${payload}}',
    sql: 'SELECT topic, payload.eventId AS eventId, payload.payload AS payload FROM "tenants/+/devices/+/telemetry"',
  },
  {
    key: 'ack',
    bridgeName: 'iot_command_ack_webhook',
    ruleId: 'iot_command_ack_ingest',
    topic: 'tenants/+/devices/+/commands/ack',
    url: `${apiFromEmqx}/mqtt/ack`,
    body: '{"topic":"${topic}","payload":${payload}}',
    sql: 'SELECT topic, payload AS payload FROM "tenants/+/devices/+/commands/ack"',
  },
];

function bridgePayload(definition, type) {
  return {
    type,
    name: definition.bridgeName,
    enable: true,
    url: definition.url,
    method: 'post',
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': webhookSecret,
    },
    body: definition.body,
    connect_timeout: '5s',
    request_timeout: '5s',
    pool_size: 8,
    enable_pipelining: 100,
    ssl: {
      enable: definition.url.startsWith('https://'),
      verify: definition.url.startsWith('https://') ? 'verify_peer' : 'verify_none',
    },
  };
}

async function selectBridgeType(headers) {
  const probeUrl = `${emqxApiUrl}/api/v5/bridges_probe`;
  const failures = [];
  for (const type of ['webhook', 'http']) {
    const response = await fetch(probeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(bridgePayload(webhookDefinitions[0], type)),
    });
    const detail = await response.text();
    if (response.ok) return type;
    failures.push(`${type}: HTTP ${response.status}${detail ? ` ${detail.slice(0, 180)}` : ''}`);
  }
  fail(`EMQX rejected both supported HTTP webhook bridge aliases during no-mutation probe (${failures.join(' | ')}).`);
}

const httpBridgeTypes = new Set(['webhook', 'http']);

function bridgeActionIdFromRecord(record, bridgeName, fallbackType = null) {
  if (!record || record.name !== bridgeName) return null;
  const type = typeof record.type === 'string' ? record.type : fallbackType;
  if (!httpBridgeTypes.has(type)) return null;
  return `${type}:${bridgeName}`;
}

function equivalentHttpBridgeAction(actualActionId, expectedActionId) {
  if (actualActionId === expectedActionId) return true;
  if (typeof actualActionId !== 'string' || typeof expectedActionId !== 'string') return false;
  const actualSep = actualActionId.indexOf(':');
  const expectedSep = expectedActionId.indexOf(':');
  if (actualSep <= 0 || expectedSep <= 0) return false;
  const actualType = actualActionId.slice(0, actualSep);
  const actualName = actualActionId.slice(actualSep + 1);
  const expectedType = expectedActionId.slice(0, expectedSep);
  const expectedName = expectedActionId.slice(expectedSep + 1);
  return actualName === expectedName && httpBridgeTypes.has(actualType) && httpBridgeTypes.has(expectedType);
}

async function listBridges(headers) {
  const { body } = await request(`${emqxApiUrl}/api/v5/bridges`, { headers }, [200]);
  if (!Array.isArray(body)) fail('EMQX bridge list response is not an array; refusing mutation.');
  return body;
}

async function upsertBridge(definition, type, headers) {
  const bridges = await listBridges(headers);
  const existing = bridges.find((item) => item?.name === definition.bridgeName && httpBridgeTypes.has(item?.type));
  const payload = bridgePayload(definition, type);
  if (existing) {
    const existingActionId = bridgeActionIdFromRecord(existing, definition.bridgeName, type);
    if (!existingActionId) fail(`EMQX bridge ${definition.bridgeName} exists with an unsupported type.`);
    await request(`${emqxApiUrl}/api/v5/bridges/${encodeURIComponent(existingActionId)}`, {
      method: 'PUT', headers, body: JSON.stringify(payload),
    }, [200, 204]);
  } else {
    await request(`${emqxApiUrl}/api/v5/bridges`, {
      method: 'POST', headers, body: JSON.stringify(payload),
    }, [200, 201, 204]);
  }

  const refreshed = await listBridges(headers);
  const resolved = refreshed.find((item) => item?.name === definition.bridgeName && httpBridgeTypes.has(item?.type));
  const resolvedActionId = bridgeActionIdFromRecord(resolved, definition.bridgeName, type);
  if (!resolvedActionId) {
    fail(`EMQX bridge ${definition.bridgeName} did not round-trip with a supported HTTP bridge type after mutation.`);
  }
  return resolvedActionId;
}

async function upsertRule(definition, actionId, headers) {
  const ruleUrl = `${emqxApiUrl}/api/v5/rules/${encodeURIComponent(definition.ruleId)}`;
  const current = await fetch(ruleUrl, { headers });
  const payload = {
    id: definition.ruleId,
    name: definition.ruleId,
    description: `IoT rescue ${definition.key} webhook route; managed by source-controlled runtime tooling.`,
    enable: true,
    sql: definition.sql,
    actions: [actionId],
  };
  if (current.status === 200) {
    await current.arrayBuffer();
    const { id: _id, ...update } = payload;
    await request(ruleUrl, { method: 'PUT', headers, body: JSON.stringify(update) }, [200, 204]);
    return;
  }
  if (current.status !== 404) {
    const detail = await current.text();
    fail(`GET ${ruleUrl} failed with HTTP ${current.status}: ${detail.slice(0, 500)}`);
  }
  await request(`${emqxApiUrl}/api/v5/rules`, {
    method: 'POST', headers, body: JSON.stringify(payload),
  }, [200, 201]);
}

function canonicalizeRuleSql(sql) {
  if (typeof sql !== 'string') return null;
  let normalized = sql.trim().replace(/\s+/g, ' ');
  for (const keyword of ['select', 'as', 'from', 'where', 'and', 'or']) {
    normalized = normalized.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), keyword.toUpperCase());
  }
  return normalized
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*=\s*/g, '=');
}

function ruleHasExpectedAction(body, actionId) {
  if (Array.isArray(body?.actions) && body.actions.some((action) => equivalentHttpBridgeAction(action, actionId))) return true;
  if (!Array.isArray(body?.action_details)) return false;
  return body.action_details.some((detail) => {
    if (!detail || typeof detail !== 'object') return false;
    if (equivalentHttpBridgeAction(detail.name, actionId)) return true;
    if (typeof detail.type === 'string' && typeof detail.name === 'string') {
      return equivalentHttpBridgeAction(`${detail.type}:${detail.name}`, actionId);
    }
    return false;
  });
}

async function verifyRule(definition, actionId, headers) {
  const { body } = await request(`${emqxApiUrl}/api/v5/rules/${encodeURIComponent(definition.ruleId)}`, { headers }, [200]);
  if (!body || body.enable !== true) {
    fail(`EMQX rule ${definition.ruleId} did not round-trip as enabled.`);
  }

  const expectedSql = canonicalizeRuleSql(definition.sql);
  const actualSql = canonicalizeRuleSql(body.sql);
  if (!expectedSql || !actualSql || actualSql !== expectedSql) {
    fail(`EMQX rule ${definition.ruleId} SQL round-trip is not semantically equivalent to the managed contract.`);
  }

  const sources = Array.isArray(body.from) ? body.from : body.from == null ? [] : [body.from];
  if (sources.length > 0 && !sources.includes(definition.topic)) {
    fail(`EMQX rule ${definition.ruleId} round-tripped with unexpected source topic(s): ${sources.join(', ')}.`);
  }

  if (!ruleHasExpectedAction(body, actionId)) {
    const actualActions = Array.isArray(body.actions) ? body.actions.filter((action) => typeof action === 'string') : [];
    fail(`EMQX rule ${definition.ruleId} is missing expected action ${actionId}; broker returned [${actualActions.join(', ')}].`);
  }
}

async function main() {
  requireConfig();
  console.log(`INFO  loading rescue webhook configuration from ${envPath}${existsSync(envPath) ? '' : ' (file not found; process environment only)'}.`);
  const token = await login();
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'content-type': 'application/json',
  };
  const { specEndpoint } = await loadAndValidateApiSpec(headers);
  console.log(`PASS  EMQX live OpenAPI contract exposes required bridge/rule operations via ${specEndpoint}.`);
  const type = await selectBridgeType(headers);
  console.log(`PASS  EMQX no-mutation bridge probe accepted HTTP webhook type alias: ${type}.`);

  for (const definition of webhookDefinitions) {
    const actionId = await upsertBridge(definition, type, headers);
    await upsertRule(definition, actionId, headers);
    await verifyRule(definition, actionId, headers);
    console.log(`PASS  ${definition.key} webhook rule ${definition.ruleId} -> ${actionId} is configured.`);
  }

  console.log('BOUNDARY  Broker webhook configuration is present, but live publish/idempotency/ACK/negative-path evidence is still required for RESCUE-02B.');
}

main().catch((error) => {
  console.error(`FAIL: ${error?.message ?? error}`);
  process.exit(error?.exitCode ?? 1);
});
