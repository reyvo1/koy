import { randomUUID } from 'node:crypto';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import { AdminOperationsModule } from '../../src/admin-operations/admin-operations.module';
import { AuthModule } from '../../src/auth/auth.module';
import { RedisModule } from '../../src/redis/redis.module';
import { createTestApplication } from '../support/create-test-application';

const JWT_SECRET = 'admin-directory-integration-secret';

describe('Admin directory HTTP and PostgreSQL integration', () => {
  const prisma = new PrismaClient();
  const previousJwtSecret = process.env.JWT_SECRET;

  let app: NestFastifyApplication;
  let tenantId: string;
  let adminUserId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    await prisma.$connect();

    const tenant = await prisma.tenant.create({
      data: { name: `admin-directory-${randomUUID()}` },
    });
    tenantId = tenant.id;
    // Platform directory endpoints now require the platform-scope role.
    adminUserId = await createUserWithMembership(
      tenantId,
      'PLATFORM_ADMIN',
      'ACTIVE',
    );
    await prisma.user.create({
      data: { email: `${randomUUID()}@example.test`, tenantId },
    });

    app = await createTestApplication({
      moduleMetadata: { imports: [AuthModule, AdminOperationsModule, RedisModule] },
    });
    await app.init();
  });

  afterAll(async () => {
    delete process.env.JWT_SECRET;
    if (previousJwtSecret !== undefined) {
      process.env.JWT_SECRET = previousJwtSecret;
    }
    // Memberships/users reference the tenant (Restrict) — delete in FK order.
    await prisma.membership.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
    await app.close();
  });

  it('lists tenants with bounded counts for an authenticated ADMIN', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    const mine = body.items.find((t: { id: string }) => t.id === tenantId);
    expect(mine).toMatchObject({
      status: 'ACTIVE',
      userCount: 2,
    });
    expect(typeof mine.deviceCount).toBe('number');
    expect(typeof mine.createdAt).toBe('string');
  });

  it('lists only the trusted tenant users with derived roles', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
    const adminEmail = (await prisma.user.findUnique({
      where: { id: adminUserId },
    }))?.email;
    const adminRow = body.items.find(
      (u: { email: string }) => u.email === adminEmail,
    );
    expect(adminRow.role).toBe('PLATFORM_ADMIN');
    expect(adminRow.isVerified).toBe(false);
  });

  it('rejects unauthenticated directory requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
    });
    expect(response.statusCode).toBe(401);
  });

  async function createUserWithMembership(
    selectedTenantId: string,
    role: 'ADMIN' | 'MEMBER' | 'PLATFORM_ADMIN',
    status: 'ACTIVE' | 'REVOKED',
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        tenantId: selectedTenantId,
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId: selectedTenantId, role, status },
    });
    return user.id;
  }

  function accessToken(userId: string): string {
    return sign({ sub: userId }, JWT_SECRET, { expiresIn: '5m' });
  }

  function adminHeaders() {
    return {
      authorization: `Bearer ${accessToken(adminUserId)}`,
      'x-tenant-id': tenantId,
    };
  }
});
