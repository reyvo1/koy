import { Prisma, PrismaClient } from '@prisma/client';

interface AggregationProbeRow {
  start: string;
  count: number;
  min: number;
  max: number;
  avg: number;
}

describe('PostgreSQL telemetry read-time aggregation', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRaw`
      DROP TABLE IF EXISTS "telemetry_aggregation_probe"
    `;
    await prisma.$executeRaw`
      CREATE TABLE "telemetry_aggregation_probe" (
        "tenantId" TEXT NOT NULL,
        "deviceId" TEXT NOT NULL,
        payload JSONB NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO "telemetry_aggregation_probe"
        ("tenantId", "deviceId", payload, "createdAt")
      VALUES
        ('tenant-1', 'device-1', '{"temperature":10}'::jsonb, TIMESTAMP '2026-07-18 00:05:00'),
        ('tenant-1', 'device-1', '{"temperature":20}'::jsonb, TIMESTAMP '2026-07-18 00:30:00'),
        ('tenant-1', 'device-1', '{"temperature":"ignored"}'::jsonb, TIMESTAMP '2026-07-18 00:45:00'),
        ('tenant-1', 'device-1', '{"humidity":50}'::jsonb, TIMESTAMP '2026-07-18 00:50:00'),
        ('tenant-1', 'device-1', '{"temperature":30}'::jsonb, TIMESTAMP '2026-07-18 01:10:00'),
        ('tenant-1', 'device-2', '{"temperature":90}'::jsonb, TIMESTAMP '2026-07-18 00:15:00'),
        ('tenant-2', 'device-1', '{"temperature":80}'::jsonb, TIMESTAMP '2026-07-18 00:20:00')
    `;
  });

  afterAll(async () => {
    await prisma.$executeRaw`
      DROP TABLE IF EXISTS "telemetry_aggregation_probe"
    `;
    await prisma.$disconnect();
  });

  async function aggregate(
    tenantId: string,
    deviceId: string,
    capabilityKey: string,
  ) {
    const query = Prisma.sql`
      WITH numeric_observations AS (
        SELECT
          date_bin(
            ${'1 hour'}::interval,
            "createdAt",
            TIMESTAMP '1970-01-01 00:00:00'
          ) AS bucket_start,
          (payload ->> (${capabilityKey}::text))::double precision AS value
        FROM "telemetry_aggregation_probe"
        WHERE "tenantId" = ${tenantId}
          AND "deviceId" = ${deviceId}
          AND "createdAt" >= (${'2026-07-18T00:00:00.000Z'}::timestamptz AT TIME ZONE 'UTC')
          AND "createdAt" < (${'2026-07-18T02:00:00.000Z'}::timestamptz AT TIME ZONE 'UTC')
          AND jsonb_typeof(payload -> (${capabilityKey}::text)) = 'number'
      )
      SELECT
        to_char(
          bucket_start,
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) AS "start",
        COUNT(*)::integer AS "count",
        MIN(value)::double precision AS "min",
        MAX(value)::double precision AS "max",
        AVG(value)::double precision AS "avg"
      FROM numeric_observations
      GROUP BY bucket_start
      ORDER BY bucket_start ASC
    `;

    return prisma.$queryRaw<AggregationProbeRow[]>(query);
  }

  it('buckets numeric JSON observations and skips mixed non-numeric values', async () => {
    await expect(
      aggregate('tenant-1', 'device-1', 'temperature'),
    ).resolves.toEqual([
      {
        start: '2026-07-18T00:00:00.000Z',
        count: 2,
        min: 10,
        max: 20,
        avg: 15,
      },
      {
        start: '2026-07-18T01:00:00.000Z',
        count: 1,
        min: 30,
        max: 30,
        avg: 30,
      },
    ]);
  });

  it('preserves tenant and device isolation in the aggregate query', async () => {
    const rows = await aggregate('tenant-1', 'device-2', 'temperature');

    expect(rows).toEqual([
      {
        start: '2026-07-18T00:00:00.000Z',
        count: 1,
        min: 90,
        max: 90,
        avg: 90,
      },
    ]);
  });

  it('returns no synthetic empty bucket or missing capability observation', async () => {
    await expect(aggregate('tenant-1', 'device-1', 'battery')).resolves.toEqual(
      [],
    );
  });
});
