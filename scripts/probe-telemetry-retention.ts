#!/usr/bin/env node
/**
 * Wave 10 live proof: telemetry retention and rollups against a real PostgreSQL.
 *
 * Writes telemetry at known timestamps, runs the real service, and checks the aggregates against values
 * computed by hand from the same rows. A mock cannot show that the SQL aggregation, the jsonb payload
 * unpacking and the bucket arithmetic actually agree with PostgreSQL.
 *
 * Everything it creates is tenant-scoped and removed afterwards; the residue check runs last and fails
 * the probe if anything survives.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { TelemetryRetentionService } from '../src/telemetry/telemetry-retention.service';

const prisma = new PrismaClient();
const results = [];

function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const TENANT_ID = randomUUID();
const DEVICE_ID = randomUUID();

async function main() {
  const retentionMs = 3_600_000; // one hour
  const bucketMs = 900_000; // fifteen minutes
  const now = new Date('2026-07-20T12:00:00.000Z');
  const cutoff = new Date(now.getTime() - retentionMs);

  await prisma.tenant.create({
    data: { id: TENANT_ID, name: `W10 retention ${TENANT_ID.slice(0, 8)}` },
  });
  await prisma.device.create({
    data: { id: DEVICE_ID, tenantId: TENANT_ID, name: 'probe-device' },
  });

  // Three samples inside one expiring bucket, one sample in a second bucket, one sample that is still
  // inside the retention window and must survive untouched.
  const samples = [
    { at: '2026-07-20T09:00:00.000Z', payload: { temp: 18 }, expired: true },
    { at: '2026-07-20T09:07:00.000Z', payload: { temp: 20 }, expired: true },
    { at: '2026-07-20T09:14:00.000Z', payload: { temp: 22, label: 'warm' }, expired: true },
    { at: '2026-07-20T09:20:00.000Z', payload: { temp: 30 }, expired: true },
    { at: '2026-07-20T11:50:00.000Z', payload: { temp: 25 }, expired: false },
  ];

  for (const [index, sample] of samples.entries()) {
    await prisma.telemetry.create({
      data: {
        tenantId: TENANT_ID,
        deviceId: DEVICE_ID,
        eventId: `w10-${TENANT_ID}-${index}`,
        payload: sample.payload,
        createdAt: new Date(sample.at),
      },
    });
  }

  const before = await prisma.telemetry.count({ where: { tenantId: TENANT_ID } });
  check('four expired samples and one live sample are present', before === samples.length, `count=${before}`);

  const service = new TelemetryRetentionService(prisma);
  const result = await service.rollupAndPrune({ tenantId: TENANT_ID, now, retentionMs, bucketMs });

  check(
    'the reported cut-off is exactly one retention window before now',
    result.cutoff.getTime() === cutoff.getTime(),
    `${result.cutoff.toISOString()}`,
  );
  check('four expired rows were pruned', result.rowsPruned === 4, `pruned=${result.rowsPruned}`);

  const after = await prisma.telemetry.count({ where: { tenantId: TENANT_ID } });
  check('the live sample survived the prune', after === 1, `remaining=${after}`);

  const rollups = await prisma.telemetryRollup.findMany({
    where: { tenantId: TENANT_ID },
    orderBy: { bucketStart: 'asc' },
  });

  check('two buckets were written', rollups.length === 2, `rollups=${rollups.length}`);

  const [first, second] = rollups;

  // Bucket one: 18, 20, 22 -> sum 60, min 18, max 22, count 3, last 22.
  // `label: 'warm'` is deliberately mixed into one payload: it must not be counted as a sample.
  check(
    'the first bucket holds the three samples from its window',
    first && first.sampleCount === 3 && first.valueSum === 60 && first.valueMin === 18 && first.valueMax === 22,
    first ? JSON.stringify({ n: first.sampleCount, sum: first.valueSum, min: first.valueMin, max: first.valueMax }) : 'missing',
  );
  check('the last value in the bucket is the newest sample', first && first.valueLast === 22, first ? `${first.valueLast}` : 'missing');
  check(
    'a non-numeric payload entry does not become its own sample',
    !rollups.some((row) => row.capabilityKey === 'label'),
  );
  check(
    'bucket start is aligned to the epoch, not to the run time',
    first && first.bucketStart.getTime() % bucketMs === 0,
    first ? `${first.bucketStart.toISOString()}` : 'missing',
  );
  check(
    'bucket end is exactly one bucket width after bucket start',
    first && second && first.bucketEnd.getTime() - first.bucketStart.getTime() === bucketMs,
    first && second ? `${first.bucketEnd.toISOString()}` : 'missing',
  );
  check('the second bucket holds the remaining sample', second && second.sampleCount === 1 && second.valueSum === 30);

  // A second pass over the same instant must not double anything: the raw rows are gone, so there is
  // nothing left to aggregate and the buckets must come back identical.
  const second_pass = await service.rollupAndPrune({ tenantId: TENANT_ID, now, retentionMs, bucketMs });
  const reread = await prisma.telemetryRollup.findMany({
    where: { tenantId: TENANT_ID },
    orderBy: { bucketStart: 'asc' },
  });

  check('a second pass writes no further buckets', second_pass.bucketsWritten === 0, `written=${second_pass.bucketsWritten}`);
  check(
    'a second pass leaves the aggregates unchanged',
    reread.length === 2 && reread[0].sampleCount === 3 && reread[0].valueSum === 60,
    JSON.stringify(reread.map((row) => [row.capabilityKey, row.sampleCount, row.valueSum])),
  );

  // A retention window that would swallow the live sample must refuse rather than quietly deleting it.
  let refused = false;
  try {
    await service.rollupAndPrune({ tenantId: TENANT_ID, now, retentionMs: -1, bucketMs });
  } catch (error) {
    refused = error instanceof RangeError;
  }
  check('a negative retention window is refused', refused);

  let unscoped = false;
  try {
    // @ts-expect-error -- deliberately calling without the tenant it now requires
    await service.rollupAndPrune({ now, retentionMs, bucketMs });
  } catch (error) {
    unscoped = error instanceof RangeError;
  }
  check('an unscoped retention run is refused', unscoped);

  // Clean up everything the probe created, then prove it is gone.
  await prisma.telemetry.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.telemetryRollup.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.device.delete({ where: { id: DEVICE_ID } });
  await prisma.tenant.delete({ where: { id: TENANT_ID } });

  const residue = {
    telemetry: await prisma.telemetry.count({ where: { tenantId: TENANT_ID } }),
    rollups: await prisma.telemetryRollup.count({ where: { tenantId: TENANT_ID } }),
    devices: await prisma.device.count({ where: { tenantId: TENANT_ID } }),
    tenants: await prisma.tenant.count({ where: { id: TENANT_ID } }),
  };
  const residueTotal = Object.values(residue).reduce((sum, count) => sum + count, 0);
  check('the probe leaves no residue', residueTotal === 0, JSON.stringify(residue));

  const failed = results.filter((entry) => !entry.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('WAVE 10 RETENTION PROBE ERROR:', error);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
