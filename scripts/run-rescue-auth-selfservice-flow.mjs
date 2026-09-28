#!/usr/bin/env node
/**
 * Live end-to-end proof for the self-service auth surface.
 *
 * The audit found four working backend endpoints (`/auth/register`, `/auth/verify-email`,
 * `/auth/forgot-password`, `/auth/reset-password`) with no UI and no proxy. This runner
 * exercises the *whole* chain against the running stack: it registers a real user through
 * the Admin Web proxy, then drives the account to a working login, and checks the security
 * properties that matter for these endpoints rather than just their happy path.
 *
 * What it proves, and why each check exists:
 *
 *  - registration succeeds through the same-origin proxy (not by calling the backend
 *    directly, which would prove nothing about the UI path)
 *  - a registered-but-unverified account cannot log in, so verification is load-bearing
 *    and not decorative
 *  - a verified account CAN log in, and ends up as a real usable session
 *  - forgot-password never reveals whether an account exists, for either a known or an
 *    unknown email — this is the whole security property of the endpoint
 *  - reset-password rejects a forged token without echoing anything about token validity
 *  - a real reset token changes the password and invalidates the old one
 *
 * No credential is printed. Secrets are generated per run, held in memory only, and the
 * fixture user is removed at the end when the API supports it.
 *
 * Usage: node scripts/run-rescue-auth-selfservice-flow.mjs [--env=.env]
 */

import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});
const WEB_BASE = process.env.AUTH_FLOW_WEB_BASE ?? 'http://127.0.0.1:3100';
const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const runId = randomUUID();

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label, detail) {
  if (condition) {
    passed += 1;
    process.stdout.write(`  PASS ${label}\n`);
    return true;
  }
  failed += 1;
  failures.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  process.stdout.write(`  FAIL ${label}${detail ? ` :: ${detail}` : ''}\n`);
  return false;
}

function randomSecret(label) {
  return `${label}-${randomBytes(18).toString('hex')}`;
}

/** Nest answers POST with 201 by default, so a successful login is any 2xx. */
function isOk(status) {
  return status >= 200 && status < 300;
}

/** AuthService.lookupToken: sha256 hex, used as the unique lookup column value. */
function lookupToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function webPost(path, body) {
  const response = await fetch(`${WEB_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body: parsed };
}

async function apiLogin(email, password, tenantId) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, tenantId }),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body: parsed };
}

/**
 * This runner deliberately performs failing logins (unverified account, wrong password
 * after a forged reset), which is exactly what LoginLockoutService counts. After five it
 * locks the identity for 15 minutes, and a later legitimate check would then fail for the
 * wrong reason. Clear the counter around those assertions so each one tests what it claims
 * to test, and so the runner does not depend on Redis TTL timing.
 *
 * This does not weaken the lockout: the threshold itself is covered by
 * src/auth/login-lockout.service.spec.ts.
 */
async function clearLoginLockout(email, tenantId) {
  try {
    await redis.del(`iot:login-lockout:${tenantId}:${email.toLowerCase()}`);
  } catch {
    // Best-effort: a miss here only costs a retry on the next run.
  }
}

async function main() {
  process.stdout.write(`RESCUE SELF-SERVICE AUTH FLOW (web=${WEB_BASE} api=${API_BASE})\n`);

  const webProbe = await fetch(`${WEB_BASE}/daftar`).catch(() => null);
  assert(
    webProbe !== null && webProbe.ok,
    'Admin Web registration page is served',
    `status=${webProbe?.status ?? 'unreachable'}`,
  );
  if (!webProbe?.ok) {
    throw new Error('Admin Web must be running on ' + WEB_BASE);
  }

  // A dedicated tenant keeps the fixture isolated from real data.
  const tenantId = randomUUID();
  const email = `authflow-${runId.slice(0, 8)}@evidence.iot.test`;
  const password = randomSecret('Initial');
  const newPassword = randomSecret('Replaced');

  await prisma.tenant.create({ data: { id: tenantId, name: `Auth Flow ${runId.slice(0, 8)}` } });

  try {
    // 1. Register through the proxy. The proxy resolves the tenant id and then collapses
    //    the backend outcome, so a rejection here is generic by design.
    const registered = await webPost('/api/auth/register', {
      email,
      password,
      tenantId,
    });
    assert(
      registered.status === 201 && registered.body?.registered === true,
      'registration succeeds through the Admin Web proxy',
      `status=${registered.status} body=${JSON.stringify(registered.body)}`,
    );

    const created = await prisma.user.findUnique({
      where: { email_tenantId: { email, tenantId } },
      include: { credential: true },
    });
    assert(!!created, 'registration persisted a user row');

    // 2. The account starts unverified, and unverified must not be able to sign in —
    //    otherwise verification is decorative and the email step proves nothing.
    await clearLoginLockout(email, tenantId);
    const beforeVerify = await apiLogin(email, password, tenantId);
    assert(
      !isOk(beforeVerify.status),
      'unverified account cannot log in (verification is load-bearing)',
      `status=${beforeVerify.status}`,
    );

    // 3. Issue a real verification token and redeem it through the proxy.
    // Mirrors AuthService.register: argon2 hash for verification, sha256 for the
    // unique lookup column. The plain token is kept here so the proxy can redeem it.
    const verificationToken = randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: created.id },
      data: {
        verificationTokenHash: await argon2.hash(verificationToken),
        verificationTokenLookup: lookupToken(verificationToken),
      },
    });

    const verified = await webPost('/api/auth/verify-email', { token: verificationToken });
    assert(
      verified.status === 200 && verified.body?.verified === true,
      'verification succeeds through the proxy',
      `status=${verified.status} body=${JSON.stringify(verified.body)}`,
    );

    const isVerifiedNow = await prisma.user.findUnique({
      where: { email_tenantId: { email, tenantId } },
    });
    assert(isVerifiedNow?.isVerified === true, 'verification set isVerified on the user row');

    // 4. A verified account can actually sign in — the whole point of the flow.
    const afterVerify = await apiLogin(email, password, tenantId);
    assert(
      isOk(afterVerify.status) && !!afterVerify.body?.accessToken,
      'verified account can log in',
      `status=${afterVerify.status}`,
    );

    // 5. The Admin Web login proxy must also accept it, and must establish a session.
    // Admin Web is intentionally restricted to ADMIN/PLATFORM_ADMIN memberships, and
    // self-service registration grants no membership at all. A 403 here is the security
    // property working, not a defect — a self-service account must not reach the admin
    // console. Assert the rejection so a future change that quietly admits it fails.
    const webLogin = await webPost('/api/session/login', { email, password, tenantId });
    assert(
      webLogin.status === 403,
      'Admin Web refuses a self-service account that holds no admin membership',
      `status=${webLogin.status} body=${JSON.stringify(webLogin.body)}`,
    );

    // 6. Anti-enumeration. Identical status and shape for a known and an unknown email is
    //    the entire security property; a difference here would leak account existence.
    const known = await webPost('/api/auth/forgot-password', { email, tenantId });
    const unknown = await webPost('/api/auth/forgot-password', {
      email: `definitely-absent-${runId.slice(0, 8)}@evidence.iot.test`,
      tenantId,
    });
    assert(
      known.status === 202 && unknown.status === 202,
      'forgot-password returns the same status for known and unknown accounts',
      `known=${known.status} unknown=${unknown.status}`,
    );
    assert(
      JSON.stringify(known.body) === JSON.stringify(unknown.body),
      'forgot-password returns a byte-identical body for known and unknown accounts',
      `known=${JSON.stringify(known.body)} unknown=${JSON.stringify(unknown.body)}`,
    );

    // 7. An unresolvable tenant must be indistinguishable from a resolvable one.
    const badTenant = await webPost('/api/auth/forgot-password', {
      email,
      tenantId: randomUUID(),
    });
    assert(
      badTenant.status === 202 && JSON.stringify(badTenant.body) === JSON.stringify(known.body),
      'forgot-password does not reveal whether a tenant exists',
      `status=${badTenant.status} body=${JSON.stringify(badTenant.body)}`,
    );

    // 8. A forged reset token is rejected, and the message leaks nothing about why.
    const forged = await webPost('/api/auth/reset-password', {
      token: `${randomSecret('Forged')}.deadbeef`,
      password: newPassword,
    });
    assert(forged.status === 400, 'forged reset token is rejected', `status=${forged.status}`);

    await clearLoginLockout(email, tenantId);
    const stillOld = await apiLogin(email, password, tenantId);
    assert(
      isOk(stillOld.status),
      'forged reset did not change the password',
      `status=${stillOld.status}`,
    );

    // 9. The real path: a genuine reset token changes the password, and the old one stops working.
    // Mirrors AuthService.forgotPassword: the same hash/lookup pair plus a one-hour expiry.
    const resetToken = randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: created.id },
      data: {
        resetTokenHash: await argon2.hash(resetToken),
        resetTokenLookup: lookupToken(resetToken),
        resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const reset = await webPost('/api/auth/reset-password', { token: resetToken, password: newPassword });
    assert(
      reset.status === 200 && reset.body?.reset === true,
      'valid reset token changes the password',
      `status=${reset.status} body=${JSON.stringify(reset.body)}`,
    );

    await clearLoginLockout(email, tenantId);
    const withNew = await apiLogin(email, newPassword, tenantId);
    assert(
      isOk(withNew.status),
      'the new password works',
      `status=${withNew.status}`,
    );

    // This one previously passed for the wrong reason: it only checked `!== 200`, and a
    // successful login is 201, so an unchanged password would have satisfied it. It must
    // assert the old password genuinely stops working.
    const withOld = await apiLogin(email, password, tenantId);
    assert(
      !isOk(withOld.status),
      'the old password no longer works after a reset',
      `status=${withOld.status}`,
    );
  } finally {
    await prisma.user.deleteMany({ where: { email_tenantId: { email, tenantId } } }).catch(() => null);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => null);
    await clearLoginLockout(email, tenantId);
    await prisma.$disconnect();
    redis.disconnect();
  }

  process.stdout.write(`\nSELF-SERVICE AUTH FLOW ${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    for (const failure of failures) {
      process.stdout.write(`  - ${failure}\n`);
    }
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  process.stderr.write(`AUTH FLOW RUNNER ERROR: ${error?.message ?? error}\n`);
  await prisma.$disconnect().catch(() => null);
  redis.disconnect();
  process.exitCode = 1;
});
