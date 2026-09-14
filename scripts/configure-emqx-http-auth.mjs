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
      ((value.startsWith('\"') && value.endsWith('\"')) ||
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
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

if (!dashboardUsername) fail('EMQX_DASHBOARD_USERNAME is required in the selected environment.');
if (!dashboardPassword || /replace_with|change_me/i.test(dashboardPassword)) {
  fail('EMQX_DASHBOARD_PASSWORD is required and must not be a placeholder.');
}
if (
  !webhookSecret ||
  webhookSecret.length < 16 ||
  /replace_with|change_me/i.test(webhookSecret)
) {
  fail('MQTT_WEBHOOK_SECRET is required, non-placeholder, and at least 16 characters for this local rescue helper.');
}
if (process.exitCode) process.exit();

console.log(`INFO: loading rescue configuration from ${envPath}${existsSync(envPath) ? '' : ' (file not found; process environment only)'}.`);

const loginResponse = await fetch(`${emqxApiUrl}/api/v5/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    username: dashboardUsername,
    password: dashboardPassword,
  }),
});

if (!loginResponse.ok) {
  fail(`EMQX login failed with HTTP ${loginResponse.status}.`);
  process.exit();
}

const loginBody = await loginResponse.json();
const token = loginBody?.token;
if (typeof token !== 'string' || token.length === 0) {
  fail('EMQX login response did not contain a bearer token.');
  process.exit();
}

const authHeaders = {
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
};

const authenticator = {
  mechanism: 'password_based',
  backend: 'http',
  method: 'post',
  url: `${apiFromEmqx}/mqtt/auth`,
  headers: {
    'content-type': 'application/json',
    'x-webhook-secret': webhookSecret,
  },
  body: {
    username: '${username}',
    password: '${password}',
  },
  pool_size: 8,
  connect_timeout: '5s',
  request_timeout: '5s',
  enable_pipelining: 100,
  ssl: { enable: apiFromEmqx.startsWith('https://') },
  enable: true,
};

const listResponse = await fetch(`${emqxApiUrl}/api/v5/authentication`, {
  headers: { authorization: `Bearer ${token}` },
});
if (!listResponse.ok) {
  fail(`Could not read EMQX authentication chain (HTTP ${listResponse.status}).`);
  process.exit();
}

const authenticators = await listResponse.json();
const exists = Array.isArray(authenticators)
  ? authenticators.some((item) => item?.id === 'password_based:http')
  : false;

const authEndpoint = exists
  ? `${emqxApiUrl}/api/v5/authentication/password_based%3Ahttp`
  : `${emqxApiUrl}/api/v5/authentication`;
const writeResponse = await fetch(authEndpoint, {
  method: exists ? 'PUT' : 'POST',
  headers: authHeaders,
  body: JSON.stringify(authenticator),
});
if (!writeResponse.ok) {
  const detail = await writeResponse.text();
  fail(
    `Could not ${exists ? 'update' : 'create'} HTTP authenticator (HTTP ${writeResponse.status}): ${detail.slice(0, 500)}`,
  );
  process.exit();
}

const settingsResponse = await fetch(`${emqxApiUrl}/api/v5/authorization/settings`, {
  headers: { authorization: `Bearer ${token}` },
});
if (!settingsResponse.ok) {
  fail(`Could not read EMQX authorization settings (HTTP ${settingsResponse.status}).`);
  process.exit();
}

const settings = await settingsResponse.json();
const settingsWrite = await fetch(`${emqxApiUrl}/api/v5/authorization/settings`, {
  method: 'PUT',
  headers: authHeaders,
  body: JSON.stringify({
    ...settings,
    no_match: 'deny',
    deny_action: 'disconnect',
  }),
});
if (!settingsWrite.ok) {
  const detail = await settingsWrite.text();
  fail(`Could not enforce fail-closed authorization settings (HTTP ${settingsWrite.status}): ${detail.slice(0, 500)}`);
  process.exit();
}

console.log('PASS: EMQX HTTP authentication is configured for /mqtt/auth.');
console.log('PASS: Broker authorization fallback is fail-closed (no_match=deny, deny_action=disconnect).');
console.log('NEXT: configure telemetry and command-ACK webhooks from ops/emqx/README.md, then execute runtime acceptance.');
