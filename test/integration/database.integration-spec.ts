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
