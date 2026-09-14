import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PLATFORM_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const PLATFORM_ADMIN_EMAIL =
  process.env.PLATFORM_ADMIN_EMAIL ?? 'superadmin@iot.local';
const PLATFORM_ADMIN_PASSWORD =
  process.env.PLATFORM_ADMIN_PASSWORD ?? 'SuperAdmin123!';

async function main() {
  console.log('Seeding initial data...');

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

  const passwordHash = await argon2.hash(PLATFORM_ADMIN_PASSWORD);

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
