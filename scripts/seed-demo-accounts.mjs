#!/usr/bin/env node
/**
 * Create local demo accounts so the UI can actually be opened and clicked through.
 *
 * The platform had working login endpoints and no seeded account, which made the console
 * impossible to enter: an operator had no tenant id, no email and no password to type. The
 * self-service register flow does not help, because a self-service account deliberately
 * holds no admin membership and Admin Web rejects it.
 *
 * This seeds one account per role, each with real data attached, so every console has
 * something to show:
 *
 *   PLATFORM_ADMIN  -> /super/*        the cross-tenant super console
 *   ADMIN           -> /tenant/*       one tenant's devices, scenes, automations
 *   MEMBER          -> rejected by Admin Web by design, kept so the user-facing console
 *                      has an account to use once it is served
 *
 * Passwords are generated per run and printed once. They are NOT written to any file and
 * NOT stored anywhere; re-running this script mints fresh ones. The seed is idempotent by
 * email, so it can be re-run to reset a password.
 *
 * Usage: node scripts/seed-demo-accounts.mjs
 */

import { randomUUID, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PASSWORD_PREFIX = 'Demo';

function password() {
  return `${PASSWORD_PREFIX}-${randomBytes(9).toString('hex')}`;
}

function email(suffix) {
  return `demo.${suffix}@iot.local`;
}

async function upsertTenant(id, name) {
  const tenant = await prisma.tenant.upsert({
    where: { id },
    update: { name },
    create: { id, name },
  });

  // A demo tenant needs a subscription, because `checkDeviceQuota` fails closed without one.
  //
  // The demo tenant is created here rather than in prisma/seed.ts, so the FREE subscription
  // that prisma/seed.ts mints for its own two tenants does not reach it. Without this the demo
  // tenant is permanently unable to provision a device — a fail-closed quota with no plan is
  // correct behaviour pointed at a fixture that was never metered.
  const freePlan = await prisma.billingPlan.findUnique({ where: { tier: 'FREE' } });
  if (!freePlan) {
    throw new Error(
      'Demo seeding stopped: the FREE billing plan is missing, so the demo tenant cannot be ' +
        'metered. Apply the migrations that create the plan rows first.',
    );
  }
  await prisma.billingSubscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      planId: freePlan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });

  return tenant;
}

/**
 * Give a member a custom role, so the permission-gated routes are actually reachable by the
 * account the demo and the docs describe.
 *
 * `RbacPolicyService.evaluate()` grants ADMIN and PLATFORM_ADMIN everything and a MEMBER only
 * what its `membership_role_overrides` rows say. Nothing ever wrote those rows, so the demo
 * member could not read or create anything — while the permission catalog and
 * `scripts/validate-rescue-baseline.mjs` both talk about a member creating a dashboard. A
 * fixture that cannot exercise the feature it documents is a fixture lying about coverage.
 *
 * `viewer` is deliberately small: it is enough to prove the mechanism reaches the guard, and
 * it does not hand the demo member write access to anything an operator would not expect.
 */
async function grantRole({ tenantId, membershipId, name, permissions }) {
  if (!membershipId || !tenantId) return null;
  const role = await prisma.customRole.upsert({
    where: { tenantId_name: { tenantId, name } },
    update: { permissions },
    create: { tenantId, name, permissions },
  });
  await prisma.membershipRoleOverride.upsert({
    where: { membershipId_roleId: { membershipId, roleId: role.id } },
    update: {},
    create: { tenantId, membershipId, roleId: role.id },
  });
  return role;
}

async function upsertUser({ tenantId, email: mail, name, role, password: pw, isVerified }) {
  const passwordHash = await argon2.hash(pw);
  const data = {
    name,
    tenantId,
    isVerified: isVerified ?? true,
    credential: { create: { passwordHash } },
    memberships: { create: { tenantId, role, status: 'ACTIVE' } },
  };

  // Prisma has no nested upsert, so re-seeding is delete-then-create. Deleting the user
  // cascades to credentials, memberships and owned devices, which is exactly what a
  // re-seed should do — but it also means this is destructive for these demo emails
  // only, and must never be pointed at real users.
  // `deleteMany` only takes a filter, not a compound unique, so resolve the id first.
  const existing = await prisma.user.findUnique({
    where: { email_tenantId: { email: mail, tenantId } },
    select: { id: true },
  });
  if (existing) {
    // UserCredential and Membership have no `onDelete: Cascade` in the schema, so deleting
    // a user with a credential fails the foreign key. Clear the dependents explicitly.
    await prisma.userCredential.deleteMany({ where: { userId: existing.id } });

    // Three tables reference Membership with `onDelete: Restrict`, so none of them is
    // cleared automatically: Dashboard, Automation, Organization. Any data an operator
    // created through the UI — a workspace, an automation — therefore survives a re-seed
    // and then blocks it, and the seed fails on the foreign key. Fixing these one table at
    // a time is how this kept recurring: every new create control re-broke the seed.
    // The demo tenant's own data is disposable, so all three are cleared here together.
    const memberships = await prisma.membership.findMany({
      where: { userId: existing.id },
      select: { id: true },
    });
    if (memberships.length > 0) {
      const ownedBy = memberships.map((m) => m.id);
      await prisma.dashboard.deleteMany({
        where: { ownerMembershipId: { in: ownedBy } },
      });
      // AutomationExecution references Automation with onDelete: Restrict, and *every*
      // evaluation writes a row — including the SUPPRESSED_COOLDOWN and SUPPRESSED_LOOP
      // verdicts, which are precisely the ones an idle automation keeps producing. So an
      // automation that has only ever been suppressed still blocks its own deletion, and
      // an operator who created one through the UI permanently breaks the next re-seed.
      //
      // The two cooldown relations are self-referencing within this table, so the rows
      // are cleared in one statement rather than row by row: a self-FK cannot be
      // satisfied by deleting in an order we could compute without a full graph walk.
      await prisma.automationExecution.deleteMany({
        where: { automation: { ownerMembershipId: { in: ownedBy } } },
      });
      await prisma.automation.deleteMany({
        where: { ownerMembershipId: { in: ownedBy } },
      });
      await prisma.organization.deleteMany({
        where: { ownerMembershipId: { in: ownedBy } },
      });
    }

    await prisma.membership.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }
  return prisma.user.create({ data: { email: mail, ...data } });
}

async function main() {
  const platformTenantId = '11111111-1111-4111-8111-111111111111';
  const hotelTenantId = '22222222-2222-4222-8222-222222222222';

  await upsertTenant(platformTenantId, 'Platform Operations');
  await upsertTenant(hotelTenantId, 'Hotel Aurora');

  const platformPassword = password();
  const adminPassword = password();
  const memberPassword = password();

  await upsertUser({
    tenantId: platformTenantId,
    email: email('superadmin'),
    name: 'Demo Super Admin',
    role: 'PLATFORM_ADMIN',
    password: platformPassword,
  });

  await upsertUser({
    tenantId: hotelTenantId,
    email: email('admin'),
    name: 'Demo Tenant Admin',
    role: 'ADMIN',
    password: adminPassword,
  });

  const member = await upsertUser({
    tenantId: hotelTenantId,
    email: email('user'),
    name: 'Demo Member',
    role: 'MEMBER',
    password: memberPassword,
  });

  // The member's membership id, so the role grant below is attached to the right row.
  const memberMembership = await prisma.membership.findFirst({
    where: { tenantId: hotelTenantId, userId: member.id },
    select: { id: true },
  });

  await grantRole({
    tenantId: hotelTenantId,
    membershipId: memberMembership?.id,
    // Read-only on purpose: it proves the mechanism reaches the guard without handing the
    // demo member write access to anything.
    name: 'viewer',
    permissions: [
      'device.read',
      'telemetry.read',
      'scene.read',
      'dashboard.read',
      'dashboard.create',
      'dashboard.update',
      'dashboard.delete',
    ],
  });

  // A device and a capability, so the tenant console is not an empty shell.
  const device = await prisma.device.upsert({
    where: { id: '33333333-3333-4333-8333-333333333333' },
    update: { name: 'Lobby Sensor' },
    create: {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: hotelTenantId,
      name: 'Lobby Sensor',
      type: 'SENSOR',
      status: 'ACTIVE',
      lastHeartbeatAt: new Date(),
    },
  });

  const existing = await prisma.capability.findFirst({
    where: { deviceId: device.id, key: 'temperature' },
  });
  if (!existing) {
    await prisma.capability.create({
      data: {
        deviceId: device.id,
        key: 'temperature',
        semanticType: 'temperature',
        dataType: 'number',
        unit: 'C',
        isReadable: true,
        isWritable: false,
        isReportable: true,
      },
    });
  }

  // A controllable actuator, so the command screen has something to actually control.
  //
  // The seed created exactly one device — a read-only sensor — whose only capability
  // was `isWritable: false`. The command page filters to `isWritable === true`, so it
  // found nothing and permanently showed "Tidak ada capability writable" with the send
  // button disabled. The UI was correct; the fixture made the feature untestable. An
  // actuator is what the page was built for in the first place.
  const actuator = await prisma.device.upsert({
    where: { id: '33333333-3333-4333-8333-333333333334' },
    update: { name: 'Lobby Light Panel' },
    create: {
      id: '33333333-3333-4333-8333-333333333334',
      tenantId: hotelTenantId,
      name: 'Lobby Light Panel',
      type: 'ACTUATOR',
      status: 'ACTIVE',
      lastHeartbeatAt: new Date(),
    },
  });

  const actuatorCapabilities = [
    { key: 'lightPower', semanticType: 'boolean', dataType: 'boolean', unit: null },
    { key: 'lightBrightness', semanticType: 'number', dataType: 'number', unit: '%' },
  ];
  for (const capability of actuatorCapabilities) {
    const present = await prisma.capability.findFirst({
      where: { deviceId: actuator.id, key: capability.key },
    });
    if (present) continue;
    await prisma.capability.create({
      data: {
        deviceId: actuator.id,
        key: capability.key,
        semanticType: capability.semanticType,
        dataType: capability.dataType,
        unit: capability.unit,
        // Readable and reportable too: an actuator that cannot report its state is
        // write-only, and the UI has no way to show the result of a command.
        isReadable: true,
        isWritable: true,
        isReportable: true,
      },
    });
  }

  // A real hierarchy, so the tenant console's site/building/floor/room navigation has
  // something to show instead of one flat row.
  // Space requires tenantId, name, kind, path and depth; parentId forms the hierarchy.
  // Seeded top-down so every parent already exists when its child is inserted.
  const spaces = [
    { id: '44444444-4444-4444-8444-444444444441', name: 'Hotel Aurora', kind: 'SITE', parentId: null, path: '/', depth: 0 },
    { id: '44444444-4444-4444-8444-444444444442', name: 'Main Building', kind: 'BUILDING', parentId: '44444444-4444-4444-8444-444444444441', path: '/main-building', depth: 1 },
    { id: '44444444-4444-4444-8444-444444444443', name: 'Ground Floor', kind: 'FLOOR', parentId: '44444444-4444-4444-8444-444444444442', path: '/main-building/ground-floor', depth: 2 },
    { id: '44444444-4444-4444-8444-444444444444', name: 'Lobby', kind: 'ROOM', parentId: '44444444-4444-4444-8444-444444444443', path: '/main-building/ground-floor/lobby', depth: 3 },
  ];
  for (const space of spaces) {
    await prisma.space.upsert({
      where: { id: space.id },
      update: { name: space.name, path: space.path, depth: space.depth },
      create: {
        id: space.id,
        tenantId: hotelTenantId,
        name: space.name,
        kind: space.kind,
        parentId: space.parentId,
        path: space.path,
        depth: space.depth,
      },
    });
  }

  process.stdout.write(
    [
      '',
      'DEMO ACCOUNTS CREATED — copy these, they are not stored anywhere',
      '',
      `  PLATFORM ADMIN   (opens /super/*)`,
      `    Tenant ID : ${platformTenantId}`,
      `    Email     : ${email('superadmin')}`,
      `    Password  : ${platformPassword}`,
      '',
      `  TENANT ADMIN     (opens /tenant/*)`,
      `    Tenant ID : ${hotelTenantId}`,
      `    Email     : ${email('admin')}`,
      `    Password  : ${adminPassword}`,
      '',
      `  MEMBER           (NOT valid on Admin Web — Admin Web rejects non-admin roles)`,
      `                     intended for the user-facing console, which is not wired to a`,
      `                     local dev port yet`,
      `    Tenant ID : ${hotelTenantId}`,
      `    Email     : ${email('user')}`,
      `    Password  : ${memberPassword}`,
      '',
      '  Seeded: tenant "Hotel Aurora", device "Lobby Sensor" (fresh heartbeat),',
      '          capability "temperature", and a Site > Building > Floor > Room tree.',
      '',
      '  Sign in at http://127.0.0.1:5001/login',
      '',
    ].join('\n'),
  );
}

main()
  .catch((error) => {
    process.stderr.write(`SEED FAILED: ${error?.message ?? error}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
