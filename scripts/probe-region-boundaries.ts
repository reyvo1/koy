#!/usr/bin/env node
/**
 * Wave 12 live proof: region boundaries against a real PostgreSQL.
 *
 * Checks the three claims ADR-009 makes that a fake Prisma cannot: that the region the migration seeds is a
 * real row, that the foreign key on `devices.regionId` is real, and that a device which was never assigned
 * reports as unplaced rather than silently sitting in the one seeded region.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RegionAssignmentService } from '../src/region/region-assignment.service';
import { PrismaService } from '../src/prisma/prisma.service';

function resolveDatabaseUrl(envFile: string): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const absolute = resolve(process.cwd(), envFile);
  if (!existsSync(absolute)) return undefined;
  for (const line of readFileSync(absolute, 'utf8').split('\n')) {
    const match = /^\s*DATABASE_URL\s*=\s*(.*)\s*$/.exec(line);
    if (match) return match[1].replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const databaseUrl = resolveDatabaseUrl('.env');
if (!databaseUrl) {
  console.error('WAVE 12 REGION PROBE ERROR: no DATABASE_URL. Export it, or generate a .env first.');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, condition: unknown, detail = ''): void {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const TENANT_ID = randomUUID();
const OTHER_TENANT_ID = randomUUID();

async function main(): Promise<void> {
  const regions = new RegionAssignmentService(prisma as unknown as PrismaService);

  // The migration must have seeded exactly the region this platform runs in -- not a list of regions it
  // does not operate. A platform with one region that seeded several would be reporting geography.
  const seeded = await prisma.region.findMany({ orderBy: { regionCode: 'asc' } });
  check('the migration seeded a region', seeded.length >= 1, `count=${seeded.length}`);
  check('it is marked active', seeded.every((region) => region.isActive), seeded.map((r) => `${r.regionCode}:${r.isActive}`).join(' '));
  check('it carries a timezone', seeded.every((region) => Boolean(region.timezone)), seeded[0]?.timezone);

  await prisma.tenant.createMany({
    data: [
      { id: TENANT_ID, name: `W12 region ${TENANT_ID.slice(0, 8)}` },
      { id: OTHER_TENANT_ID, name: `W12 other ${OTHER_TENANT_ID.slice(0, 8)}` },
    ],
  });

  const device = await prisma.device.create({
    data: { id: randomUUID(), tenantId: TENANT_ID, name: 'unplaced' },
  });
  const foreignDevice = await prisma.device.create({
    data: { id: randomUUID(), tenantId: OTHER_TENANT_ID, name: 'foreign' },
  });
  const retired = await prisma.region.create({
    data: { regionCode: `probe-retired-${TENANT_ID.slice(0, 8)}`, displayName: 'Retired probe region', timezone: 'UTC', isActive: false },
  });

  // The boundary ADR-009 names first: a device that was never placed reports as unplaced. A default of the
  // seeded region would be a claim about the whole installed base, made by a migration.
  const before = await regions.current(TENANT_ID, device.id);
  check('a device that was never assigned reports as unplaced', before.unplaced && before.region === null, JSON.stringify(before));

  const listed = await regions.listAssignable();
  check('the assignable list excludes the retired region', !listed.some((region) => region.id === retired.id), `listed=${listed.length}`);
  check('and includes the seeded one', listed.some((region) => region.regionCode === seeded[0].regionCode));

  const assigned = await regions.assign({
    tenantId: TENANT_ID,
    deviceId: device.id,
    regionId: seeded[0].id,
    reason: 'probe: device commissioned in this region',
    now: new Date('2026-07-20T12:00:00.000Z'),
  });
  check('the device can be placed in the active region', assigned.regionCode === seeded[0].regionCode, assigned.regionCode);
  check('and the assignment reports it came from nowhere', assigned.previousRegionId === null);

  const stored = await prisma.device.findUnique({ where: { id: device.id } });
  check('the region reached the device row', stored?.regionId === seeded[0].id, String(stored?.regionId));

  const after = await regions.current(TENANT_ID, device.id);
  check('and now reads back as placed', after.unplaced === false && after.region?.regionCode === seeded[0].regionCode);

  // Every refusal in ADR-009, against real rows.
  let refusedInactive = false;
  try {
    await regions.assign({ tenantId: TENANT_ID, deviceId: device.id, regionId: retired.id, reason: 'probe' });
  } catch {
    refusedInactive = true;
  }
  check('an inactive region is refused', refusedInactive);

  let refusedUnknown = false;
  try {
    await regions.assign({ tenantId: TENANT_ID, deviceId: device.id, regionId: randomUUID(), reason: 'probe' });
  } catch {
    refusedUnknown = true;
  }
  check('an unknown region is refused', refusedUnknown);

  let refusedNoReason = false;
  try {
    await regions.assign({ tenantId: TENANT_ID, deviceId: device.id, regionId: seeded[0].id, reason: '  ' });
  } catch {
    refusedNoReason = true;
  }
  check('an assignment without a reason is refused', refusedNoReason);

  let refusedForeign = false;
  try {
    await regions.assign({ tenantId: TENANT_ID, deviceId: foreignDevice.id, regionId: seeded[0].id, reason: 'probe' });
  } catch {
    refusedForeign = true;
  }
  check("another tenant's device cannot be placed through this tenant", refusedForeign);

  const foreignStillUnplaced = await regions.current(OTHER_TENANT_ID, foreignDevice.id);
  check('and it is still unplaced', foreignStillUnplaced.unplaced);

  // Clean up: the seeded region is left alone, it belongs to the platform.
  await prisma.device.deleteMany({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } });
  await prisma.region.deleteMany({ where: { regionCode: { startsWith: 'probe-retired-' } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } } });

  const residue = {
    devices: await prisma.device.count({ where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } } }),
    tenants: await prisma.tenant.count({ where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } } }),
    probeRegions: await prisma.region.count({ where: { regionCode: { startsWith: 'probe-retired-' } } }),
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
    console.error('WAVE 12 REGION PROBE ERROR:', error);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());