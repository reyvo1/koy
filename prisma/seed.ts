import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Must match `scripts/seed-demo-accounts.mjs`, which owns the demo platform tenant. These
// two seeders disagreed: this file used 22222222…, the demo seeder used that same id for
// the *hotel* and 11111111… for the platform. The result was a PLATFORM_ADMIN membership
// inside a tenant named "Hotel Aurora" — cross-tenant authority living inside a customer
// tenant, which is exactly the shape of bug the tenant-isolation work exists to prevent.
//
// Ids are not hardcoded anywhere in src/ (the platform role is carried by the membership,
// not by a reserved tenant id), so this convention lives entirely in the seeders and has
// to match. Verified against the running database: demo.superadmin@iot.local is the
// working platform admin, and it belongs to 11111111….
const PLATFORM_TENANT_ID = '11111111-1111-4111-8111-111111111111';
const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? 'superadmin@iot.local';

// No default password. This script creates a PLATFORM_ADMIN — the one role that can reach
// every tenant — and a literal fallback would make `npx prisma db seed` against a
// production DATABASE_URL silently mint an account whose password is in this file. Failing
// loudly is the correct outcome for a missing secret; guessing one is not.
const PLATFORM_ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD;

function readPlatformAdminPassword(): string {
  if (!PLATFORM_ADMIN_PASSWORD) {
    throw new Error(
      'PLATFORM_ADMIN_PASSWORD is required. Set it in the environment before seeding ' +
        'the platform admin; this script will not fall back to a built-in password.',
    );
  }
  if (PLATFORM_ADMIN_PASSWORD.length < 12) {
    throw new Error(
      'PLATFORM_ADMIN_PASSWORD must be at least 12 characters. This account has ' +
        'cross-tenant authority, so a short password is not an acceptable default.',
    );
  }
  return PLATFORM_ADMIN_PASSWORD;
}

async function main() {
  console.log('Seeding initial data...');

  // Read before the first write so a missing secret cannot leave a half-created tenant
  // behind — the previous version hashed a fallback and created the admin unconditionally.
  const platformAdminPassword = readPlatformAdminPassword();

  const tenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000000' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Default Tenant',
    },
  });
  console.log(`Seeded tenant: ${tenant.name}`);

  // Platform operations tenant + super admin (idempotent).
  const platformTenant = await prisma.tenant.upsert({
    where: { id: PLATFORM_TENANT_ID },
    update: {},
    create: {
      id: PLATFORM_TENANT_ID,
      name: 'Platform Operations',
    },
  });

  // Every tenant gets a FREE subscription, so a seeded database is metered.
  //
  // `checkDeviceQuota` fails closed when no subscription row exists, which is the right
  // default — a control that silently allows everything is worse than one that denies. It
  // also means a seed that creates tenants without subscriptions produces a database where
  // nothing can be provisioned and the Quotas screen has nothing to show. FREE is a seeded
  // plan with a real allowance, so this gives the seed a working meter.
  const freePlan = await prisma.billingPlan.findUnique({ where: { tier: 'FREE' } });
  if (!freePlan) {
    throw new Error(
      'Seeding stopped: the FREE billing plan is missing, so no tenant can be metered. ' +
        'Apply the migrations that create the plan rows before seeding.',
    );
  }
  for (const t of [tenant, platformTenant]) {
    await prisma.billingSubscription.upsert({
      where: { tenantId: t.id },
      update: {},
      // The unchecked scalar form, matching `BillingQuotaService.ensureSubscription`. The
      // period is required by the schema and is a 30-day window, the same default the
      // service uses — a seed that wrote a different window would make the seeded data
      // disagree with what the application does for a tenant it creates itself.
      create: {
        tenantId: t.id,
        planId: freePlan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });
  }
  console.log('Seeded FREE subscriptions for both tenants');

  const admin = await prisma.user.upsert({
    where: {
      email_tenantId: {
        email: PLATFORM_ADMIN_EMAIL,
        tenantId: PLATFORM_TENANT_ID,
      },
    },
    update: { isVerified: true },
    create: {
      email: PLATFORM_ADMIN_EMAIL,
      name: 'Super Admin',
      tenantId: PLATFORM_TENANT_ID,
      isVerified: true,
    },
  });

  const passwordHash = await argon2.hash(platformAdminPassword);

  await prisma.userCredential.upsert({
    where: { userId: admin.id },
    update: { passwordHash },
    create: {
      userId: admin.id,
      passwordHash,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_tenantId: {
        userId: admin.id,
        tenantId: PLATFORM_TENANT_ID,
      },
    },
    update: { role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
    create: {
      userId: admin.id,
      tenantId: PLATFORM_TENANT_ID,
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log(`Seeded platform tenant: ${platformTenant.name}`);
  console.log(`Seeded super admin: ${PLATFORM_ADMIN_EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
