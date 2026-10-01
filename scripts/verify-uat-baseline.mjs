#!/usr/bin/env node
/**
 * Can the UAT baseline actually be logged into?
 *
 * The whole point of a UAT baseline is that the owner can open it and type the credentials.
 * Every previous baseline failed at exactly this step: the documented account did not exist,
 * the documented tenant did not exist, and the documented ports were wrong. A credential that
 * is only printed, never exercised, is an assumption.
 *
 * This probe reads `.uat-credentials` — the same file the operator is told to read — so it
 * fails if that file and the running product disagree.
 */
import { readFileSync } from 'node:fs';

const BASE = process.env.IOT_API ?? 'http://127.0.0.1:5000';
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  —  ${detail}`);
};

const text = readFileSync(process.env.UAT_CREDENTIALS ?? '.uat-credentials', 'utf8');
const accounts = text
  .split(/\n(?=\S)/)
  .map((block) => {
    const email = block.split('\n')[0]?.trim();
    if (!email || email.startsWith('#')) return null;
    return {
      email,
      tenantId: block.match(/^\s*tenant\s*:\s*(\S+)/m)?.[1],
      role: block.match(/^\s*role\s*:\s*(\S+)/m)?.[1],
      password: block.match(/^\s*password\s*:\s*(\S+)/m)?.[1],
    };
  })
  .filter(Boolean);

record('the credentials file lists accounts', accounts.length >= 3, `${accounts.length} accounts`);

for (const account of accounts) {
  if (!account.password || account.password.startsWith('(unknown')) {
    record(`${account.email} has a recorded password`, false, 'password missing from the file');
    continue;
  }
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: account.email,
      password: account.password,
      tenantId: account.tenantId,
    }),
  });
  const body = await res.json().catch(() => ({}));
  const ok = res.ok && !!body.accessToken && body.role === account.role;
  record(
    `${account.email} can log in as ${account.role}`,
    ok,
    ok ? `role ${body.role}` : `status ${res.status} ${body?.error?.code ?? ''}`,
  );
}

// The member must actually be able to do something, or half the checklist is unfollowable: a
// MEMBER with no role override is refused every permission-gated route.
const member = accounts.find((a) => a.role === 'MEMBER');
if (member) {
  const login = async (account) => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: account.password, tenantId: account.tenantId }),
    });
    return (await res.json()).accessToken;
  };

  const memberToken = await login(member);
  const asMember = (path, init = {}) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        authorization: `Bearer ${memberToken}`,
        'x-tenant-id': member.tenantId,
      },
    });

  const automations = await asMember('/automations');
  record('the UAT member is not permission-blocked everywhere', automations.status < 400, `GET /automations -> ${automations.status}`);

  const devicesRead = await asMember('/devices');
  record('the UAT member can read devices', devicesRead.status === 200, `GET /devices -> ${devicesRead.status}`);

  // Device creation is gated on `device.update`, not a create permission — a member should not
  // hold it, so this asserts the *refusal* is the correct one rather than assuming the member
  // provisions devices.
  const memberCreates = await asMember('/devices', {
    method: 'POST',
    body: JSON.stringify({ name: `uat-member-${Date.now().toString(36)}`, type: 'SENSOR' }),
  });
  record(
    'the UAT member is refused device creation, as intended',
    memberCreates.status === 403,
    `POST /devices -> ${memberCreates.status}`,
  );

  // The UAT tenant must be metered, or nobody can provision anything. That is the admin's job.
  const admin = accounts.find((a) => a.role === 'ADMIN');
  if (admin) {
    const adminToken = await login(admin);
    const asAdmin = (path, init = {}) =>
      fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          authorization: `Bearer ${adminToken}`,
          'x-tenant-id': admin.tenantId,
        },
      });
    const device = await asAdmin('/devices', {
      method: 'POST',
      body: JSON.stringify({ name: `uat-smoke-${Date.now().toString(36)}`, type: 'SENSOR' }),
    });
    record('the UAT admin can provision a device', device.status < 300, `POST /devices -> ${device.status}`);
    if (device.ok) {
      const created = await device.json().catch(() => ({}));
      const id = created?.device?.id ?? created?.id;
      if (id) {
        // The product has no DELETE /devices/:id, so revoke is the only way to retire it and
        // the only way this probe can leave the tenant as it found it.
        const revoked = await asAdmin(`/devices/${id}/revoke`, { method: 'PATCH' });
        record('and the device can be retired via revoke', revoked.ok, `PATCH /devices/:id/revoke -> ${revoked.status}`);
      }
    }
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) process.exitCode = 1;
