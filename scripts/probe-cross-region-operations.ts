#!/usr/bin/env node
/**
 * Wave 12 live proof: cross-region operations reporting against a real PostgreSQL.
 *
 * The claim under test is a negative one: that an unplaced device makes the rollup report itself incomplete
 * instead of quietly shrinking the fleet. Only real rows and a real join can show that.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CrossRegionOperationsService } from '../src/analytics/cross-region-operations.service';
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
  console.error('WAVE 12 CROSS-REGION PROBE ERROR: no DATABASE_URL. Export it, or generate a .env first.');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, condition: unknown, detail = ''): void {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const TAG = randomUUID().slice(0, 8);
const TENANT_ID = randomUUID();
const OTHER_TENANT_ID = randomUUID();
const NOW = new Date('2026-09-10T12:00:00.000Z');

async function main(): Promise<void> {
  const ops = new CrossRegionOperationsService(prisma as unknown as PrismaService);

  const active = await prisma.region.findFirst({ where: { isActive: true }, orderBy: { regionCode: 'asc' } });
  const second = await prisma.region.findFirst({ where: { isActive: true, id: { not: active?.id } } });
  check('the platform has an active region to report on', Boolean(active), active?.regionCode);

  // A region that is deliberately not active, to prove it cannot absorb a device's findings.
  const retired = await prisma.region.create({
    data: { regionCode: `probe-retired-${TAG}`, displayName: 'Retired probe region', timezone: 'UTC', isActive: false },
  });

  await prisma.tenant.createMany({
    data: [
      { id: TENANT_ID, name: `W12 xr ${TAG}` },
      { id: OTHER_TENANT_ID, name: `W12 xr other ${TAG}` },
    ],
  });

  const inRegion = await prisma.device.create({ data: { id: randomUUID(), tenantId: TENANT_ID, name: `placed-${TAG}` } });
  const unplaced = await prisma.device.create({ data: { id: randomUUID(), tenantId: TENANT_ID, name: `unplaced-${TAG}` } });
  const inRetired = await prisma.device.create({ data: { id: randomUUID(), tenantId: TENANT_ID, name: `retired-${TAG}` } });
  const foreign = await prisma.device.create({ data: { id: randomUUID(), tenantId: OTHER_TENANT_ID, name: `foreign-${TAG}` } });

  await prisma.device.update({ where: { id: inRegion.id }, data: { regionId: active!.id } });
  await prisma.device.update({ where: { id: inRetired.id }, data: { regionId: retired.id } });

  const finding = (deviceId: string, severity: 'CRITICAL' | 'WARNING' | 'INFO') =>
    prisma.analyticsFinding.create({
      data: {
        tenantId: TENANT_ID,
        deviceId,
        capabilityKey: 'probe',
        kind: 'ANOMALY',
        severity,
        summary: `probe ${severity}`,
        confidence: 1,
        detectorVersion: 'probe',
        createdAt: new Date(NOW.getTime() - 60_000),
      },
    });

  await finding(inRegion.id, 'CRITICAL');
  await finding(inRegion.id, 'INFO');
  await finding(unplaced.id, 'WARNING');
  await finding(inRetired.id, 'INFO');

  // A finding from another tenant on another tenant's device. It must not appear anywhere in this rollup.
  await prisma.analyticsFinding.create({
    data: {
      tenantId: OTHER_TENANT_ID,
      deviceId: foreign.id,
      capabilityKey: 'probe',
      kind: 'ANOMALY',
      severity: 'CRITICAL',
      summary: 'other tenant',
      confidence: 1,
      detectorVersion: 'probe',
      createdAt: new Date(NOW.getTime() - 60_000),
    },
  });

  const rollup = await ops.summarise({ tenantId: TENANT_ID, now: NOW });

  const row = rollup.regions.find((region) => region.regionId === active!.id);
  check('the placed device findings land in its region', Boolean(row) && row!.findingCount === 2, row ? `count=${row.findingCount}` : 'no row');
  check('severity stays as counts', Boolean(row) && row!.bySeverity.CRITICAL === 1 && row!.bySeverity.INFO === 1 && row!.bySeverity.WARNING === 0, row ? JSON.stringify(row.bySeverity) : '');
  check('affected devices are counted separately from findings', Boolean(row) && row!.affectedDeviceCount === 1, row ? `devices=${row.affectedDeviceCount}` : '');
  check('the row carries its own code and timezone', Boolean(row) && row!.regionCode === active!.regionCode && Boolean(row!.timezone));

  // The core of the slice.
  check('the unplaced device is counted as unplaced', rollup.unplacedDeviceCount === 2, `count=${rollup.unplacedDeviceCount}`);
  check('and the rollup reports itself incomplete', rollup.complete === false);
  check('with a note saying the totals do not cover the fleet', /do not cover the whole fleet/.test(rollup.note ?? ''), rollup.note ?? '');
  check('and the retired region contributes nothing', rollup.regions.every((region) => region.regionId !== retired.id));

  const totalInRegions = rollup.regions.reduce((sum, region) => sum + region.findingCount, 0);
  check('region totals plus unplaced account for every finding', totalInRegions + rollup.unplacedDeviceCount === 4, `${totalInRegions} + ${rollup.unplacedDeviceCount}`);

  check("another tenant's finding does not appear", rollup.regions.every((region) => region.findingCount === 2));

  // A tenant whose devices are all placed reports complete.
  const cleanTenant = randomUUID();
  await prisma.tenant.create({ data: { id: cleanTenant, name: `W12 clean ${TAG}` } });
  const cleanDevice = await prisma.device.create({ data: { id: randomUUID(), tenantId: cleanTenant, name: 'clean' } });
  await prisma.device.update({ where: { id: cleanDevice.id }, data: { regionId: active!.id } });
  await prisma.analyticsFinding.create({
    data: {
      tenantId: cleanTenant,
      deviceId: cleanDevice.id,
      capabilityKey: 'probe',
      kind: 'ANOMALY',
      severity: 'INFO',
      summary: 'clean',
      confidence: 1,
      detectorVersion: 'probe',
      createdAt: new Date(NOW.getTime() - 60_000),
    },
  });
  const cleanRollup = await ops.summarise({ tenantId: cleanTenant, now: NOW });
  check('a fully placed fleet reports complete', cleanRollup.complete === true && cleanRollup.note === null, `unplaced=${cleanRollup.unplacedDeviceCount}`);
  // This platform runs exactly one active region, so asserting "some other region is listed here" would be
  // asserting an inventory this deployment does not have. The invariant is the honest one: the regions with
  // findings and the regions without must together be every active region, with nothing double-counted.
  const activeRegionTotal = await prisma.region.count({ where: { isActive: true } });
  check(
    'regions with findings plus regions without are every active region',
    cleanRollup.regions.length + cleanRollup.regionsWithoutFindings.length === activeRegionTotal,
    `${cleanRollup.regions.length} + ${cleanRollup.regionsWithoutFindings.length} vs ${activeRegionTotal}`,
  );
  check('and no region appears in both lists', !cleanRollup.regions.some((r) => cleanRollup.regionsWithoutFindings.some((o) => o.regionId === r.regionId)));

  // The unplaced list is actionable: it names devices, says why, and flags the never-reported ones.
  const list = await ops.unplacedDevices({ tenantId: TENANT_ID, now: NOW });
  check('the unplaced list names the devices', list.length === 2, list.map((entry) => entry.name).join(','));
  const reasons = list.map((entry) => entry.reason).sort();
  check('and says why each is unplaced', reasons.every((reason) => /never assigned|not active/.test(reason)), reasons.join(' | '));
  check('and flags devices that have never reported', list.every((entry) => entry.unobserved === true));

  // A device with no finding in the window must not appear in the actionable list.
  const quietTenant = randomUUID();
  await prisma.tenant.create({ data: { id: quietTenant, name: `W12 quiet ${TAG}` } });
  await prisma.device.create({ data: { id: randomUUID(), tenantId: quietTenant, name: 'quiet-unplaced' } });
  const quietList = await ops.unplacedDevices({ tenantId: quietTenant, now: NOW });
  check('a device with no findings is not in the actionable list', quietList.length === 0, `count=${quietList.length}`);

  // Findings outside the window are not counted.
  const staleRollup = await ops.summarise({ tenantId: TENANT_ID, sinceHours: 0.0001, now: NOW });
  check('findings outside the window are excluded', staleRollup.regions.every((region) => region.findingCount === 0), `total=${staleRollup.regions.reduce((s, r) => s + r.findingCount, 0)}`);

  const tenantIds = [TENANT_ID, OTHER_TENANT_ID, cleanTenant, quietTenant];
  await prisma.analyticsFinding.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.device.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.region.deleteMany({ where: { regionCode: `probe-retired-${TAG}` } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });

  const residue = {
    findings: await prisma.analyticsFinding.count({ where: { tenantId: { in: tenantIds } } }),
    devices: await prisma.device.count({ where: { tenantId: { in: tenantIds } } }),
    tenants: await prisma.tenant.count({ where: { id: { in: tenantIds } } }),
    regions: await prisma.region.count({ where: { regionCode: `probe-retired-${TAG}` } }),
  };
  const residueTotal = Object.values(residue).reduce((sum, count) => sum + count, 0);
  check('the probe leaves no residue', residueTotal === 0, JSON.stringify(residue));

  const failed = results.filter((entry) => !entry.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('WAVE 12 CROSS-REGION PROBE ERROR:', error);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());