#!/usr/bin/env node
/**
 * Seeds the minimum entity graph the k6 function stress suite needs.
 *
 * The suite refuses to run against an empty platform: an endpoint with nothing behind it cannot be
 * stressed, and silently skipping it would manufacture coverage. That means the platform must own
 * real entities -- a device with a capability, a dashboard with a widget and a binding, an
 * automation, a scene, a schedule, a deliverable notification and at least one dispatched command.
 *
 * This script creates exactly that, in its own tenants, with deterministic ids so a re-run converges
 * instead of accumulating rows. It writes its credentials to `.stress-credentials` (git-ignored,
 * mode 0600) -- never to stdout, never to a document -- in the same block format the k6 suite
 * parses, because a stress run needs a credential to type, not a credential in the transcript.
 *
 * Usage:
 *   node scripts/seed-stress-baseline.mjs
 *   STRESS_ADMIN_PASSWORD=<operator-owned> STRESS_MEMBER_PASSWORD=<operator-owned> STRESS_SUPER_PASSWORD=<operator-owned> \
 *     node scripts/seed-stress-baseline.mjs
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { parseEnv } from './manage-rescue-local-runtime.mjs';

// Prisma reads DATABASE_URL from the environment, and the rescue runtime generates it into `.env`.
// Ambient values win over the file, matching every other step in that job; a missing value fails
// with the real cause instead of Prisma's schema-path error.
if (!process.env.DATABASE_URL) {
  const fromFile = parseEnv('.env').DATABASE_URL;
  if (fromFile) process.env.DATABASE_URL = fromFile;
}
if (!process.env.DATABASE_URL) {
  console.error(
    'STRESS SEED FAILED: no DATABASE_URL. Export it, or run `npm run rescue:env:init -- --output=.env` first.',
  );
  process.exit(1);
}

const CREDENTIALS_FILE = '.stress-credentials';

const TENANT_ID = '77777777-7777-4777-8777-777777777777';
const PLATFORM_TENANT_ID = '88888888-8888-4888-8888-888888888888';
const IDS = {
  superAdmin: '88888888-8888-4888-8888-0000000000a1',
  superMembership: '88888888-8888-4888-8888-0000000000b1',
  admin: '77777777-7777-4777-8777-0000000000a1',
  member: '77777777-7777-4777-8777-0000000000b1',
  adminMembership: '77777777-7777-4777-8777-0000000000c1',
  memberMembership: '77777777-7777-4777-8777-0000000000d1',
  device: '77777777-7777-4777-8777-0000000000e1',
  capability: '77777777-7777-4777-8777-0000000000f1',
  capabilityNumeric: '77777777-7777-4777-8777-0000000000f2',
  dashboard: '77777777-7777-4777-8777-000000000101',
  layout: '77777777-7777-4777-8777-000000000102',
  widget: '77777777-7777-4777-8777-000000000103',
  layoutItem: '77777777-7777-4777-8777-000000000104',
  binding: '77777777-7777-4777-8777-000000000105',
  automation: '77777777-7777-4777-8777-000000000201',
  automationAction: '77777777-7777-4777-8777-000000000202',
  scene: '77777777-7777-4777-8777-000000000301',
  sceneAction: '77777777-7777-4777-8777-000000000302',
  schedule: '77777777-7777-4777-8777-000000000401',
  notification: '77777777-7777-4777-8777-000000000501',
  command: '77777777-7777-4777-8777-000000000601',
};

const ADMIN_EMAIL = 'stress.admin@iot.local';
const MEMBER_EMAIL = 'stress.member@iot.local';
const SUPER_EMAIL = 'stress.superadmin@iot.local';

function password(envVar) {
  if (process.env[envVar]) return process.env[envVar];
  return randomBytes(18).toString('base64url');
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  const adminPassword = password('STRESS_ADMIN_PASSWORD');
  const memberPassword = password('STRESS_MEMBER_PASSWORD');
  const superPassword = password('STRESS_SUPER_PASSWORD');

  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: 'Stress Baseline' },
  });

  // The platform surfaces (/admin/platform-*) authorize against a PLATFORM_ADMIN membership, so the
  // super-admin identity lives in its own tenant exactly like the seeded platform admin does.
  await prisma.tenant.upsert({
    where: { id: PLATFORM_TENANT_ID },
    update: {},
    create: { id: PLATFORM_TENANT_ID, name: 'Stress Platform' },
  });

  await prisma.user.upsert({
    where: { id: IDS.superAdmin },
    update: {},
    create: {
      id: IDS.superAdmin,
      email: SUPER_EMAIL,
      name: 'Stress Super Admin',
      tenantId: PLATFORM_TENANT_ID,
      isVerified: true,
      credential: { create: { passwordHash: await argon2.hash(superPassword) } },
    },
  });

  await prisma.membership.upsert({
    where: { id: IDS.superMembership },
    update: {},
    create: {
      id: IDS.superMembership,
      tenantId: PLATFORM_TENANT_ID,
      userId: IDS.superAdmin,
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.user.upsert({
    where: { id: IDS.admin },
    update: {},
    create: {
      id: IDS.admin,
      email: ADMIN_EMAIL,
      name: 'Stress Admin',
      tenantId: TENANT_ID,
      isVerified: true,
      credential: { create: { passwordHash: await argon2.hash(adminPassword) } },
    },
  });

  await prisma.user.upsert({
    where: { id: IDS.member },
    update: {},
    create: {
      id: IDS.member,
      email: MEMBER_EMAIL,
      name: 'Stress Member',
      tenantId: TENANT_ID,
      isVerified: true,
      credential: { create: { passwordHash: await argon2.hash(memberPassword) } },
    },
  });

  await prisma.membership.upsert({
    where: { id: IDS.adminMembership },
    update: {},
    create: {
      id: IDS.adminMembership,
      tenantId: TENANT_ID,
      userId: IDS.admin,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  await prisma.membership.upsert({
    where: { id: IDS.memberMembership },
    update: {},
    create: {
      id: IDS.memberMembership,
      tenantId: TENANT_ID,
      userId: IDS.member,
      role: 'MEMBER',
      status: 'ACTIVE',
    },
  });

  // An upsert with `update: {}` keeps an existing account, so a re-run after a partial failure
  // would write a NEW password to .stress-credentials while the stored hash stayed the old one --
  // and the suite would fail with 401 against a credential the operator believes is current. The
  // stress baseline is disposable by design, so its three passwords are re-synchronized every run.
  await prisma.userCredential.upsert({
    where: { userId: IDS.superAdmin },
    update: { passwordHash: await argon2.hash(superPassword) },
    create: { userId: IDS.superAdmin, passwordHash: await argon2.hash(superPassword) },
  });
  await prisma.userCredential.upsert({
    where: { userId: IDS.admin },
    update: { passwordHash: await argon2.hash(adminPassword) },
    create: { userId: IDS.admin, passwordHash: await argon2.hash(adminPassword) },
  });
  await prisma.userCredential.upsert({
    where: { userId: IDS.member },
    update: { passwordHash: await argon2.hash(memberPassword) },
    create: { userId: IDS.member, passwordHash: await argon2.hash(memberPassword) },
  });

  await prisma.device.upsert({
    where: { id: IDS.device },
    update: {},
    create: {
      id: IDS.device,
      name: 'Stress Device',
      type: 'SENSOR',
      status: 'ACTIVE',
      tenantId: TENANT_ID,
      ownerId: IDS.admin,
    },
  });

  // A boolean capability: the Wave 1 lesson is that a boolean capability cannot back a GAUGE, so the
  // widget is a CARD and the dashboard stays resolvable instead of inventing an INVALID binding.
  await prisma.capability.upsert({
    where: { id: IDS.capability },
    update: {},
    create: {
      id: IDS.capability,
      deviceId: IDS.device,
      key: 'power',
      semanticType: 'power',
      dataType: 'boolean',
      isReadable: true,
      isWritable: true,
      isReportable: true,
    },
  });

  // A numeric sibling with two jobs: the aggregation endpoint refuses boolean capabilities (the
  // Wave 1 lesson again), and it gives the automation action a target that is not its own trigger
  // source (the domain validator refuses an action that targets the trigger it listens to).
  await prisma.capability.upsert({
    where: { id: IDS.capabilityNumeric },
    update: { isWritable: true },
    create: {
      id: IDS.capabilityNumeric,
      deviceId: IDS.device,
      key: 'power_consumption',
      semanticType: 'power',
      dataType: 'number',
      unit: 'W',
      isReadable: true,
      isWritable: true,
      isReportable: true,
    },
  });

  // Scalar foreign keys only: the database enforces the composite references anyway, and this
  // Prisma version's nested composite-connect form is not worth the confusion.
  await prisma.dashboard.upsert({
    where: { id: IDS.dashboard },
    update: {},
    create: {
      id: IDS.dashboard,
      tenantId: TENANT_ID,
      ownerMembershipId: IDS.adminMembership,
      name: 'Stress Dashboard',
      audience: 'PERSONAL',
    },
  });

  await prisma.dashboardLayout.upsert({
    where: { id: IDS.layout },
    update: {},
    create: {
      id: IDS.layout,
      tenantId: TENANT_ID,
      dashboardId: IDS.dashboard,
      breakpoint: 'DESKTOP',
      columns: 12,
      rowHeight: 80,
      gap: 12,
    },
  });

  await prisma.dashboardWidget.upsert({
    where: { id: IDS.widget },
    update: {},
    create: {
      id: IDS.widget,
      tenantId: TENANT_ID,
      dashboardId: IDS.dashboard,
      kind: 'CARD',
      title: 'Stress Power',
    },
  });

  await prisma.dashboardLayoutItem.upsert({
    where: { id: IDS.layoutItem },
    update: {},
    create: {
      id: IDS.layoutItem,
      tenantId: TENANT_ID,
      layoutId: IDS.layout,
      widgetId: IDS.widget,
      x: 0,
      y: 0,
      width: 4,
      height: 2,
    },
  });

  await prisma.dashboardWidgetBinding.upsert({
    where: { id: IDS.binding },
    update: {},
    create: {
      id: IDS.binding,
      tenantId: TENANT_ID,
      widgetId: IDS.widget,
      alias: 'power',
      intent: 'READ',
      mode: 'LATEST',
      deviceId: IDS.device,
      capabilityId: IDS.capability,
    },
  });

  // The persisted definition must satisfy the same validator the API runs on activation: the
  // action targets the numeric sibling (not the boolean trigger it listens to) and the value is
  // the primitive the numeric dataType expects. `update` carries the same shape so a re-seed on
  // an older database converges instead of leaving an unactivatable automation behind.
  await prisma.automation.upsert({
    where: { id: IDS.automation },
    update: { condition: { kind: 'ALWAYS' } },
    create: {
      id: IDS.automation,
      tenantId: TENANT_ID,
      ownerMembershipId: IDS.adminMembership,
      name: 'Stress Automation',
      enabled: false,
      triggerKind: 'CAPABILITY_REPORTED',
      triggerDeviceId: IDS.device,
      triggerCapabilityId: IDS.capability,
      condition: { kind: 'ALWAYS' },
      cooldownSeconds: 0,
    },
  });

  await prisma.automationAction.upsert({
    where: { id: IDS.automationAction },
    update: { capabilityId: IDS.capabilityNumeric, value: 120 },
    create: {
      id: IDS.automationAction,
      tenantId: TENANT_ID,
      automationId: IDS.automation,
      actionId: 'action-1',
      position: 0,
      kind: 'DEVICE_COMMAND',
      deviceId: IDS.device,
      capabilityId: IDS.capabilityNumeric,
      value: 120,
    },
  });

  await prisma.scene.upsert({
    where: { id: IDS.scene },
    update: {},
    create: {
      id: IDS.scene,
      tenantId: TENANT_ID,
      name: 'Stress Scene',
      enabled: false,
    },
  });

  await prisma.sceneAction.upsert({
    where: { id: IDS.sceneAction },
    update: {},
    create: {
      id: IDS.sceneAction,
      tenantId: TENANT_ID,
      sceneId: IDS.scene,
      actionId: 'action-1',
      position: 0,
      deviceId: IDS.device,
      capabilityId: IDS.capability,
      capabilityKey: 'power',
      value: { value: true },
    },
  });

  await prisma.schedule.upsert({
    where: { id: IDS.schedule },
    update: {},
    create: {
      id: IDS.schedule,
      tenantId: TENANT_ID,
      name: 'Stress Schedule',
      enabled: false,
      kind: 'CRON',
      expression: '0 3 * * *',
      timezone: 'UTC',
      targetSceneId: IDS.scene,
      repeat: 'INDEFINITE',
      missedRunPolicy: 'SKIP_TO_NEXT',
    },
  });

  await prisma.notification.upsert({
    where: { id: IDS.notification },
    update: {},
    create: {
      id: IDS.notification,
      tenantId: TENANT_ID,
      channel: 'EMAIL',
      subject: 'Stress baseline notification',
      body: 'Seeded so the notification detail function has a real row to read.',
      destination: 'stress@iot.local',
      status: 'SENT',
      idempotencyKey: `stress-baseline-notification-${IDS.notification}`,
      sentAt: new Date(),
    },
  });

  await prisma.deviceCommand.upsert({
    where: { id: IDS.command },
    update: {},
    create: {
      id: IDS.command,
      tenantId: TENANT_ID,
      deviceId: IDS.device,
      payload: { capabilityKey: 'power', value: true },
      status: 'PENDING',
    },
  });

  const lines = [
    '# k6 stress baseline credentials — generated by scripts/seed-stress-baseline.mjs',
    '# This file is git-ignored. Do not commit it, and do not paste it into a document.',
    `# Generated: ${new Date().toISOString()}`,
    '',
    ADMIN_EMAIL,
    `  tenant    : ${TENANT_ID}`,
    '  role      : ADMIN',
    `  password  : ${adminPassword}`,
    '  state     : seeded',
    '',
    MEMBER_EMAIL,
    `  tenant    : ${TENANT_ID}`,
    '  role      : MEMBER',
    `  password  : ${memberPassword}`,
    '  state     : seeded',
    '',
    SUPER_EMAIL,
    `  tenant    : ${PLATFORM_TENANT_ID}`,
    '  role      : PLATFORM_ADMIN',
    `  password  : ${superPassword}`,
    '  state     : seeded',
    '',
  ];
  const credentialsPath = resolve(process.cwd(), CREDENTIALS_FILE);
  writeFileSync(credentialsPath, lines.join('\n'));
  chmodSync(credentialsPath, 0o600);

  console.log(`Stress baseline seeded in tenant "Stress Baseline" (${TENANT_ID})`);
  console.log(`  ${ADMIN_EMAIL.padEnd(26)} ADMIN`);
  console.log(`  ${MEMBER_EMAIL.padEnd(26)} MEMBER`);
  console.log(`  ${SUPER_EMAIL.padEnd(26)} PLATFORM_ADMIN`);
  if (!process.env.STRESS_ADMIN_PASSWORD && !process.env.STRESS_MEMBER_PASSWORD) {
    console.log('  passwords generated and written to .stress-credentials (git-ignored, mode 0600)');
  }
  console.log(
    'entities: device + boolean capability, dashboard with widget/binding, automation, scene, ' +
      'schedule, notification, command',
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(`STRESS SEED FAILED: ${error.message}`);
    await prisma.$disconnect();
    process.exit(1);
  });
