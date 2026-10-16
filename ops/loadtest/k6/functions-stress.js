/**
 * k6 function stress suite for the IoT Platform.
 *
 * What this proves
 * ----------------
 * `scripts/run-load-gate.ts` measures two unauthenticated read endpoints against a fixed budget.
 * This suite answers the harder question: do the platform's real functions still answer correctly
 * for a real tenant admin, a real member, a real super admin and a real API-key consumer while
 * they are being driven at 80 requests/second — and do they answer within a declared budget.
 *
 * Three properties make that evidence worth having:
 *
 *   1. Coverage is declared in config/stress-budget.json, and every declared path is resolved back
 *      to a controller by test/k6-stress-suite.contract.spec.ts. A surface that disappears fails
 *      the contract; a contract that loses an entry fails the coverage check.
 *   2. Every declared function must answer 2xx. The setup stage therefore resolves the entities it
 *      needs (a dashboard, a widget, a device, an automation, a scene, a schedule, a notification,
 *      a command) and FAILS THE RUN when one is missing. "No data" must never look like "healthy
 *      under load".
 *   3. Thresholds come from the same budget file, so error-rate, check-rate and per-class latency
 *      budgets are declared claims, and the run can fail.
 *
 * Write coverage is deliberately bounded: it flips an existing automation's activation, rewrites the
 * authenticated operator's own profile with the value already stored (idempotent), and churns a
 * device group it creates and deletes inside the same iteration. It never acts on a real actuator,
 * and teardown restores the automation's original activation state and deletes the suite's API key.
 */

import http from 'k6/http';
import { check, fail } from 'k6';
import { Trend } from 'k6/metrics';
import { loadBudget, weightedPick, baseUrl } from './lib/config.js';
import {
  resolveAccount,
  bearerHeaders,
  apiKeyHeaders,
  buildUrl,
  buildBody,
} from './lib/auth.js';

const { budget, totalWeight } = loadBudget();
const settings = budget.settings;
const origin = baseUrl();

// An optional entry (guarded by requiresEnv) is dropped from the traffic mix when its environment
// is absent -- it is declared, not silently ignored, and the contract spec keeps it declared.
const activeFunctions = budget.functions.filter((fn) =>
  (fn.requiresEnv || []).every((name) => Boolean(__ENV[name])));
const activeWeight = activeFunctions.reduce((sum, fn) => sum + (fn.weight || 1), 0);
if (activeWeight <= 0) throw new Error('no stress functions are active with the current environment');

// One trend per class, so the class budgets in the budget file are enforced per surface instead of
// being averaged away by an aggregate that a fast health endpoint keeps green.
const classTrends = {};
for (const cls of Object.keys(budget.thresholds.classes)) {
  classTrends[cls] = new Trend(`iot_functions_${cls}_duration_ms`, true);
}

const classThresholds = {};
for (const [cls, limits] of Object.entries(budget.thresholds.classes)) {
  classThresholds[`iot_functions_${cls}_duration_ms`] = [
    `p(95)<${limits.p95Ms}`,
    `p(99)<${limits.p95Ms * 2}`,
  ];
}

export const options = {
  scenarios: {
    [settings.scenarioName]: {
      executor: settings.executor,
      startRate: settings.startRate,
      timeUnit: settings.timeUnit,
      preAllocatedVUs: settings.preAllocatedVUs,
      maxVUs: settings.maxVUs,
      stages: settings.stages,
      gracefulStop: settings.gracefulStop,
      exec: 'runFunction',
    },
  },
  thresholds: Object.assign(
    {
      http_req_failed: [`rate<${budget.thresholds.http_req_failed.rate}`],
      http_req_duration: [`p(95)<${budget.thresholds.http_req_duration.p95Ms}`],
      checks: [`rate>${budget.thresholds.checks.rate}`],
    },
    classThresholds,
  ),
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
};

const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * Setup resolves every entity the matrix references and logs in the three identities. A missing
 * entity is a hard failure: an entry declared in the budget that cannot be exercised means the
 * suite would silently skip that surface, which is the manufactured evidence this project refuses.
 */
export function setup() {
  const admin = resolveAccount('tenant-admin');
  const member = resolveAccount('member');
  const superAdmin = resolveAccount('super-admin');

  const adminSession = login(admin);
  const memberSession = login(member);
  const superSession = login(superAdmin);

  const ctx = {
    adminPassword: admin.password,
    adminToken: adminSession.token,
    adminRefresh: adminSession.refreshToken,
    memberToken: memberSession.token,
    superToken: superSession.token,
    tenant: admin.tenant,
    superTenant: superAdmin.tenant,
    profileName: 'k6 Stress Operator',
  };

  // TenantContextGuard refuses a valid session without the tenant header, so every setup read
  // carries the same identity the run will use.
  const adminHeaders = { 'x-tenant-id': admin.tenant };
  ctx.deviceId = firstEntity('/devices', ctx.adminToken, 'device', adminHeaders);
  ctx.dashboardId = firstEntity('/dashboards', ctx.adminToken, 'dashboard', adminHeaders);
  ctx.widgetId = firstWidget(ctx.dashboardId, ctx.adminToken, adminHeaders);
  ctx.automationId = firstEntity('/automations', ctx.adminToken, 'automation', adminHeaders);
  ctx.sceneId = firstEntity('/scenes', ctx.adminToken, 'scene', adminHeaders);
  ctx.scheduleId = firstEntity('/schedules', ctx.adminToken, 'schedule', adminHeaders);
  ctx.notificationId = firstEntity('/notifications', ctx.adminToken, 'notification', adminHeaders);
  // The command detail route reads a CORRELATION id (getByCorrelationId), not the command id.
  ctx.commandCorrelationId = firstCommand(ctx.deviceId, ctx.adminToken, adminHeaders);
  ctx.integrationId = firstOptionalEntity('/admin/integrations', ctx.adminToken, 'integration', adminHeaders);

  // The idempotent profile write must send the name that is already stored, so a stress run cannot
  // rename the operator's account as a side effect.
  const profile = http.get(`${origin}/users/profile`, {
    headers: bearerHeaders(ctx.adminToken, Object.assign({ 'x-tenant-id': ctx.tenant }, JSON_HEADERS)),
    tags: { class: 'setup', name: 'profile read' },
  });
  if (profile.status !== 200) {
    fail(`setup: profile read returned ${profile.status}; cannot build the idempotent write`);
  }
  ctx.profileName = safeJson(profile)?.name || ctx.profileName;

  ctx.apiKey = createApiKey(ctx.adminToken, adminHeaders);
  ctx.automationOriginallyActive = automationActivation(ctx.automationId, ctx.adminToken, adminHeaders);

  // Refresh rotation is exercised once here so an expired token mid-run is a token problem, not a
  // suite problem; the run itself uses the short-lived access token.
  const refreshed = http.post(
    `${origin}/auth/refresh`,
    JSON.stringify({ refreshToken: ctx.adminRefresh }),
    { headers: JSON_HEADERS, tags: { class: 'setup', name: 'refresh' } },
  );
  if (refreshed.status === 200 && safeJson(refreshed)?.accessToken) {
    ctx.adminToken = safeJson(refreshed).accessToken;
  }

  console.log(
    `setup: dashboard=${ctx.dashboardId} widget=${ctx.widgetId} device=${ctx.deviceId} ` +
      `automation=${ctx.automationId} scene=${ctx.sceneId} schedule=${ctx.scheduleId} ` +
      `notification=${ctx.notificationId} command=${ctx.commandId} apiKey=${ctx.apiKey.id}`,
  );
  return ctx;
}

function login(account) {
  const response = http.post(
    `${origin}/auth/login`,
    JSON.stringify({ email: account.email, password: account.password, tenantId: account.tenant }),
    { headers: JSON_HEADERS, tags: { class: 'setup', name: `login ${account.email}` } },
  );
  if (response.status !== 200 && response.status !== 201) {
    fail(
      `setup: login for ${account.email} returned ${response.status}. Stress credentials must ` +
        'resolve: run `npm run stress:seed` or pass STRESS_*_PASSWORD.',
    );
  }
  const body = safeJson(response);
  if (!body?.accessToken) fail(`setup: login for ${account.email} returned no access token`);
  return { token: body.accessToken, refreshToken: body.refreshToken };
}

function firstEntity(path, token, label, headers) {
  const response = http.get(buildUrl(origin, path, undefined, {}), {
    headers: Object.assign(bearerHeaders(token), headers || {}),
    tags: { class: 'setup', name: `${label} list` },
  });
  if (response.status !== 200) {
    fail(`setup: ${path} returned ${response.status}; the suite needs real entities to stress`);
  }
  const body = safeJson(response);
  const items = Array.isArray(body) ? body : body?.items || body?.data || [];
  if (items.length === 0) {
    fail(
      `setup: ${path} returned an empty list. Every function declared in the budget must have a ` +
        'real entity to exercise; seed the platform first (`npm run stress:seed`).',
    );
  }
  return items[0].id;
}

/**
 * Some collections are legitimately empty on a fresh stack (an operator with no integrations yet
 * must be able to run the suite). A function whose entity is missing is skipped at request time by
 * clearing its id, which makes the request fall out of the declared mix instead of 404ing.
 */
function firstOptionalEntity(path, token, label, headers) {
  const response = http.get(buildUrl(origin, path, undefined, {}), {
    headers: Object.assign(bearerHeaders(token), headers || {}),
    tags: { class: 'setup', name: `${label} list` },
  });
  if (response.status !== 200) {
    fail(`setup: ${path} returned ${response.status}; cannot resolve optional entities`);
  }
  const body = safeJson(response);
  const items = Array.isArray(body) ? body : body?.items || body?.data || [];
  return items.length > 0 ? items[0].id : '';
}

function firstWidget(dashboardId, token, headers) {
  const response = http.get(`${origin}/dashboards/${dashboardId}`, {
    headers: Object.assign(bearerHeaders(token), headers || {}),
    tags: { class: 'setup', name: 'dashboard detail' },
  });
  if (response.status !== 200) {
    fail(`setup: dashboard ${dashboardId} returned ${response.status}`);
  }
  const dashboard = safeJson(response);
  const widgets = dashboard?.widgets || dashboard?.dashboard?.widgets || [];
  if (widgets.length === 0) {
    fail('setup: the resolved dashboard has no widgets, so widget data cannot be stressed');
  }
  return widgets[0].id;
}

function firstCommand(deviceId, token, headers) {
  const response = http.get(`${origin}/devices/${deviceId}/commands?limit=1`, {
    headers: Object.assign(bearerHeaders(token), headers || {}),
    tags: { class: 'setup', name: 'command history' },
  });
  if (response.status !== 200) {
    fail(`setup: command history for device ${deviceId} returned ${response.status}`);
  }
  const body = safeJson(response);
  const items = Array.isArray(body) ? body : body?.items || [];
  if (items.length === 0) {
    fail(
      'setup: the resolved device has no command history, so the declared command-detail function ' +
        'could never be exercised. The stress baseline seeds one command.',
    );
  }
  return items[0].correlationId;
}

function automationActivation(automationId, token, headers) {
  const response = http.get(`${origin}/automations/${automationId}`, {
    headers: Object.assign(bearerHeaders(token), headers || {}),
    tags: { class: 'setup', name: 'automation detail' },
  });
  if (response.status !== 200) {
    fail(`setup: automation ${automationId} returned ${response.status}`);
  }
  const automation = safeJson(response);
  return Boolean(automation?.active ?? automation?.isActive ?? automation?.enabled);
}

function createApiKey(token, headers) {
  const name = `k6-stress-${Date.now()}`;
  const scopes = (__ENV.STRESS_API_KEY_SCOPES || 'TELEMETRY_READ,ANALYTICS_READ')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);

  const response = http.post(
    `${origin}/admin/api-keys`,
    JSON.stringify({ name, scopes }),
    {
      headers: Object.assign(bearerHeaders(token), headers || {}, JSON_HEADERS),
      tags: { class: 'setup', name: 'create api key' },
    },
  );
  if (response.status !== 200 && response.status !== 201) {
    fail(`setup: API key creation returned ${response.status}; /v1 coverage needs a real key`);
  }
  // The API returns `plaintext` once, together with the id; it is the only time the key exists in
  // readable form, which is exactly why the suite must capture it here and delete the key in teardown.
  const body = safeJson(response);
  const key = body?.plaintext || body?.key;
  const id = body?.id;
  if (!key || !id) {
    fail('setup: API key response carried neither the one-time plaintext nor its id');
  }
  return { key, id };
}

function safeJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

/**
 * Tenant-scoped requests carry `x-tenant-id`: TenantContextGuard reads the tenant from that header
 * (the admin-web BFF sends it, and so does the live acceptance probe), without it even a valid
 * session is refused with TENANT_CONTEXT_INVALID. The public API resolves its tenant from the API
 * key instead and must NOT be sent the header.
 */
function tenantHeaders(role, ctx) {
  if (role === 'super-admin') return { 'x-tenant-id': ctx.superTenant };
  if (role === 'member') return { 'x-tenant-id': ctx.tenant };
  if (role === 'api-key') return {};
  return { 'x-tenant-id': ctx.tenant };
}

function headersFor(fn, ctx) {
  // /metrics is guarded by METRICS_ACCESS_TOKEN when that is configured, so the suite uses that
  // token explicitly instead of pretending a session bearer satisfies the scrape guard.
  if (fn.metricsToken) {
    return Object.assign({ authorization: `Bearer ${__ENV.STRESS_METRICS_TOKEN}` }, tenantHeaders(fn.role, ctx));
  }
  if (fn.role === 'api-key') return apiKeyHeaders(ctx.apiKey.key, JSON_HEADERS);
  // The anonymous liveness check must stay anonymous: sending a session there would exercise the
  // auth layer instead of the endpoint's own readiness.
  if (fn.role === 'anonymous') return Object.assign({}, JSON_HEADERS);
  if (fn.role === 'member') {
    return bearerHeaders(ctx.memberToken, Object.assign(tenantHeaders(fn.role, ctx), JSON_HEADERS));
  }
  if (fn.role === 'super-admin') {
    return bearerHeaders(ctx.superToken, Object.assign(tenantHeaders(fn.role, ctx), JSON_HEADERS));
  }
  return bearerHeaders(ctx.adminToken, Object.assign(tenantHeaders(fn.role, ctx), JSON_HEADERS));
}

// With `exec: 'runFunction'` in the scenario, k6 passes the setup() return value to this function
// as its first argument, which is how every VU sees the same resolved entities and sessions.
export function runFunction(ctx) {
  const fn = weightedPick(activeFunctions, activeWeight, Math.random);

  if (fn.type === 'sequence') runSequence(fn, ctx);
  else runSingle(fn, ctx);
}

function runSingle(fn, ctx) {
  // A declared function whose entity is absent on this stack (a tenant with no integrations yet)
  // falls out of the mix rather than 404ing: coverage is honest, not manufactured.
  for (const required of fn.requires || []) {
    if (!ctx[required]) return;
  }

  const url = buildUrl(origin, fn.path, fn.query, ctx);
  const params = {
    headers: headersFor(fn, ctx),
    tags: { class: fn.class, name: fn.name, role: fn.role },
  };
  if (fn.body) params.body = buildBody(fn.body, ctx);

  const response =
    fn.method === 'GET' ? http.get(url, params) : http.request(fn.method, url, params.body, params);
  observe(fn, response);
}

function runSequence(fn, ctx) {
  const local = Object.assign(
    {},
    ctx,
    { groupName: `k6-stress-${Date.now()}-${Math.floor(Math.random() * 1e6)}` },
  );
  for (const step of fn.sequence) {
    const url = buildUrl(origin, step.path, undefined, local);
    const params = {
      headers: bearerHeaders(ctx.adminToken, Object.assign({ 'x-tenant-id': ctx.tenant }, JSON_HEADERS)),
      tags: { class: fn.class, name: `${fn.name}: ${step.method} ${step.path}`, role: fn.role },
    };
    if (step.body) params.body = buildBody(step.body, local);

    const response =
      step.method === 'GET'
        ? http.get(url, params)
        : http.request(step.method, url, params.body, params);

    observe({ class: fn.class, name: `${fn.name}: ${step.method} ${step.path}` }, response);

    if (step.capture) {
      for (const [field, key] of Object.entries(step.capture)) {
        local[field] = safeJson(response)?.[key];
        if (!local[field]) fail(`${fn.name}: could not capture ${field} from ${step.path}`);
      }
    }
  }
}

function observe(fn, response) {
  classTrends[fn.class]?.add(response.timings.duration);
  check(response, {
    [`${fn.name} answered 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });
}

export function teardown(ctx) {
  if (!ctx) return;

  // A three-minute run outlives the short-lived access token, and a teardown that cannot delete
  // the suite's own API key would leave a credential behind. Re-authenticate for the cleanup.
  if (ctx.apiKey?.id) {
    const refreshed = http.post(
      `${origin}/auth/login`,
      JSON.stringify({
        email: resolveAccount('tenant-admin').email,
        password: ctx.adminPassword,
        tenantId: ctx.tenant,
      }),
      { headers: JSON_HEADERS, tags: { class: 'teardown', name: 're-login' } },
    );
    if (refreshed.status === 200 || refreshed.status === 201) {
      ctx.adminToken = safeJson(refreshed)?.accessToken ?? ctx.adminToken;
    }
  }

  if (ctx.apiKey?.id) {
    // Signature is del(url, body, params): passing the headers object as the BODY would send the
    // request unauthenticated and fail with 401 while looking like a revoked session.
    const response = http.del(`${origin}/admin/api-keys/${ctx.apiKey.id}`, null, {
      headers: bearerHeaders(ctx.adminToken, { 'x-tenant-id': ctx.tenant }),
      tags: { class: 'teardown', name: 'delete api key' },
    });
    if (response.status >= 300) {
      console.error(
        `teardown: could not delete the stress API key ${ctx.apiKey.id} (HTTP ${response.status})`,
      );
    }
  }

  if (ctx.automationId) {
    const action = ctx.automationOriginallyActive ? 'activate' : 'deactivate';
    http.post(`${origin}/automations/${ctx.automationId}/${action}`, null, {
      headers: bearerHeaders(ctx.adminToken, { 'x-tenant-id': ctx.tenant }),
      tags: { class: 'teardown', name: `restore automation ${action}` },
    });
  }

  for (const [label, session] of [
    ['admin', ctx.adminToken],
    ['member', ctx.memberToken],
    ['super', ctx.superToken],
  ]) {
    if (!session) continue;
    const response = http.post(`${origin}/auth/logout`, null, {
      headers: bearerHeaders(session),
      tags: { class: 'teardown', name: `logout ${label}` },
    });
    if (response.status >= 300) {
      console.error(`teardown: ${label} logout returned ${response.status}`);
    }
  }
}
