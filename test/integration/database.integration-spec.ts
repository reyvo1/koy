import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

interface CurrentSchemaRow {
  current_schema: string;
}

describe('PostgreSQL database integration foundation', () => {
  const schema = process.env.TEST_DATABASE_SCHEMA as string;
  const runId = process.env.TEST_RUN_ID ?? `local-${process.pid}`;
  const keyPrefix = `database-integration:${runId}:`;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.systemMetadata.deleteMany({
      where: {
        key: {
          startsWith: keyPrefix,
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('runs committed migrations inside the run-owned schema', async () => {
    const rows = await prisma.$queryRaw<CurrentSchemaRow[]>`
      SELECT current_schema() AS current_schema
    `;

    expect(rows).toEqual([{ current_schema: schema }]);

    const key = `${keyPrefix}migration-smoke`;
    const created = await prisma.systemMetadata.create({
      data: {
        key,
        value: 'created',
      },
    });

    expect(created.key).toBe(key);
    expect(
      await prisma.systemMetadata.findUnique({
        where: { key },
      }),
    ).toMatchObject({
      key,
      value: 'created',
    });
  });

  it('rejects a custom-role override whose role belongs to another tenant at the database boundary', async () => {
    const tenantA = await prisma.tenant.create({
      data: { name: `rbac-integrity-a-${randomUUID()}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { name: `rbac-integrity-b-${randomUUID()}` },
    });
    const userA = await prisma.user.create({
      data: {
        email: `${randomUUID()}@rbac-integrity.test`,
        tenantId: tenantA.id,
      },
    });
    const membershipA = await prisma.membership.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    const roleB = await prisma.customRole.create({
      data: {
        tenantId: tenantB.id,
        name: `cross-tenant-${randomUUID()}`,
        permissions: ['device.read'],
      },
    });

    await expect(
      prisma.membershipRoleOverride.create({
        data: {
          tenantId: tenantA.id,
          membershipId: membershipA.id,
          roleId: roleB.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await expect(
      prisma.membershipRoleOverride.count({
        where: {
          tenantId: tenantA.id,
          membershipId: membershipA.id,
          roleId: roleB.id,
        },
      }),
    ).resolves.toBe(0);
  });

  it('preserves transaction rollback semantics', async () => {
    const key = `${keyPrefix}rollback`;

    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.systemMetadata.create({
          data: {
            key,
            value: 'must-roll-back',
          },
        });

        throw new Error('rollback proof');
      }),
    ).rejects.toThrow('rollback proof');

    await expect(
      prisma.systemMetadata.findUnique({
        where: { key },
      }),
    ).resolves.toBeNull();
  });
});
