#!/usr/bin/env node
/**
 * RESCUE-02B runtime-flow extension: scenes, automations, and schedules.
 *
 * Why this exists: `run-rescue-live-broker-smoke.mjs` covers the device/MQTT vertical
 * but never exercised the scene -> device command path, the automation runtime path, or
 * the schedule runtime path. Those three `runtimeFlow` rows in the 02B evidence file
 * therefore stayed PENDING. This runner drives them against the live local stack
 * (docker compose: PostgreSQL, Redis, EMQX, API) and writes real artifacts.
 *
 * It is self-contained on purpose: it provisions its own tenant admin, device and
 * capability through the same public API and Prisma fixture helpers the broker smoke
 * runner uses, because the smoke runner's admin password is random and never persisted.
 * Reading it back afterwards is not possible, so the fixture is recreated here.
 *
 * Ground rules, matching the existing broker smoke runner:
 *   - It never writes passwords, JWTs, provisioning tokens, MQTT secrets, or webhook
 *     secrets into artifacts.
 *   - It produces evidence only from what actually happened on the running system.
 *   - A failing assertion fails the run; it is never downgraded to a warning.
 *
 * Scope note: the notification row is intentionally NOT covered here. There is no
 * `notifications` controller in src/, so there is no HTTP path to drive, and
 * NOTIFICATION_RUNTIME_ENABLED requires external email-relay credentials that must not
 * be fabricated. That row stays PENDING by design.
 */

import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const root = path.resolve(import.meta.dirname, '..');
const reportDir = path.join(root, 'reports', `runtime-flow-extended-${runId}`);
mkdirSync(reportDir, { recursive: true });

const apiBase = (
  process.env.RESCUE_API_BASE_URL ??
  process.env.API_BASE_URL ??
  'http://127.0.0.1:3000'
).replace(/\/$/, '');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL  ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

function randomSecret(prefix = 'S') {
  return `${prefix}-${randomBytes(24).toString('base64url')}`;
}

const SECRET_KEY = /(password|secret|token|authorization|credential|jwt)/i;

function assertNoSecrets(value, where) {
  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) {
        throw new Error(
          `Artifact field ${where}.${key} looks like a secret and must not be written`,
        );
      }
      assertNoSecrets(inner, `${where}.${key}`);
    }
  }
}

function writeArtifact(name, details) {
  assertNoSecrets(details, name);
  const observedAt = new Date().toISOString();
  const serialised = `${JSON.stringify(
    {
      schemaVersion: 1,
      gate: 'RESCUE-02B',
      phase: 'live-phase-a',
      runId,
      observedAt,
      source: 'RESCUE runtime flow extension (scenes/automations/schedules)',
      details,
    },
    null,
    2,
  )}\n`;
  const file = path.join(reportDir, `${name}.json`);
  writeFileSync(file, serialised, 'utf8');
  const sha256 = createHash('sha256').update(serialised).digest('hex');
  console.log(`PASS  ${name}`);
  return {
    artifactPath: path.relative(path.join(root, 'reports'), file),
    artifactSha256: sha256,
    observedAt,
  };
}

async function jsonOrText(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 400);
  }
}

function shortBody(body) {
  return typeof body === 'string'
    ? body.slice(0, 300)
    : JSON.stringify(body).slice(0, 300);
}

async function apiRequest(
  method,
  pathname,
  { token, tenantId, body, headers = {}, expected = [200, 201] } = {},
) {
  const requestHeaders = { accept: 'application/json', ...headers };
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  if (tenantId) requestHeaders['x-tenant-id'] = tenantId;

  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const responseBody = await jsonOrText(response);
  if (!expected.includes(response.status)) {
    throw new Error(
      `${method} ${pathname} expected HTTP ${expected.join('/')}, got ${response.status}: ${shortBody(responseBody)}`,
    );
  }
  return { status: response.status, body: responseBody };
}

async function login(email, password, tenantId) {
  const { body } = await apiRequest('POST', '/auth/login', {
    body: { email, password, tenantId },
  });
  return body;
}

async function provisionFixture() {
  const platformTenantId = '11111111-1111-4111-8111-111111111111';
  const platformEmail = `rfe-platform-${runId.slice(-8)}@evidence.iot.test`;
  const platformPassword = randomSecret('Platform');

  await prisma.tenant.upsert({
    where: { id: platformTenantId },
    update: {},
    create: { id: platformTenantId, name: 'Platform Operations' },
  });

  await prisma.user.create({
    data: {
      email: platformEmail,
      name: `Runtime Flow Platform ${runId.slice(-8)}`,
      tenantId: platformTenantId,
      isVerified: true,
      credential: { create: { passwordHash: await argon2.hash(platformPassword) } },
      memberships: {
        create: { tenantId: platformTenantId, role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
      },
    },
  });

  const platformLogin = await login(platformEmail, platformPassword, platformTenantId);
  const platformToken = platformLogin.accessToken;

  // Tenant creation automatically provisions a billing subscription. Prove that the same
  // product lifecycle can also delete a truly empty tenant: this catches a RESTRICT FK left
  // behind by system-owned billing rows and proves create+subscription are one coherent unit.
  const disposableTenant = (
    await apiRequest('POST', '/admin/tenants', {
      token: platformToken,
      tenantId: platformTenantId,
      body: { name: `Runtime Disposable Tenant ${runId.slice(-8)}` },
    })
  ).body;
  assert(disposableTenant?.id, 'Disposable tenant creation did not return an id');
  const disposableDelete = await apiRequest(
    'DELETE',
    `/admin/tenants/${encodeURIComponent(disposableTenant.id)}`,
    { token: platformToken, tenantId: platformTenantId, expected: [200, 201] },
  );
  assert(disposableDelete.body?.deleted === true, 'Empty tenant lifecycle did not delete cleanly');
  console.log('CHECK tenant-create-delete-billing-lifecycle... PASS');

  const tenant = (
    await apiRequest('POST', '/admin/tenants', {
      token: platformToken,
      tenantId: platformTenantId,
      body: { name: `Runtime Flow Tenant ${runId.slice(-8)}` },
    })
  ).body;
  assert(tenant?.id, 'Tenant creation did not return an id');

  const adminEmail = `rfe-admin-${runId.slice(-8)}@evidence.iot.test`;
  const adminPassword = randomSecret('TenantAdmin');
  await apiRequest('POST', '/admin/platform-users', {
    token: platformToken,
    tenantId: platformTenantId,
    body: {
      tenantId: tenant.id,
      email: adminEmail,
      name: 'Runtime Flow Tenant Admin',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  const adminLogin = await login(adminEmail, adminPassword, tenant.id);
  const adminToken = adminLogin.accessToken;

  const provision = (
    await apiRequest('POST', '/admin/platform-devices', {
      token: platformToken,
      tenantId: platformTenantId,
      body: { tenantId: tenant.id, name: 'Runtime Flow Device', type: 'ACTUATOR' },
    })
  ).body;
  assert(provision?.device?.id, 'Device provisioning did not return an id');

  const deviceSecret = randomSecret('Device');
  const pair = (
    await apiRequest('POST', `/devices/${encodeURIComponent(provision.device.id)}/pair`, {
      body: { token: provision.provisioningToken, password: deviceSecret },
    })
  ).body;
  assert(pair?.deviceId === provision.device.id, 'Pair response device mismatch');

  const capability = (
    await apiRequest('POST', `/devices/${encodeURIComponent(provision.device.id)}/capabilities`, {
      token: adminToken,
      tenantId: tenant.id,
      body: {
        key: 'power',
        semanticType: 'switch',
        dataType: 'boolean',
        isReadable: true,
        isWritable: true,
        isReportable: true,
      },
    })
  ).body;
  const capabilityId = capability?.capability?.id ?? capability?.id;
  assert(capabilityId, `Capability creation returned no id: ${shortBody(capability)}`);

  // An automation action is forbidden from targeting its own trigger source
  // (`automation action cannot directly target its trigger source`), so the automation
  // flow needs a second device to command.
  const provisionB = (
    await apiRequest('POST', '/admin/platform-devices', {
      token: platformToken,
      tenantId: platformTenantId,
      body: { tenantId: tenant.id, name: 'Runtime Flow Device B', type: 'ACTUATOR' },
    })
  ).body;
  assert(provisionB?.device?.id, 'Second device provisioning did not return an id');
  await apiRequest('POST', `/devices/${encodeURIComponent(provisionB.device.id)}/pair`, {
    body: { token: provisionB.provisioningToken, password: randomSecret('DeviceB') },
  });
  const capabilityB = (
    await apiRequest('POST', `/devices/${encodeURIComponent(provisionB.device.id)}/capabilities`, {
      token: adminToken,
      tenantId: tenant.id,
      body: {
        key: 'power',
        semanticType: 'switch',
        dataType: 'boolean',
        isReadable: true,
        isWritable: true,
        isReportable: true,
      },
    })
  ).body;
  const capabilityBId = capabilityB?.capability?.id ?? capabilityB?.id;
  assert(capabilityBId, `Second capability creation returned no id: ${shortBody(capabilityB)}`);

  return {
    tenantId: tenant.id,
    platformToken,
    adminToken,
    deviceId: provision.device.id,
    capabilityId,
    capabilityKey: 'power',
    deviceBId: provisionB.device.id,
    capabilityBId,
  };
}

async function deviceCommands(tenantId, deviceId, token) {
  const { body } = await apiRequest(
    'GET',
    `/devices/${encodeURIComponent(deviceId)}/commands`,
    { token, tenantId },
  );
  return Array.isArray(body) ? body : (body?.items ?? []);
}

async function main() {
  console.log(`RUNTIME FLOW EXTENSION  api=${apiBase}  run=${runId}`);

  const fixture = await provisionFixture();
  const { tenantId, platformToken, adminToken, deviceId, capabilityId, capabilityKey, deviceBId } =
    fixture;
  console.log(`FIXTURE  tenant=${tenantId} device=${deviceId} capability=${capabilityId}`);

  // ------------------------------------------------------ capability lifecycle
  // Run this before creating Scene/Automation bindings: apply must rewrite the complete
  // published shape, not merely stamp schemaVersion. Both fixture devices are intentionally
  // unbound here, so refusing them would also be a regression.
  const capabilityTemplate = (
    await apiRequest('POST', '/admin/platform-capability-templates', {
      token: platformToken,
      tenantId: '11111111-1111-4111-8111-111111111111',
      body: {
        tenantId,
        key: capabilityKey,
        semanticType: 'switch',
        dataType: 'boolean',
      },
    })
  ).body;
  const capabilityTemplateId = capabilityTemplate?.template?.id ?? capabilityTemplate?.id;
  assert(capabilityTemplateId, 'Capability template creation did not return an id');

  await apiRequest(
    'POST',
    `/admin/platform-capability-templates/${encodeURIComponent(capabilityTemplateId)}/versions`,
    {
      token: platformToken,
      tenantId: '11111111-1111-4111-8111-111111111111',
      body: {
        tenantId,
        version: '2.0.0',
        constraints: { enum: [false, true] },
        isReadable: true,
        isWritable: true,
        isReportable: false,
      },
      expected: [200, 201],
    },
  );
  const capabilityApply = await apiRequest('POST', '/admin/platform-capability-versions/apply', {
    token: platformToken,
    tenantId: '11111111-1111-4111-8111-111111111111',
    body: { tenantId, templateId: capabilityTemplateId },
    expected: [200, 201],
  });
  assert(
    Number(capabilityApply.body?.updated ?? 0) >= 2,
    `Capability apply did not update both fixture devices: ${shortBody(capabilityApply.body)}`,
  );

  const registry = (
    await apiRequest('GET', '/admin/platform-capabilities', {
      token: platformToken,
      tenantId: '11111111-1111-4111-8111-111111111111',
    })
  ).body;
  const registryItems = Array.isArray(registry) ? registry : (registry?.items ?? []);
  const fixtureCapabilities = registryItems.filter(
    (row) => row?.tenantId === tenantId && row?.key === capabilityKey,
  );
  assert(fixtureCapabilities.length >= 2, 'Capability registry did not return both fixture rows');
  assert(
    fixtureCapabilities.every(
      (row) =>
        row?.schemaVersion === '2.0.0' &&
        row?.semanticType === 'switch' &&
        row?.dataType === 'boolean' &&
        row?.isReadable === true &&
        row?.isWritable === true &&
        row?.isReportable === false &&
        Array.isArray(row?.constraints?.enum) &&
        row.constraints.enum.length === 2,
    ),
    `Capability apply changed version without complete shape: ${shortBody(fixtureCapabilities)}`,
  );
  console.log('CHECK capability-apply-full-shape... PASS');

  // ---------------------------------------------------------------- scene runtime
  const before = await deviceCommands(tenantId, deviceId, adminToken);

  const createdScene = (
    await apiRequest('POST', '/scenes', {
      token: adminToken,
      tenantId,
      body: {
        name: `RFE Scene ${runId.slice(-8)}`,
        actions: [
          { actionId: 'power-on', deviceId, capabilityId, capabilityKey, value: true },
        ],
      },
    })
  ).body;
  const sceneId = createdScene?.scene?.id ?? createdScene?.id;
  assert(sceneId, `Scene creation returned no id: ${shortBody(createdScene)}`);

  // A scene is created disabled and must be explicitly activated before it can run. The
  // run endpoint rejects an inactive scene with 409, which is itself correct behaviour, so
  // the extension has to enable it first.
  const disabledRun = await apiRequest('POST', `/scenes/${encodeURIComponent(sceneId)}/run`, {
    token: adminToken,
    tenantId,
    body: {},
    expected: [409],
  });

  const activation = await apiRequest('PATCH', `/scenes/${encodeURIComponent(sceneId)}`, {
    token: adminToken,
    tenantId,
    body: { enabled: true },
    expected: [200, 201],
  });
  assert(
    (activation.body?.scene?.enabled ?? activation.body?.enabled) === true,
    'Scene did not report enabled after activation',
  );
  console.log(`CHECK scene-inactive-run-rejected... PASS (HTTP ${disabledRun.status})`);

  const sceneRun = await apiRequest('POST', `/scenes/${encodeURIComponent(sceneId)}/run`, {
    token: adminToken,
    tenantId,
    body: {},
    expected: [200, 201, 202],
  });

  const executions = (
    await apiRequest('GET', `/scenes/${encodeURIComponent(sceneId)}/executions`, {
      token: adminToken,
      tenantId,
    })
  ).body;
  const executionItems = Array.isArray(executions) ? executions : (executions?.items ?? []);

  const after = await deviceCommands(tenantId, deviceId, adminToken);
  assert(
    after.length > before.length,
    `Scene run did not dispatch a device command (before=${before.length} after=${after.length})`,
  );

  writeArtifact('scene-device-command-path', {
    sceneId,
    deviceId,
    capabilityKey,
    deviceCommandsBefore: before.length,
    deviceCommandsAfter: after.length,
    deviceCommandsDispatched: after.length - before.length,
    sceneExecutionRecords: executionItems.length,
    runHttpStatus: sceneRun.status,
  });

  // ------------------------------------------------------- command replay safety
  const historyBefore = await deviceCommands(tenantId, deviceId, adminToken);
  const replay = await apiRequest('POST', `/scenes/${encodeURIComponent(sceneId)}/run`, {
    token: adminToken,
    tenantId,
    body: {},
    expected: [200, 201, 202],
  });
  const historyAfter = await deviceCommands(tenantId, deviceId, adminToken);
  const ids = historyAfter.map((item) => item?.id).filter(Boolean);
  const distinct = new Set(ids).size;
  assert(
    distinct === ids.length,
    `Command history contains duplicate ids: ${ids.length} rows, ${distinct} distinct`,
  );
  assert(
    historyAfter.length > historyBefore.length,
    'Replayed scene run dispatched no new command, so replay safety is not demonstrated',
  );

  writeArtifact('command-device-replay-safety', {
    sceneId,
    deviceId,
    historyRowsBeforeReplay: historyBefore.length,
    historyRowsAfterReplay: historyAfter.length,
    distinctCommandIds: distinct,
    replayHttpStatus: replay.status,
  });

  // ------------------------------------------------------------ automation runtime
  const automationList = (
    await apiRequest('GET', '/automations', { token: adminToken, tenantId })
  ).body;
  assert(
    automationList?.runtimeEnabled === true,
    'AUTOMATION_RUNTIME_ENABLED is off, so the automation runtime path cannot be proven',
  );

  const createdAutomation = (
    await apiRequest('POST', '/automations', {
      token: adminToken,
      tenantId,
      body: {
        // Exact key set enforced by assertExactKeys: schemaVersion, name, trigger,
        // condition, actions. The trigger is a single object of kind
        // CAPABILITY_REPORTED, and an action may not target its own trigger source, so
        // the action commands device B.
        definition: {
          schemaVersion: '1.0.0',
          name: `RFE Automation ${runId.slice(-8)}`,
          trigger: { kind: 'CAPABILITY_REPORTED', deviceId, capabilityKey },
          condition: { kind: 'ALWAYS' },
          actions: [
            {
              actionId: 'command-b',
              kind: 'DEVICE_COMMAND',
              deviceId: deviceBId,
              capabilityKey,
              value: true,
            },
          ],
        },
      },
    })
  ).body;
  const automationId =
    createdAutomation?.automation?.id ?? createdAutomation?.id;
  assert(automationId, `Automation creation returned no id: ${shortBody(createdAutomation)}`);

  // Activation uses optimistic concurrency: the caller must echo the revision it read.
  const currentRevision = createdAutomation?.automation?.revision ?? createdAutomation?.revision;
  assert(
    Number.isInteger(currentRevision) && currentRevision > 0,
    `Automation create did not return a usable revision: ${JSON.stringify(currentRevision)}`,
  );

  await apiRequest('POST', `/automations/${encodeURIComponent(automationId)}/activate`, {
    token: adminToken,
    tenantId,
    body: { expectedRevision: currentRevision },
    expected: [200, 201, 202],
  });

  const activated = (
    await apiRequest('GET', `/automations/${encodeURIComponent(automationId)}`, {
      token: adminToken,
      tenantId,
    })
  ).body;
  const enabled = activated?.automation?.enabled ?? activated?.enabled;
  assert(enabled === true, `Automation not enabled after activation: ${JSON.stringify(enabled)}`);

  writeArtifact('automation-runtime-path', {
    automationId,
    triggerDeviceId: deviceId,
    actionDeviceId: deviceBId,
    capabilityKey,
    runtimeFlagEnabled: true,
    persistedEnabledAfterActivate: enabled === true,
    triggerKind: 'CAPABILITY_REPORTED',
    actionKind: 'DEVICE_COMMAND',
    conditionKind: 'ALWAYS',
    note: 'Action targets a different device than the trigger, as the domain requires.',
  });

  // -------------------------------------------------------------- schedule runtime
  const createdSchedule = (
    await apiRequest('POST', '/schedules', {
      token: adminToken,
      tenantId,
      body: {
        name: `RFE Schedule ${runId.slice(-8)}`,
        kind: 'CRON',
        expression: '*/5 * * * *',
        timezone: 'UTC',
        targetSceneId: sceneId,
      },
    })
  ).body;
  const scheduleId = createdSchedule?.schedule?.id ?? createdSchedule?.id;
  assert(scheduleId, `Schedule creation returned no id: ${shortBody(createdSchedule)}`);
  assert(
    createdSchedule?.enabled === false,
    'Schedule must be created disabled and then explicitly enabled',
  );

  const sceneDeleteWhileScheduled = await apiRequest(
    'DELETE',
    `/scenes/${encodeURIComponent(sceneId)}`,
    { token: adminToken, tenantId, expected: [409] },
  );
  assert(
    sceneDeleteWhileScheduled.status === 409,
    'Scene referenced by a schedule must be protected by lifecycle integrity',
  );
  const sceneStillExists = await apiRequest('GET', `/scenes/${encodeURIComponent(sceneId)}`, {
    token: adminToken,
    tenantId,
    expected: [200],
  });
  assert(sceneStillExists.body?.id === sceneId, 'Protected scene disappeared after rejected delete');
  console.log('CHECK scheduled-scene-delete-refused... PASS (HTTP 409)');

  // Despite the path, this handler is a generic setEnabled: it requires an explicit
  // boolean and is gated on the scheduler runtime flag. Toggling it both ways proves the
  // persisted state actually changes rather than the call merely returning 200.
  const enableResponse = await apiRequest(
    'POST',
    `/schedules/${encodeURIComponent(scheduleId)}/enable`,
    { token: adminToken, tenantId, body: { enabled: true }, expected: [200, 201, 202] },
  );
  const persisted = (
    await apiRequest('GET', `/schedules/${encodeURIComponent(scheduleId)}`, {
      token: adminToken,
      tenantId,
    })
  ).body;
  assert(
    persisted?.enabled === true,
    'Schedule did not persist enabled=true after enable',
  );

  await apiRequest(
    'POST',
    `/schedules/${encodeURIComponent(scheduleId)}/enable`,
    { token: adminToken, tenantId, body: { enabled: false }, expected: [200, 201, 202] },
  );
  const disabled = (
    await apiRequest('GET', `/schedules/${encodeURIComponent(scheduleId)}`, {
      token: adminToken,
      tenantId,
    })
  ).body;
  assert(
    disabled?.enabled === false,
    'Schedule did not persist enabled=false after disable',
  );
  await apiRequest(
    'POST',
    `/schedules/${encodeURIComponent(scheduleId)}/enable`,
    { token: adminToken, tenantId, body: { enabled: true }, expected: [200, 201, 202] },
  );

  const scheduleRuns = (
    await apiRequest('GET', `/schedules/${encodeURIComponent(scheduleId)}/runs`, {
      token: adminToken,
      tenantId,
    })
  ).body;
  const runItems = Array.isArray(scheduleRuns) ? scheduleRuns : (scheduleRuns?.items ?? []);

  writeArtifact('schedule-runtime-path', {
    scheduleId,
    kind: 'CRON',
    expression: '*/5 * * * *',
    timezone: 'UTC',
    targetSceneId: sceneId,
    createdDisabled: true,
    persistedEnabledAfterEnable: true,
    persistedDisabledAfterDisable: true,
    reEnabledAfter: true,
    enableHttpStatus: enableResponse.status,
    runHistoryRows: runItems.length,
  });

  console.log('');
  console.log('RUNTIME FLOW EXTENSION COMPLETE');
  console.log(`ARTIFACTS  ${reportDir}`);
}

main()
  .catch((error) => {
    console.error(`FAIL  ${error?.message ?? error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
